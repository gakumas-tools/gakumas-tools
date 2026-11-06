import { useEffect, useState } from "react";

export default function usePersistedState(key, initial) {
  const [state, setState] = useState(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setState(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, [key, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state, loaded]);

  // `loaded` turns true once the stored value (if any) has been read.
  return [state, setState, loaded];
}
