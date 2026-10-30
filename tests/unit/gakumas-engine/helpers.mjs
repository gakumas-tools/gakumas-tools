import { deserializeEffectSequence, Stages } from "gakumas-data";
import {
  IdolConfig,
  IdolStageConfig,
  StageConfig,
  StageEngine,
} from "gakumas-engine";

export function createEngine({
  params = [100, 100, 100, 30],
  pItemIds = [],
  skillCardIds = [19],
  stageId = 1,
} = {}) {
  const idol = new IdolConfig({
    params,
    supportBonus: 0,
    pItemIds,
    skillCardIdGroups: [skillCardIds],
    customizationGroups: [[]],
  });
  const stage = new StageConfig(Stages.getById(stageId));
  const engine = new StageEngine(new IdolStageConfig(idol, stage));
  engine.logger.disable();
  return engine;
}

export function parseActions(source) {
  return deserializeEffectSequence(source).flatMap((effect) => effect.actions);
}
