// Turns the Idol Road 「STAGEn スコア獲得編成確認」 screen into a simulator
// loadout, in the shape the contest-loadout import returns. The pixel work
// is idolRoadLoadout's; the icon reads are the caller's (see
// simulatorLoadout).
import { PIdols, SkillCards, Stages } from "gakumas-data";
import IDOL_ROAD_STAGES from "gakumas-data/csv/idol_road_stages.csv";
import { detectIdolRoadLoadout, stageGlyphs } from "./idolRoadLoadout";
import { detectIdolRoadBoxes } from "./idolRoadGeometry";

// Each road's stages: an Idol Road stage is on an idol's road when
// idol_road_stages.csv has its criteria and turn counts for that idol.
const ROAD_STAGES = new Set(
  IDOL_ROAD_STAGES.map(({ stageId, idolId }) => `${stageId}:${idolId}`),
);

// The screenshot's Idol Road layout, or null when it isn't the Idol Road
// screen: its orange 「STAGEn ...」 header isn't found above the deck.
// Anything else (a contest loadout, another screen) is left to the other
// readers.
function idolRoadLayout(imageData) {
  let layout;
  try {
    layout = detectIdolRoadBoxes(imageData);
  } catch {
    return null;
  }
  return layout.mainRow && stageGlyphs(imageData, layout).length ? layout : null;
}

export function isIdolRoadScreen(imageData) {
  return !!idolRoadLayout(imageData);
}

// Given one or two screenshots in any order, null when none is the Idol Road
// screen; else order, the screenshots' indices top first, and found,
// detectIdolRoadLoadout's read of them in that order. Scrolling moves the
// deck up, so the top screenshot is the one whose Main row sits lowest in
// the scroll window.
export function findIdolRoadLoadout(imageDatas) {
  const layouts = imageDatas.map(idolRoadLayout);
  if (!layouts.some(Boolean)) return null;
  if (!layouts.every(Boolean)) {
    throw new Error(
      "Every screenshot must be the Idol Road スコア獲得編成確認 screen",
    );
  }
  const depth = (i) => layouts[i].mainRow.y - layouts[i].window.top;
  const order = imageDatas.map((_, i) => i).sort((a, b) => depth(b) - depth(a));
  return {
    order,
    found: detectIdolRoadLoadout(order.map((i) => imageDatas[i])),
  };
}

// A 重複 (greyed) card is left out of the deck: it becomes 0, with no
// customizations. In game, a 重複不可 card that is in both the Main and a Sub
// row is dealt once, and only that copy is greyed; cards repeated without the
// grey are dealt once per row, so they stay.
export function leaveOutDuplicates({ skillCards, duplicates, customizations }) {
  return {
    skillCardIdGroups: skillCards.map((row, r) =>
      row.map((id, c) => (duplicates[r][c] ? 0 : id)),
    ),
    customizationGroups: customizations.map((row, r) =>
      row.map((custom, c) => (duplicates[r][c] ? {} : custom)),
    ),
  };
}

// STAGE n on the road of the Main row's P-idol: the first card of the Main
// row is the P-idol's own card. None when the stage number wasn't read, the
// card isn't a P-idol card, or the data has no such stage on that idol's
// road yet. The おすすめ効果 branch isn't picked here: the engine takes it
// from the loadout's P-idol (IdolRoad.resolveStage).
export function idolRoadStageCandidates(stage, mainCardId) {
  const card = SkillCards.getById(mainCardId);
  const pIdol = card?.sourceType == "pIdol" && PIdols.getById(card.pIdolId);
  if (!stage || !pIdol) return [];
  return Stages.getAll()
    .filter(
      (s) =>
        s.type == "idolRoad" &&
        s.stage == stage &&
        ROAD_STAGES.has(`${s.id}:${pIdol.idolId}`),
    )
    .map((s) => ({ stageId: s.id }));
}

// found: findIdolRoadLoadout(...).found. cards: readIdolRoadCards' result.
// chosenPItemIds: the reads of the chosen P-item slots (0 for an empty one).
// The 固定 slot holds the stage's own P-item, which the stage's
// idol_road_effects row already carries, so it isn't one of the loadout's.
// On Idol Road stages the simulator takes its params as the percents the
// game shows (calculateTypeMultipliers: params / 100 off contests), so
// those go in place of Vo/Da/Vi, with 体力 as read.
export function idolRoadLoadout(found, cards, chosenPItemIds) {
  const { skillCardIdGroups, customizationGroups } = leaveOutDuplicates(cards);
  const stageCandidates = idolRoadStageCandidates(
    found.stage,
    cards.skillCards[0]?.[0],
  );
  return {
    ...stageCandidates[0],
    stageCandidates,
    params: [...found.percents, found.params[3]],
    pItemIds: chosenPItemIds,
    skillCardIdGroups,
    customizationGroups,
  };
}
