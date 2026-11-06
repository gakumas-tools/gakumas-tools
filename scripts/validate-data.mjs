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
const P_ITEMS = readCsv("p_items.csv");
const STAGES = readCsv("stages.csv");
const P_DRINKS = readCsv("p_drinks.csv");

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
for (const card of SKILL_CARDS) {
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
validateUpgradedNames("pItem", P_ITEMS);

if (totalErrors > 0) {
  console.error(`\nFound ${totalErrors} validation error(s).`);
  process.exit(1);
}
console.log("All DSL references validated — 0 errors.");
