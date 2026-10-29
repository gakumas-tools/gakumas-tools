import * as ort from "onnxruntime-web/wasm";

async function fetchClasses(classesPath) {
  const res = await fetch(classesPath);
  if (!res.ok) throw new Error(`Failed to load ${classesPath}: ${res.status}`);
  return res.json();
}

export function loadModel(
  modelPath,
  classesPath,
  createSession = (path) => ort.InferenceSession.create(path),
) {
  let promise;
  return () => {
    promise ??= Promise.all([
      createSession(modelPath),
      fetchClasses(classesPath),
    ]).then(
      ([session, classes]) => ({ session, classes }),
      (err) => {
        promise = null;
        throw err;
      },
    );
    return promise;
  };
}

export const loadSkillCardModel = loadModel(
  "/skill_card_model.onnx",
  "/skill_card_classes.json",
);

export const loadPItemModel = loadModel(
  "/p_item_model.onnx",
  "/p_item_classes.json",
);
