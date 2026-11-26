/**
 * Walks every DSL field across the data CSV files and reports any
 * unknown phase, identifier, function, or field name.
 *
 * Run via:
 *   pnpm validate:data
 *
 * Exit code is non-zero if any validation errors were found.
 *
 * CSVs are read fresh from disk rather than imported — otherwise any
 * transitive import of `gakumas-data` (e.g. via the schema introspecting
 * engine components) runs its side-effectful deserializer and mutates
 * the module-cached records in place, leaving us with ASTs instead of the
 * raw DSL strings the validator needs.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseCsvRecords } from "gakumas-data/utils/csv";
import { parseEffects, parsePatches } from "gakumas-data/utils/parser";
import {
  validateEffectAst,
  validatePatchAst,
} from "gakumas-data/utils/validator";

const CSV_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/gakumas-data/csv",
);
const readCsv = (name) =>
  parseCsvRecords(readFileSync(resolve(CSV_DIR, name), "utf8"));

const CUSTOMIZATIONS = readCsv("customizations.csv");
const SKILL_CARDS = readCsv("skill_cards.csv");
const PLUS_PLUS_CARDS = readCsv("skill_cards_plus_plus.csv");
const P_ITEMS = readCsv("p_items.csv");
const STAGES = readCsv("stages.csv");
const P_DRINKS = readCsv("p_drinks.csv");
const IDOL_ROAD_EFFECTS = readCsv("idol_road_effects.csv");
const IDOL_ROAD_STAGES = readCsv("idol_road_stages.csv");
const IDOL_ROAD_PATTERNS = readCsv("idol_road_patterns.csv");
const IDOL_ROAD_PATTERN_STAGES = readCsv("idol_road_pattern_stages.csv");
const IDOLS = readCsv("idols.csv");
const PRODUCE_EXAMS = readCsv("produce_exams.csv");

let totalErrors = 0;

function report(entity, id, column, src, errors) {
  if (!errors.length) return;
  totalErrors += errors.length;
  console.error(`${entity}#${id} [${column}]: ${JSON.stringify(src)}`);
  for (const err of errors) console.error(`  - ${err}`);
}

function validateEffectField(entity, id, column, src) {
  if (src == null || !String(src).trim()) return;
  try {
    const ast = parseEffects(String(src));
    report(entity, id, column, src, validateEffectAst(ast));
  } catch (err) {
    totalErrors++;
    console.error(`${entity}#${id} [${column}]: ${JSON.stringify(src)}`);
    console.error(`  - Parse error: ${err.message}`);
  }
}

function validatePatchField(entity, id, column, src) {
  if (src == null || !String(src).trim()) return;
  try {
    const ast = parsePatches(String(src));
    const errors = validatePatchAst(ast);
    errors.push(...lintLevelForm(String(src)));
    report(entity, id, column, src, errors);
  } catch (err) {
    totalErrors++;
    console.error(`${entity}#${id} [${column}]: ${JSON.stringify(src)}`);
    console.error(`  - Parse error: ${err.message}`);
  }
}

// Customization levels must use the outer-wrapper form: `level:N { ... }`.
// The inner-annotation form (`{ ...; level:N }` inside an at:/target: block,
// or a bare `level:N` statement trailing a block) parses to the same AST but
// breaks the "one labeled block per level" reading that makes multi-level
// customizations easy to scan. This lint operates on the raw source since
// both forms are indistinguishable after parsing.
function lintLevelForm(src) {
  const errors = [];
  if (!/level:\d/.test(src)) return errors;

  // Walk the source tracking brace depth; any `level:N` not preceded by a
  // `{` (wrapping form) is an inner annotation.
  for (let i = 0; i < src.length; i++) {
    if (!src.startsWith("level:", i)) continue;
    // Peek back to the nearest non-whitespace: wrapping form has `level:N` at
    // depth 0 immediately followed by `{`. Inner-annotation form has it at
    // depth > 0 (inside a block body) or followed by `;`, `}`, or end of input.
    let j = i + "level:".length;
    while (j < src.length && /\d/.test(src[j])) j++;
    let k = j;
    while (k < src.length && /\s/.test(src[k])) k++;
    if (src[k] !== "{") {
      errors.push(
        `Customization level must use outer-wrapper form: \`level:N { ... }\`. ` +
          `Saw inner-annotation form near \`${src.slice(i, Math.min(src.length, i + 30))}...\`.`,
      );
      return errors; // one complaint per cell is enough
    }
  }
  return errors;
}

// --- Skill cards ---
// `actions`: immediate actions played when the card is used.
// `effects`: triggered effects (at:phase) registered when the card enters play.
for (const card of [...SKILL_CARDS, ...PLUS_PLUS_CARDS]) {
  validateEffectField("skillCard", card.id, "conditions", card.conditions);
  validateEffectField("skillCard", card.id, "cost", card.cost);
  validateEffectField("skillCard", card.id, "actions", card.actions);
  validateEffectField("skillCard", card.id, "effects", card.effects);
}

// --- Customizations (patch sequences, mirroring skill_cards columns) ---
for (const cust of CUSTOMIZATIONS) {
  validatePatchField("customization", cust.id, "conditions", cust.conditions);
  validatePatchField("customization", cust.id, "cost", cust.cost);
  validatePatchField("customization", cust.id, "actions", cust.actions);
  validatePatchField("customization", cust.id, "effects", cust.effects);
}

// --- P-items / stages: triggered effects only ---
for (const item of P_ITEMS) {
  validateEffectField("pItem", item.id, "effects", item.effects);
}
for (const stage of STAGES) {
  validateEffectField("stage", stage.id, "effects", stage.effects);
}
for (const exam of PRODUCE_EXAMS) {
  validateEffectField("produceExam", exam.id, "effects", exam.effects);
  const counts = String(exam.turnCounts).split(",").map(Number);
  if (counts.length != 3 || counts.some((n) => !Number.isInteger(n) || n < 0)) {
    report("produceExam", exam.id, "turnCounts", exam.turnCounts, [
      "turnCounts must be three whole numbers (Vo,Da,Vi).",
    ]);
  }
}
for (const row of IDOL_ROAD_EFFECTS) {
  const id = `${row.stageId}:${row.recommendedEffect}`;
  validateEffectField("idolRoadEffect", id, "effects", row.effects);
}
// --- P-drinks: immediate actions only ---
for (const drink of P_DRINKS) {
  validateEffectField("pDrink", drink.id, "actions", drink.actions);
}

// --- Upgraded rows: the base row is id-1, and the game names the upgrade
// after it with a trailing "+" ---
function validateUpgradedNames(entity, records) {
  const byId = new Map(records.map((r) => [String(r.id), r]));
  for (const record of records) {
    if (String(record.upgraded).toUpperCase() !== "TRUE") continue;
    const base = byId.get(String(Number(record.id) - 1));
    if (base && record.name === `${base.name}+`) continue;
    report(entity, record.id, "name", record.name, [
      base
        ? `Upgraded name should be ${JSON.stringify(`${base.name}+`)} (base is #${base.id}).`
        : `Upgraded row has no base row #${Number(record.id) - 1}.`,
    ]);
  }
}
validateUpgradedNames("skillCard", SKILL_CARDS);

// --- ++ rows: each comes from an upgraded + row and is named after it with
// one more "+"; ids must not collide with skill_cards.csv ---
{
  const byId = new Map(SKILL_CARDS.map((r) => [String(r.id), r]));
  for (const record of PLUS_PLUS_CARDS) {
    const from = byId.get(String(record.fromId));
    const errors = [];
    if (byId.has(String(record.id))) errors.push(`Id #${record.id} is already a skill_cards.csv row.`);
    if (!from) errors.push(`fromId #${record.fromId} is not a skill_cards.csv row.`);
    else if (String(from.upgraded).toUpperCase() !== "TRUE") errors.push(`fromId #${record.fromId} is not an upgraded (+) row.`);
    else if (record.name !== `${from.name}+`) errors.push(`Name should be ${JSON.stringify(`${from.name}+`)} (from #${from.id}).`);
    if (errors.length) report("skillCard", record.id, "name", record.name, errors);
  }
}
validateUpgradedNames("pItem", P_ITEMS);

// --- Idol Road: each pattern lists its idols; each stage, a row per
// pattern it's on, with no two stages at one STAGE n on a pattern. Every
// Idol Road stage is on some pattern, an idol is on at most one, and an
// idol's rows name stages on its own road ---
{
  const ids = (v) => String(v ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const roadStages = new Map(STAGES.filter((s) => s.type === "idolRoad").map((s) => [String(s.id), s]));
  const idolIds = new Set(IDOLS.map((i) => String(i.id)));
  const listed = new Set();
  const patternOfIdol = new Map();
  const stagesOfPattern = new Map();
  for (const row of IDOL_ROAD_PATTERNS) {
    const errors = [];
    if (stagesOfPattern.has(row.pattern)) errors.push(`Pattern ${row.pattern} has more than one row.`);
    stagesOfPattern.set(row.pattern, new Set());
    for (const id of ids(row.idolIds)) {
      if (!idolIds.has(id)) errors.push(`Idol #${id} is not an idols.csv row.`);
      if (patternOfIdol.has(id)) errors.push(`Idol #${id} is also on pattern ${patternOfIdol.get(id)}.`);
      patternOfIdol.set(id, row.pattern);
    }
    report("idolRoadPattern", row.pattern, "idolIds", row.idolIds, errors);
  }
  const atStage = new Map();
  for (const row of IDOL_ROAD_PATTERN_STAGES) {
    const errors = [];
    const id = String(row.stageId);
    const stage = roadStages.get(id);
    const onPattern = stagesOfPattern.get(row.pattern);
    if (!stage) errors.push(`Stage #${id} is not an idolRoad stages.csv row.`);
    if (!onPattern) errors.push(`Pattern ${row.pattern} is not an idol_road_patterns.csv row.`);
    else if (onPattern.has(id)) errors.push(`Stage #${id} is on pattern ${row.pattern} twice.`);
    else {
      onPattern.add(id);
      if (stage) {
        const key = `${row.pattern}:${stage.stage}`;
        if (atStage.has(key)) errors.push(`Stage #${id} and #${atStage.get(key)} are both STAGE ${stage.stage} on pattern ${row.pattern}.`);
        else atStage.set(key, id);
      }
    }
    listed.add(id);
    report("idolRoadPatternStage", `${id}:${row.pattern}`, "stageId", row.stageId, errors);
  }
  for (const id of roadStages.keys()) {
    if (!listed.has(id)) report("stage", id, "type", "idolRoad", ["Idol Road stage is on no pattern in idol_road_pattern_stages.csv."]);
  }
  for (const row of IDOL_ROAD_STAGES) {
    const pattern = patternOfIdol.get(String(row.idolId));
    const errors = [];
    if (!roadStages.has(String(row.stageId))) errors.push(`Stage #${row.stageId} is not an idolRoad stages.csv row.`);
    else if (pattern && !stagesOfPattern.get(pattern).has(String(row.stageId))) errors.push(`Stage #${row.stageId} is not on idol #${row.idolId}'s road (pattern ${pattern}).`);
    report("idolRoadStage", `${row.stageId}:${row.idolId}`, "stageId", row.stageId, errors);
  }
  for (const row of IDOL_ROAD_EFFECTS) {
    if (!roadStages.has(String(row.stageId))) report("idolRoadEffect", `${row.stageId}:${row.recommendedEffect}`, "stageId", row.stageId, [`Stage #${row.stageId} is not an idolRoad stages.csv row.`]);
  }
}

if (totalErrors > 0) {
  console.error(`\nFound ${totalErrors} validation error(s).`);
  process.exit(1);
}
console.log("All DSL references validated — 0 errors.");
