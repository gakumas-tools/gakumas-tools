// In-memory stand-in for @/utils/mongodb, used by oshiStore.test.mjs.
// findOne reads the document when it's called but resolves only once
// `store.gate` (if set) resolves, like a slow read.
export const store = { doc: null, gate: null };

export async function connect() {
  return {
    db: {
      collection() {
        return {
          async findOne() {
            const snapshot = store.doc && structuredClone(store.doc);
            if (store.gate) await store.gate;
            return snapshot;
          },
          async replaceOne(_query, doc) {
            store.doc = structuredClone(doc);
          },
        };
      },
    },
  };
}
