import { memo, useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_SORT, SORTABLE_COLS } from "./constants";
import {
  combineTotal,
  combineTurn,
  runVariantUses,
  sumTurnMeta,
} from "./helpers";
import Section from "./Section";
import styles from "./SimulatorStats.module.scss";

function SimulatorStats({ cardUsage, scoreStats }) {
  const t = useTranslations("SimulatorStats");
  const [sort, setSort] = useState(DEFAULT_SORT);

  const handleSort = useCallback((col) => {
    if (!SORTABLE_COLS.includes(col)) return;
    setSort((prev) => {
      if (prev.by === col) {
        return { by: col, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      // Text columns default asc, numeric columns default desc.
      return { by: col, dir: col === "card" ? "asc" : "desc" };
    });
  }, []);

  const data = useMemo(() => {
    const numRuns =
      (scoreStats && scoreStats.numRuns) ||
      (cardUsage && cardUsage.numRuns) ||
      0;
    if (!numRuns) return null;

    const numTurns = Math.max(
      cardUsage?.turns?.length || 0,
      scoreStats?.turns?.length || 0,
    );
    const runUses = runVariantUses(cardUsage?.turns || []);
    const perTurn = [];
    for (let i = 0; i < numTurns; i++) {
      const scoreTurn = scoreStats?.turns?.[i];
      perTurn.push({
        byCard: combineTurn(cardUsage?.turns?.[i] || {}, scoreTurn, runUses),
        turnTypeCounts: scoreTurn?.turnTypeCounts || {
          vocal: 0,
          dance: 0,
          visual: 0,
        },
        totalScoreByType: scoreTurn?.totalScoreByType || {
          vocal: 0,
          dance: 0,
          visual: 0,
        },
        totalScore: scoreTurn?.totalScore || 0,
      });
    }
    const totalMeta = sumTurnMeta(perTurn);
    return {
      numRuns,
      perTurn,
      total: { byCard: combineTotal(perTurn), ...totalMeta },
    };
  }, [cardUsage, scoreStats]);

  if (!data) return null;

  return (
    <div className={styles.container}>
      <Section
        title={t("total")}
        byCard={data.total.byCard}
        numRuns={data.numRuns}
        turnTypeCounts={data.total.turnTypeCounts}
        totalScoreByType={data.total.totalScoreByType}
        sort={sort}
        onSort={handleSort}
      />
      {data.perTurn.map((turn, i) => (
        <Section
          key={`turn-${i}`}
          title={t("turn", { turn: i + 1 })}
          byCard={turn.byCard}
          numRuns={data.numRuns}
          turnTypeCounts={turn.turnTypeCounts}
          totalScoreByType={turn.totalScoreByType}
          sort={sort}
          onSort={handleSort}
        />
      ))}
    </div>
  );
}

export default memo(SimulatorStats);
