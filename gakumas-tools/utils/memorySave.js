// What the memory editor should do when a save request returns. A save can
// finish after the editor has loaded a different memory (document changed)
// or after further edits to the same one (revision changed).
export function getSaveOutcome({
  savedDocument,
  currentDocument,
  savedRevision,
  currentRevision,
}) {
  // The editor now holds another memory: taking the saved id would point
  // its next save at the memory that was just saved.
  if (currentDocument != savedDocument) {
    return { applyId: false, saveState: null, clean: false };
  }
  // Same memory, but edited while saving: it has its id now, but the
  // latest edits aren't saved yet.
  if (currentRevision != savedRevision) {
    return { applyId: true, saveState: "unsaved", clean: false };
  }
  return { applyId: true, saveState: "saved", clean: true };
}
