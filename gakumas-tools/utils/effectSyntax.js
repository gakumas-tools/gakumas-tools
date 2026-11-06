import { Tokenizer, TokenType } from "gakumas-data";

const KEYWORD_TYPES = new Set([
  TokenType.AT,
  TokenType.IF,
  TokenType.DO,
  TokenType.TARGET,
  TokenType.LIMIT,
  TokenType.TTL,
  TokenType.DELAY,
  TokenType.GROUP,
  TokenType.LINE,
  TokenType.LEVEL,
]);

// Lexeme + class for tokens that don't carry their text in `value`
// (everything except keywords, identifiers, and numbers).
const LEXEMES = {
  [TokenType.AT_SIGN]: ["@", "anchor"],
  [TokenType.LBRACE]: ["{", "punctuation"],
  [TokenType.RBRACE]: ["}", "punctuation"],
  [TokenType.LPAREN]: ["(", "punctuation"],
  [TokenType.RPAREN]: [")", "punctuation"],
  [TokenType.LBRACKET]: ["[", "punctuation"],
  [TokenType.RBRACKET]: ["]", "punctuation"],
  [TokenType.SEMICOLON]: [";", "punctuation"],
  [TokenType.COLON]: [":", "punctuation"],
  [TokenType.COMMA]: [",", "punctuation"],
  [TokenType.EQ]: ["==", "operator"],
  [TokenType.NE]: ["!=", "operator"],
  [TokenType.LT]: ["<", "operator"],
  [TokenType.GT]: [">", "operator"],
  [TokenType.LE]: ["<=", "operator"],
  [TokenType.GE]: [">=", "operator"],
  [TokenType.ASSIGN]: ["=", "operator"],
  [TokenType.PLUS_ASSIGN]: ["+=", "operator"],
  [TokenType.MINUS_ASSIGN]: ["-=", "operator"],
  [TokenType.MUL_ASSIGN]: ["*=", "operator"],
  [TokenType.DIV_ASSIGN]: ["/=", "operator"],
  [TokenType.MOD_ASSIGN]: ["%=", "operator"],
  [TokenType.PLUS]: ["+", "operator"],
  [TokenType.MINUS]: ["-", "operator"],
  [TokenType.MUL]: ["*", "operator"],
  [TokenType.DIV]: ["/", "operator"],
  [TokenType.MOD]: ["%", "operator"],
  [TokenType.AND]: ["&", "operator"],
  [TokenType.OR]: ["|", "operator"],
  [TokenType.NOT]: ["!", "operator"],
};

// The digits as written, as the tokenizer's readNumber reads them: a number's
// value doesn't keep "0.50", "05" or "1." spelled the way they were typed.
const NUMBER_PATTERN = /-?\d+(?:\.\d*)?/g;

function numberText(input, cursor) {
  NUMBER_PATTERN.lastIndex = cursor;
  return NUMBER_PATTERN.exec(input)?.[0] ?? null;
}

function classify(token, input, cursor) {
  if (KEYWORD_TYPES.has(token.type)) return [String(token.value), "keyword"];
  if (token.type === TokenType.NUMBER) {
    const text = numberText(input, cursor);
    return text == null ? null : [text, "number"];
  }
  if (token.type === TokenType.IDENTIFIER) return [token.value, "identifier"];
  return LEXEMES[token.type] || null;
}

// Walks the tokens against the source so whitespace can be preserved between
// them — the tokenizer records line/col but not byte offsets.
export function highlightEffects(input) {
  if (!input) return [];

  let tokens;
  try {
    tokens = new Tokenizer(input).tokenize();
  } catch {
    return [{ className: null, text: input }];
  }

  const parts = [];
  let cursor = 0;

  for (const token of tokens) {
    const hit = classify(token, input, cursor);
    if (!hit) continue;
    const [text, className] = hit;

    const idx = input.indexOf(text, cursor);
    if (idx === -1) break;
    if (idx > cursor) {
      parts.push({ className: null, text: input.slice(cursor, idx) });
    }
    parts.push({ className, text });
    cursor = idx + text.length;
  }

  if (cursor < input.length) {
    parts.push({ className: null, text: input.slice(cursor) });
  }

  return parts;
}
