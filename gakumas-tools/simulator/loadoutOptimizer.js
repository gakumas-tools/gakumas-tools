// Runs on its own worker so the simulator's pool stays free, and is stopped
// by terminating it.
export function compareLayoutsInWorker(input, { onProgress, signal }) {
  if (signal.aborted) return Promise.reject(signal.reason);
  const worker = new Worker(
    new URL("./loadoutOptimizerWorker.js", import.meta.url),
  );

  return new Promise((resolve, reject) => {
    function stop() {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    }
    function abort() {
      stop();
      reject(signal.reason);
    }

    signal.addEventListener("abort", abort);
    worker.addEventListener("error", (e) => {
      stop();
      reject(e.error || new Error(e.message || "Worker failed"));
    });
    worker.addEventListener("message", ({ data }) => {
      if (data.type == "progress") {
        onProgress(data.completed, data.total);
        return;
      }
      stop();
      if (data.type == "result") resolve(data.result);
      else reject(new Error(data.message));
    });
    worker.postMessage(input);
  });
}
