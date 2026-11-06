/**
 * Tokenizer - converts effect string to tokens
 */
import { TokenType, KEYWORDS } from "./tokens";

// Tokens that can end an operand, after which `-` is subtraction.
const OPERAND_END_TOKENS = new Set([
  TokenType.NUMBER,
  TokenType.IDENTIFIER,
  TokenType.RPAREN,
  TokenType.RBRACKET,
]);

export class Tokenizer {
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
  }

  peek(offset = 0) {
    return this.input[this.pos + offset];
  }

  advance() {
    const char = this.input[this.pos++];
    if (char === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return char;
  }

  skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  makeToken(type, value = null) {
    return { type, value, line: this.line, col: this.col };
  }

  readNumber() {
    const startCol = this.col;
    let num = "";
    let hasDecimal = false;

    if (this.peek() === "-") {
      num += this.advance();
    }

    while (this.pos < this.input.length) {
      const char = this.peek();
      if (/\d/.test(char)) {
        num += this.advance();
      } else if (char === "." && !hasDecimal) {
        hasDecimal = true;
        num += this.advance();
      } else {
        break;
      }
    }

    return {
      type: TokenType.NUMBER,
      value: parseFloat(num),
      line: this.line,
      col: startCol,
    };
  }

  readIdentifier() {
    const startCol = this.col;
    let id = "";

    while (this.pos < this.input.length) {
      const char = this.peek();
      if (/[a-zA-Z0-9_.]/.test(char)) {
        id += this.advance();
      } else {
        break;
      }
    }

    // Check if it's a keyword
    const keyword = KEYWORDS[id.toLowerCase()];
    if (keyword) {
      return { type: keyword, value: id, line: this.line, col: startCol };
    }

    return {
      type: TokenType.IDENTIFIER,
      value: id,
      line: this.line,
      col: startCol,
    };
  }

  nextToken() {
    this.skipWhitespace();

    if (this.pos >= this.input.length) {
      return this.makeToken(TokenType.EOF);
    }

    const char = this.peek();
    const startCol = this.col;

    // Single character tokens
    const singleCharTokens = {
      "{": TokenType.LBRACE,
      "}": TokenType.RBRACE,
      "(": TokenType.LPAREN,
      ")": TokenType.RPAREN,
      "[": TokenType.LBRACKET,
      "]": TokenType.RBRACKET,
      ";": TokenType.SEMICOLON,
      ":": TokenType.COLON,
      ",": TokenType.COMMA,
      "&": TokenType.AND,
      "|": TokenType.OR,
      "@": TokenType.AT_SIGN,
    };

    if (singleCharTokens[char]) {
      this.advance();
      return { type: singleCharTokens[char], line: this.line, col: startCol };
    }

    // Two-character operators
    const twoCharOps = {
      "==": TokenType.EQ,
      "!=": TokenType.NE,
      "<=": TokenType.LE,
      ">=": TokenType.GE,
      "+=": TokenType.PLUS_ASSIGN,
      "-=": TokenType.MINUS_ASSIGN,
      "*=": TokenType.MUL_ASSIGN,
      "/=": TokenType.DIV_ASSIGN,
      "%=": TokenType.MOD_ASSIGN,
    };

    const twoChar = char + (this.peek(1) || "");
    if (twoCharOps[twoChar]) {
      this.advance();
      this.advance();
      return { type: twoCharOps[twoChar], line: this.line, col: startCol };
    }

    // Single character operators
    const singleCharOps = {
      "!": TokenType.NOT,
      "=": TokenType.ASSIGN,
      "<": TokenType.LT,
      ">": TokenType.GT,
      "+": TokenType.PLUS,
      "*": TokenType.MUL,
      "/": TokenType.DIV,
      "%": TokenType.MOD,
    };

    if (char === "-") {
      // Could be minus or negative number. After an operand (`a-1`,
      // `2-1`, `(x)-1`) it can only be a minus.
      if (/\d/.test(this.peek(1)) && !OPERAND_END_TOKENS.has(this.prevType)) {
        return this.readNumber();
      }
      this.advance();
      return { type: TokenType.MINUS, line: this.line, col: startCol };
    }

    if (singleCharOps[char]) {
      this.advance();
      return { type: singleCharOps[char], line: this.line, col: startCol };
    }

    // Numbers
    if (/\d/.test(char)) {
      return this.readNumber();
    }

    // Identifiers
    if (/[a-zA-Z_]/.test(char)) {
      return this.readIdentifier();
    }

    throw new Error(
      `Unexpected character '${char}' at line ${this.line}, col ${this.col}`
    );
  }

  tokenize() {
    const tokens = [];
    let token;
    do {
      token = this.nextToken();
      tokens.push(token);
      this.prevType = token.type;
    } while (token.type !== TokenType.EOF);
    return tokens;
  }
}
