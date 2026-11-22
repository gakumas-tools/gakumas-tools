"use client";
import { useCallback, useContext } from "react";
import LoadoutContext from "@/contexts/LoadoutContext";
import ModalContext from "@/contexts/ModalContext";
import SimulationRunsContext from "@/contexts/SimulationRunsContext";
import { logEvent } from "@/utils/logging";
import { isListableStageId } from "@/utils/stageListing";
import ShareModal from "./ShareModal";

// Opens the simulator's Share. Both of its buttons (by the loadout and under
// the result) open the same modal; `run` is the result on screen, if any.
export default function useSimulatorShare(run) {
  const { simulatorUrl } = useContext(LoadoutContext);
  const { saveRun, shareSaved, listRun } = useContext(SimulationRunsContext);
  const { setModal } = useContext(ModalContext);

  return useCallback(
    (from) => {
      logEvent("simulator_share", { from, withResult: !!run });
      setModal(
        <ShareModal
          url={simulatorUrl}
          result={
            run && {
              run,
              listable: isListableStageId(run.loadout?.stageId),
              saveRun,
              shareSaved,
              listRun,
            }
          }
        />,
      );
    },
    [run, simulatorUrl, saveRun, shareSaved, listRun, setModal],
  );
}
