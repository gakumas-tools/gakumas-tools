import React, { memo } from "react";
import { useTranslations } from "next-intl";
import AddCard from "./AddCard";
import Diff from "./Diff";
import Group from "./Group";
import Hand from "./Hand";
import InteractiveHand from "./InteractiveHand";
import SetBuff from "./SetBuff";
import Tile from "./Tile";
import Turn from "./Turn";
import styles from "./SimulatorLogs.module.scss";

const BUFF_LOG_TYPES = {
  setScoreBuff: "scoreBuff",
  setScoreDebuff: "scoreDebuff",
  setGoodImpressionTurnsBuff: "goodImpressionTurnsBuff",
  setGoodImpressionTurnsEffectBuff: "goodImpressionTurnsEffectBuff",
  setGoodImpressionTurnsTimesBuff: "goodImpressionTurnsTimesBuff",
  setMotivationBuff: "motivationBuff",
  setMotivationAdditionBuff: "motivationAdditionBuff",
  setGoodConditionTurnsBuff: "goodConditionTurnsBuff",
  setGoodConditionTurnsAdditionBuff: "goodConditionTurnsAdditionBuff",
  setConcentrationBuff: "concentrationBuff",
  setConcentrationAdditionBuff: "concentrationAdditionBuff",
  setConcentrationEffectBuff: "concentrationEffectBuff",
  setEnthusiasmBuff: "enthusiasmBuff",
  setEnthusiasmBonus: "enthusiasmBonus",
  setFullPowerChargeBuff: "fullPowerChargeBuff",
  setFullPowerEffectBuff: "fullPowerEffectBuff",
  setStrengthEffectBuff: "strengthEffectBuff",
  setHandDecrease: "handDecrease",
};

const FLAT_BUFF_LOG_TYPES = new Set([
  "setEnthusiasmBonus",
  "setGoodImpressionTurnsTimesBuff",
  "setGoodConditionTurnsAdditionBuff",
  "setConcentrationAdditionBuff",
  "setMotivationAdditionBuff",
  "setHandDecrease",
]);

const TILE_LOG_TYPES = {
  setEffect: "setEffect",
  upgradeHand: "upgradedHand",
  exchangeHand: "exchangedHand",
  linkPhaseChange: "linkPhaseChange",
};

const ADD_CARD_LOG_TYPES = {
  drawCard: "cardDrawn",
  addCardToHand: "addedCardToHand",
  addCardToTopOfDeck: "addedCardToTopOfDeck",
  addCardToBottomOfDeck: "addedCardToBottomOfDeck",
  addCardToDiscarded: "addedCardToDiscarded",
  addCardToDeckAtRandom: "addedCardToDeckAtRandom",
  upgradeRandomCardInHand: "upgradedCard",
  growth: "cardGrowth",
  holdCard: "heldCard",
  discardCard: "discardedCard",
  moveCardToHand: "movedCardToHand",
  moveCardToTopOfDeck: "movedCardToTopOfDeck",
  moveCardToBottomOfDeck: "movedCardToBottomOfDeck",
  moveCardToDeckAtRandom: "movedCardToDeckAtRandom",
  removeCard: "removedCard",
};

function Log({ line, idolId, pendingDecision, onDecision }) {
  const t = useTranslations("stage");

  if (line.logType == "diff") {
    return <Diff {...line.data} />;
  }

  if (line.logType == "hand") {
    if (line.isPending) {
      return (
        <InteractiveHand
          {...line.data}
          idolId={idolId}
          pendingDecision={pendingDecision}
          onDecision={onDecision}
        />
      );
    } else {
      return <Hand {...line.data} idolId={idolId} hideScores={!!onDecision} />;
    }
  } else if (line.logType == "group") {
    return (
      <Group
        entity={line.entity}
        childLogs={line.childLogs}
        idolId={idolId}
        pendingDecision={pendingDecision}
        onDecision={onDecision}
      />
    );
  } else if (line.logType == "turn") {
    return (
      <Turn
        {...line.data}
        childLogs={line.childLogs}
        idolId={idolId}
        pendingDecision={pendingDecision}
        onDecision={onDecision}
      />
    );
  }

  if (BUFF_LOG_TYPES[line.logType]) {
    return (
      <SetBuff
        label={t(BUFF_LOG_TYPES[line.logType])}
        flat={FLAT_BUFF_LOG_TYPES.has(line.logType)}
        {...line.data}
      />
    );
  }

  if (TILE_LOG_TYPES[line.logType]) {
    return <Tile text={t(TILE_LOG_TYPES[line.logType])} />;
  }

  if (ADD_CARD_LOG_TYPES[line.logType]) {
    return (
      <AddCard
        {...line.data}
        idolId={idolId}
        text={t(ADD_CARD_LOG_TYPES[line.logType])}
      />
    );
  }
}

function Logs({ logs, idolId, pendingDecision, onDecision }) {
  return (
    <div className={styles.logs}>
      {logs.map((line, i) => (
        <Log
          key={i}
          line={line}
          idolId={idolId}
          pendingDecision={pendingDecision}
          onDecision={onDecision}
        />
      ))}
    </div>
  );
}

export default memo(Logs);
