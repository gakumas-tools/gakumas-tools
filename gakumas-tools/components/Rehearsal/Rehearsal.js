"use client";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FaCircleCheck,
  FaDownload,
  FaFileCsv,
  FaFileImage,
  FaPlus,
  FaTrashCan,
  FaTriangleExclamation,
  FaVideo,
} from "react-icons/fa6";
import Button from "@/components/Button";
import { BoxPlot, DistributionPlot } from "@/components/Charts";
import Collapse from "@/components/Collapse";
import Image from "@/components/Image";
import ProgressBar from "@/components/ProgressBar";
import { downloadBlob } from "@/utils/download";
import { bucketScores } from "@/utils/simulator";
import KofiAd from "../KofiAd";
import FileDropzone from "./FileDropzone";
import ScoreTiles from "./ScoreTiles";
import RehearsalTable from "./RehearsalTable";
import {
  buildBoxPlotData,
  computeStats,
  scoresForSelected,
} from "./rehearsalStats";
import useRehearsalParser from "./useRehearsalParser";
import styles from "./Rehearsal.module.scss";

function Rehearsal() {
  const t = useTranslations("Rehearsal");
  const {
    data,
    setData,
    clearData,
    handleFiles,
    progress,
    total,
    processingStatus,
  } = useRehearsalParser();
  const [selected, setSelected] = useState(null);

  const download = useCallback(() => {
    const csv = data
      .map((row) => row.scores.map((stage) => stage.join(",")).join(","))
      .join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), "rehearsal_data.csv");
  }, [data]);

  // Rows with at least one stage the OCR could not verify against the screen's
  // own stage-total checksum. Their values are kept and shown (never zeroed) but
  // highlighted in the table and excluded from the stats until the user reviews
  // them (edits a cell, or confirms the row with the ✓).
  const flaggedCount = useMemo(
    () => data.filter((r) => r.flags?.some((f) => f === "flagged")).length,
    [data],
  );

  const boxPlotData = useMemo(() => buildBoxPlotData(data), [data]);
  // Stable identity so BoxPlot's memo holds and the chart doesn't re-animate
  // on unrelated re-renders.
  const boxPlotLabels = useMemo(
    () =>
      [0, 1, 2].map((i) => t("stage", { n: i + 1 }) + ` (n=${data.length})`),
    [t, data.length],
  );

  const selectedData = useMemo(() => {
    if (selected == null) return null;
    const scores = scoresForSelected(boxPlotData, selected);
    const stats = computeStats(scores);
    if (!stats) return null;
    const { bucketedScores, bucketSize } = bucketScores(scores);
    return { scores, bucketedScores, bucketSize, ...stats };
  }, [selected, boxPlotData]);

  const [shownData, setShownData] = useState(null);
  const [statsBeat, setStatsBeat] = useState(0);
  if (selectedData && selectedData !== shownData) {
    setShownData(selectedData);
    setStatsBeat(statsBeat + 1);
  }

  const handleChartClick = useCallback(
    (x) => setSelected((cur) => (x === cur ? null : x)),
    [],
  );
  const handleRowDelete = useCallback(
    (i) =>
      setData((d) => {
        if (d[i]?.src) URL.revokeObjectURL(d[i].src);
        return d.filter((_, j) => j !== i);
      }),
    [],
  );
  const handleCellEdit = useCallback(
    (i, j, k, value) =>
      setData((d) =>
        d.map((row, ri) =>
          ri === i
            ? {
                ...row,
                scores: row.scores.map((stage, sj) =>
                  sj === j
                    ? stage.map((s, sk) => (sk === k ? value : s))
                    : stage,
                ),
                // Editing a value in a flagged stage resolves it: the user has
                // reviewed it, so clear that stage's flag (it rejoins the stats).
                flags: row.flags?.map((f, fj) => (fj === j ? "ok" : f)),
              }
            : row,
        ),
      ),
    [],
  );

  // Confirm a correct-but-flagged row as-is (no edit needed): clear all its
  // flagged stages, folding the values back into the stats.
  const handleVerifyRow = useCallback(
    (i) =>
      setData((d) =>
        d.map((row, ri) =>
          ri === i
            ? {
                ...row,
                flags: row.flags?.map((f) => (f === "flagged" ? "ok" : f)),
              }
            : row,
        ),
      ),
    [],
  );

  // Allow pasting screenshots directly from the clipboard.
  useEffect(() => {
    const onPaste = (e) => {
      if (e.clipboardData?.files.length) handleFiles(e.clipboardData.files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFiles]);

  return (
    <div className={styles.rehearsal}>
      <div className={styles.help}>
        <Image
          src="/rehearsal_parser_reference.png"
          width={120}
          height={120}
          alt=""
        />
        <p>
          {t("addScreenshots")}
          <br />
          <br />
          {t("accuracyNotGuaranteed")}
        </p>
      </div>

      <FileDropzone
        title={t("selectFiles")}
        hint={t("dropFiles")}
        accept="image/*,video/*,.csv,text/csv"
        multiple
        onFiles={handleFiles}
      >
        <span className={styles.formats} aria-hidden="true">
          <FaFileImage />
          <FaVideo />
          <FaFileCsv />
        </span>
      </FileDropzone>

      <Collapse open={progress != null}>
        <div className={styles.progress}>
          <div className={styles.progressLabel} aria-live="polite">
            <span>
              {processingStatus ||
                t("progress", { progress: progress ?? 0, total: total ?? "?" })}
            </span>
            {progress != null && progress === total && (
              <FaCircleCheck className={styles.done} />
            )}
          </div>
          <ProgressBar value={progress ?? 0} max={total ?? 0} />
        </div>
      </Collapse>

      <div className={styles.toolbar}>
        {flaggedCount > 0 && (
          <span className={styles.flaggedNotice}>
            <FaTriangleExclamation />
            {t("needsChecking", { count: flaggedCount })}
          </span>
        )}
        <Button
          style="default"
          size="sm"
          onClick={() => {
            if (confirm(t("confirmClear"))) clearData();
          }}
          disabled={!data.length}
        >
          <FaTrashCan /> {t("clear")}
        </Button>
        <Button
          style="default"
          size="sm"
          onClick={download}
          disabled={!data.length}
        >
          <FaDownload /> CSV
        </Button>
      </div>

      <BoxPlot labels={boxPlotLabels} data={boxPlotData} showLegend={false} />

      <Collapse open={!!selectedData}>
        {shownData && (
          <div className={styles.statsWrapper}>
            <ScoreTiles key={statsBeat} data={shownData} />
            <div className={styles.distribution}>
              <DistributionPlot
                label={`${t("score")} (n=${shownData.scores.length})`}
                data={shownData.bucketedScores}
                bucketSize={shownData.bucketSize}
                highlight={shownData.median}
              />
            </div>
          </div>
        )}
      </Collapse>

      <div className={styles.tableWrapper}>
        <RehearsalTable
          data={data}
          selected={selected}
          onChartClick={handleChartClick}
          onRowDelete={handleRowDelete}
          onCellEdit={handleCellEdit}
          onVerifyRow={handleVerifyRow}
        />
      </div>
      <button
        type="button"
        className={styles.addButton}
        aria-label={t("addRow")}
        onClick={() =>
          setData((d) => [
            ...d,
            {
              scores: [
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
              ],
              flags: ["ok", "ok", "ok"],
            },
          ])
        }
      >
        <FaPlus aria-hidden="true" />
      </button>

      <div className={styles.ad}>
        <KofiAd />
      </div>
    </div>
  );
}

export default memo(Rehearsal);
