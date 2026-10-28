import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DEBUG } from "@/utils/imageProcessing/common";
import { mapWithLimit } from "@/utils/mapWithLimit";
import { createWorkerPool } from "@/utils/workerPool";
import {
  bucketFiles,
  canvasToObjectURL,
  parseCsvFile,
  revokeRowSources,
} from "./rehearsalFiles";

let ocrModules = null;

function loadOcrModules() {
  ocrModules ??= Promise.all([
    import("tesseract.js"),
    import("@/utils/imageProcessing/rehearsal"),
    import("@/utils/imageProcessing/videoFrameExtractor"),
  ]).then(
    ([tesseract, rehearsal, video]) => ({
      ...tesseract,
      ...rehearsal,
      ...video,
    }),
    (err) => {
      ocrModules = null;
      throw err;
    },
  );
  return ocrModules;
}

const FRAME_INTERVAL_MS = 200;
const BRIGHTNESS_THRESHOLD = 180;

// A Tesseract worker's wasm heap grows to ~350 MB on an upscaled phone
// screenshot and never shrinks, so the pool is sized by memory, not cores.
function getOcrPoolSize() {
  const cap = matchMedia("(pointer: coarse)").matches ? 2 : 4;
  const byMemory = navigator.deviceMemory
    ? Math.floor(navigator.deviceMemory / 2)
    : cap;
  return Math.max(
    1,
    Math.min(cap, byMemory, navigator.hardwareConcurrency || 1),
  );
}

export default function useRehearsalParser() {
  const t = useTranslations("Rehearsal");

  const [total, setTotal] = useState(null);
  const [progress, setProgress] = useState(null);
  const [processingStatus, setProcessingStatus] = useState("");
  const [data, setData] = useState([]);
  const [icons, setIcons] = useState(null);
  const ocrPoolRef = useRef(null);
  const dataRef = useRef(data);
  const unmountedRef = useRef(false);
  const batchesRef = useRef(0);

  const getOcrPool = useCallback(() => {
    ocrPoolRef.current ??= createWorkerPool({
      size: getOcrPoolSize(),
      create: async () => (await loadOcrModules()).createWorker("eng", 1),
      destroy: (worker) => worker.terminate(),
    });
    return ocrPoolRef.current;
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      ocrPoolRef.current?.close();
      ocrPoolRef.current = null;
      revokeRowSources(dataRef.current);
    };
  }, []);

  const processVideo = useCallback(
    async (videoFile) => {
      setProcessingStatus(t("analyzingVideo"));
      // Frames are OCR'd while scanning continues. Capping the frames in
      // flight keeps peak memory flat however long the video is.
      const pool = getOcrPool();
      const scan = new AbortController();
      let found = 0;
      let scanStarted = false;
      let lastStatusAt = 0;
      const { streamCandidateFrames, getScoresFromImage } =
        await loadOcrModules();
      const frames = streamCandidateFrames(videoFile, {
        signal: scan.signal,
        intervalMs: FRAME_INTERVAL_MS,
        brightnessThreshold: BRIGHTNESS_THRESHOLD,
        onProgress: (analyzed, frameTotal) => {
          if (!scanStarted) {
            scanStarted = true;
            // The video was initially allocated 1 unit in the total; expand
            // that to `frameTotal` so the progress bar tracks per-frame.
            setTotal((cur) => cur + frameTotal - 1);
          }
          setProgress((p) => p + 1);
          // Throttle status updates to ~4/sec — seeking can fire every
          // ~50ms on desktop.
          const now = performance.now();
          if (now - lastStatusAt < 250 && analyzed !== frameTotal) return;
          lastStatusAt = now;
          setProcessingStatus(
            t("scanningVideo", {
              analyzed,
              total: frameTotal,
              found,
            }),
          );
        },
      });
      const scored = await mapWithLimit(
        frames,
        getOcrPoolSize() * 2,
        async (canvas) => {
          try {
            const { scores, flags, icons } = await pool.run((worker) =>
              getScoresFromImage(canvas, worker),
            );
            if (!scores?.some((stage) => stage.some((v) => v))) return null;
            found++;
            return {
              scores,
              flags,
              icons,
              src: await canvasToObjectURL(canvas),
            };
          } catch (err) {
            scan.abort(err);
            throw err;
          } finally {
            canvas.width = canvas.height = 0;
          }
        },
      );
      const results = scored.filter(Boolean);
      setProcessingStatus(t("videoComplete", { count: results.length }));
      return { results, scanStarted };
    },
    [getOcrPool, t],
  );

  const processImages = useCallback(
    async (imageFiles) => {
      const { getScoresFromFile } = await loadOcrModules();
      const pool = getOcrPool();
      const scored = await Promise.all(
        imageFiles.map(async (file) => {
          try {
            const { scores, flags, icons } = await pool.run((worker) =>
              getScoresFromFile(file, worker),
            );
            return (
              scores && {
                scores,
                flags,
                icons,
                src: URL.createObjectURL(file),
              }
            );
          } catch (err) {
            console.error(`Error parsing ${file.name}:`, err);
            return null;
          } finally {
            setProgress((p) => p + 1);
          }
        }),
      );
      const results = scored.filter(Boolean);
      return { results, failures: scored.length - results.length };
    },
    [getOcrPool],
  );

  const handleFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList);
      if (!files.length) return;
      const joining = batchesRef.current++ > 0;
      if (!joining) setProcessingStatus("");
      setTotal((cur) => (joining ? cur + files.length : files.length));
      setProgress((p) => (joining ? p : 0));

      const { csvs, videos, images } = bucketFiles(files);
      if (DEBUG) console.time("All results parsed");
      const results = [];

      // CSVs don't use the OCR worker pool, so they run alongside video/image OCR.
      const csvPromise = Promise.all(
        csvs.map((f) =>
          parseCsvFile(f).catch((err) => {
            console.error(`Error parsing CSV ${f.name}:`, err);
            return [];
          }),
        ),
      ).then((perFile) => {
        for (const rows of perFile) results.push(...rows);
        if (csvs.length) setProgress((p) => p + csvs.length);
      });

      // Videos and images share the OCR worker pool, so they run sequentially.
      const ocrPromise = (async () => {
        for (const videoFile of videos) {
          let scanStarted = false;
          try {
            const res = await processVideo(videoFile);
            results.push(...res.results);
            scanStarted = res.scanStarted;
          } catch (err) {
            console.error(`Error processing ${videoFile.name}:`, err);
            setProcessingStatus(t("videoError", { message: err.message }));
          }
          // If the scan never started (loadVideo error), close out the
          // video's 1-unit allocation here. Otherwise per-frame ticking
          // already covered it.
          if (!scanStarted) setProgress((p) => p + 1);
        }
        if (images.length) {
          const { results: imgResults, failures } = await processImages(images);
          results.push(...imgResults);
          if (failures) {
            setProcessingStatus(t("imageError", { count: failures }));
          }
        }
      })();

      try {
        await Promise.all([csvPromise, ocrPromise]);
      } finally {
        batchesRef.current--;
      }
      if (DEBUG) console.timeEnd("All results parsed");
      if (unmountedRef.current) {
        revokeRowSources(results);
        return;
      }
      const batchIcons = results.find((r) => r.icons)?.icons;
      if (batchIcons) setIcons(batchIcons);
      setData((d) => [...d, ...results.map(({ icons, ...row }) => row)]);
    },
    [processVideo, processImages, t],
  );

  return {
    data,
    setData,
    icons,
    handleFiles,
    progress,
    total,
    processingStatus,
  };
}
