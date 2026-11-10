export const SYNC = false;
export const DEFAULT_NUM_RUNS = 2000;
export const MIN_BUCKET_SIZE = 1000;
export const MAX_WORKERS = 8;
export const MAX_CHUNK_SIZE = 100;
export const CHUNKS_PER_WORKER = 4;

export const WORKER_MESSAGE = {
  START: "start",
  CHUNK: "chunk",
  CHUNK_DONE: "chunkDone",
  FINISH: "finish",
  CANCEL: "cancel",
  RESULT: "result",
  ERROR: "error",
};
