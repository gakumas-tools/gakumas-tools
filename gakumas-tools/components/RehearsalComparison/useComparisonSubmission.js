import { useCallback, useEffect, useState } from "react";
import { countUse } from "@/utils/countUse";
import { rehearsalGrid } from "@/utils/rehearsalComparison";

const ENDPOINT = "/api/rehearsal-comparison";

async function send(method, body) {
  try {
    const res = await fetch(ENDPOINT, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return res.ok;
  } catch (err) {
    console.error(err);
    return false;
  }
}

export default function useComparisonSubmission({
  run,
  enterPercents,
  rows,
  cell,
}) {
  const [shared, setShared] = useState(null);
  const [status, setStatus] = useState("idle");

  const isCurrent =
    shared?.run === run && shared?.rows === rows && shared?.cell === cell;
  const sameData = shared?.run === run && shared?.rows === rows;

  // Re-picking the cell means the shared pick was wrong, so withdraw it.
  useEffect(() => {
    if (shared && sameData && !isCurrent) {
      send("DELETE", { id: shared.id });
      setShared(null);
    }
  }, [shared, sameData, isCurrent]);

  useEffect(() => setStatus("idle"), [run, rows, cell]);

  const share = useCallback(async () => {
    if (!run?.stats || !cell) return;
    const id = crypto.randomUUID();
    setStatus("sharing");
    const ok = await send("PUT", {
      id,
      loadout: run.loadout,
      enterPercents,
      simStats: run.stats,
      rehearsal: {
        stage: cell[0] + 1,
        slot: cell[1] + 1,
        grid: rehearsalGrid(rows),
      },
    });
    setStatus(ok ? "idle" : "failed");
    if (ok) {
      setShared({ id, run, rows, cell });
      countUse("rehearsalShared");
    }
  }, [run, enterPercents, rows, cell]);

  const undo = useCallback(() => {
    if (!shared) return;
    send("DELETE", { id: shared.id });
    setShared(null);
  }, [shared]);

  return { status: isCurrent ? "shared" : status, share, undo };
}
