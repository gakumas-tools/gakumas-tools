/**
 * Parser - converts tokens to AST
 *
 * Grammar (EBNF):
 *
 * effectSequence = anchoredEffect (";" anchoredEffect)*
 * anchoredEffect = ("@" IDENTIFIER)? effect
 * effect = phaseBlock | conditionBlock | targetBlock | action | actionBlock | modifier
 * phaseBlock = "at:" phase ("{" effectBody "}")?      // body required outside patch mode
 * effectBody = (conditionBlock | targetBlock | phaseBlock | action | modifier)*
 * conditionBlock = "if:" condition ("{" effectBody "}")?
 * targetBlock = "target:" condition ("{" effectBody "}")?
 * action = "do:" assignmentExpr | assignmentExpr
 * actionBlock = "do" [":"] "{" actionBody "}"
 * actionBody = (action | modifier)*
 * modifier = "limit:" number | "ttl:" number | "delay:" number | "group:" number
 *
 * patchSequence = patch (";" patch)*                  // entry point for customization columns
 * patch = appendPatch | anchorPatch | modifier        // top-level modifiers attach to previous patch
 * appendPatch = "+" effect
 * anchorPatch = "@" IDENTIFIER partialEffect
 * partialEffect = like effect, but "at:" may be body-less (sets phase only)
 *
 * condition = orExpr
 * orExpr = andExpr ("|" andExpr)*
 * andExpr = unaryExpr ("&" unaryExpr)*
 * unaryExpr = "!" unaryExpr | comparisonExpr
 * comparisonExpr = addExpr (("==" | "!=" | "<" | ">" | "<=" | ">=") addExpr)?
 *
 * assignmentExpr = identifier assignmentOp expression | functionCall
 * assignmentOp = "=" | "+=" | "-=" | "*=" | "/=" | "%="
 *
 * expression = addExpr
 * addExpr = mulExpr (("+" | "-") mulExpr)*
 * mulExpr = unaryMath (("*" | "/" | "%") unaryMath)*
 * unaryMath = "-" unaryMath | primaryExpr
 * primaryExpr = "(" expression ")" | functionCall | number | identifier
 * functionCall = identifier ("[" condition "]")? ("(" (expression ("," expression)*)? ")")?
 */
import { TokenType } from "./tokens";

const MODIFIER_TOKENS = [
  TokenType.LIMIT,
  TokenType.TTL,
  TokenType.DELAY,
  TokenType.GROUP,
  TokenType.LINE,
  TokenType.LEVEL,
];

const COMPARISON_TOKENS = [
  TokenType.EQ,
  TokenType.NE,
  TokenType.LT,
  TokenType.GT,
  TokenType.LE,
  TokenType.GE,
];

const ARITHMETIC_TOKENS = [
  TokenType.PLUS,
  TokenType.MINUS,
  TokenType.MUL,
  TokenType.DIV,
  TokenType.MOD,
];

const ASSIGNMENT_TOKENS = [
  TokenType.ASSIGN,
  TokenType.PLUS_ASSIGN,
  TokenType.MINUS_ASSIGN,
  TokenType.MUL_ASSIGN,
  TokenType.DIV_ASSIGN,
  TokenType.MOD_ASSIGN,
];

const COMPARISON_OP_MAP = {
  [TokenType.EQ]: "==",
  [TokenType.NE]: "!=",
  [TokenType.LT]: "<",
  [TokenType.GT]: ">",
  [TokenType.LE]: "<=",
  [TokenType.GE]: ">=",
};

const ASSIGNMENT_OP_MAP = {
  [TokenType.ASSIGN]: "=",
  [TokenType.PLUS_ASSIGN]: "+=",
  [TokenType.MINUS_ASSIGN]: "-=",
  [TokenType.MUL_ASSIGN]: "*=",
  [TokenType.DIV_ASSIGN]: "/=",
  [TokenType.MOD_ASSIGN]: "%=",
};

const MODIFIER_TYPE_MAP = {
  [TokenType.LIMIT]: "limit",
  [TokenType.TTL]: "ttl",
  [TokenType.DELAY]: "delay",
  [TokenType.GROUP]: "group",
  [TokenType.LINE]: "line",
  [TokenType.LEVEL]: "level",
};

const MUL_OP_MAP = {
  [TokenType.MUL]: "*",
  [TokenType.DIV]: "/",
  [TokenType.MOD]: "%",
};

export class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  // Token navigation helpers

  peek(offset = 0) {
    const index = this.pos + offset;
    if (index >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]; // EOF
    }
    return this.tokens[index];
  }

  advance() {
    return this.tokens[this.pos++];
  }

  check(type) {
    return this.peek().type === type;
  }

  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        return this.advance();
      }
    }
    return null;
  }

  expect(type, message) {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(
        `${message} at line ${token.line}, col ${token.col}. Got ${token.type}`
      );
    }
    return this.advance();
  }

  isAtEnd() {
    return this.peek().type === TokenType.EOF;
  }

  // Top-level parsing

  parseEffectSequence() {
    const effects = [];

    while (!this.isAtEnd()) {
      const effect = this.parseEffect();
      if (effect) effects.push(effect);
      // Skip optional semicolons between effects
      while (this.match(TokenType.SEMICOLON)) {}
    }

    return { type: "sequence", effects };
  }

  /**
   * Parse a patch sequence used for customization columns.
   *
   * Syntax:
   *   + <effect>              append a new effect to the card's attribute list
   *   @name <partial>         patch the effect labeled @name on the card
   *   level:N, limit:N, ...   attach as a top-level modifier to the previous patch
   *   level:N { ...patches }  apply level N to every patch in the block
   *
   * Emits: { type: "patchSequence", patches: [...] }
   * Each patch is { op, anchor?, effect?, level? }.
   */
  parsePatchSequence() {
    const patches = this.parsePatchStatements(() => this.isAtEnd());
    return { type: "patchSequence", patches };
  }

  parsePatchStatements(isEndOfBlock) {
    const patches = [];
    let pendingModifiers = {};

    const flushPending = () => {
      if (Object.keys(pendingModifiers).length === 0) return;
      if (patches.length > 0) {
        Object.assign(patches[patches.length - 1], pendingModifiers);
      }
      pendingModifiers = {};
    };

    while (!isEndOfBlock()) {
      const token = this.peek();

      if (MODIFIER_TOKENS.includes(token.type)) {
        const mod = this.parseModifier();
        // `level:N { ... }` block applies the level to every inner patch.
        if (mod.type === "level" && this.check(TokenType.LBRACE)) {
          flushPending();
          this.advance(); // consume '{'
          const inner = this.parsePatchStatements(
            () => this.isAtEnd() || this.check(TokenType.RBRACE)
          );
          this.expect(
            TokenType.RBRACE,
            "Expected '}' to close level block"
          );
          for (const patch of inner) {
            patch.level = mod.value;
            patches.push(patch);
          }
        } else {
          pendingModifiers[mod.type] = mod.value;
        }
      } else if (token.type === TokenType.PLUS) {
        flushPending();
        this.advance();
        const effect = this.parseEffect();
        if (!effect) {
          throw new Error(
            `Expected effect after '+' at line ${this.peek().line}, col ${this.peek().col}`
          );
        }
        patches.push({ op: "append", effect });
      } else if (token.type === TokenType.AT_SIGN) {
        flushPending();
        this.advance();
        const idToken = this.expect(
          TokenType.IDENTIFIER,
          "Expected anchor name after '@'"
        );
        const effect = this.parsePartialEffect();
        if (!effect) {
          throw new Error(
            `Expected patch body after '@${idToken.value}' at line ${this.peek().line}, col ${this.peek().col}`
          );
        }
        patches.push({ op: "patch", anchor: idToken.value, effect });
      } else if (token.type === TokenType.SEMICOLON) {
        this.advance();
      } else {
        // Implicit append: parse a bare effect as an append patch. If the
        // effect is a bare action, keep consuming follow-on bare actions
        // (skipping `;` separators) and merge them into a single action
        // block so they share one effect — mirrors the transformer's
        // "consecutive actions collapse into one effect" behavior and
        // preserves cross-action state like `motivationMultiplier=X`
        // being visible to a subsequent `genki+=3` in the same play step.
        flushPending();
        const effect = this.parseEffect();
        if (!effect) {
          throw new Error(
            `Expected '+', '@', or effect in patch sequence at line ${token.line}, col ${token.col}. Got ${token.type}`
          );
        }
        if (effect.type === "action") {
          const actions = [effect];
          const flushActions = () => {
            if (actions.length === 1) {
              patches.push({ op: "append", effect: actions[0] });
            } else if (actions.length > 1) {
              patches.push({
                op: "append",
                effect: { type: "actionBlock", body: actions.slice() },
              });
            }
            actions.length = 0;
          };
          while (!this.isAtEnd()) {
            // Skip semicolons.
            while (this.match(TokenType.SEMICOLON)) {}
            const t = this.peek();
            // Stop at explicit patch markers or end of block.
            if (
              t.type === TokenType.PLUS ||
              t.type === TokenType.AT_SIGN ||
              t.type === TokenType.RBRACE ||
              MODIFIER_TOKENS.includes(t.type)
            ) {
              break;
            }
            const next = this.parseEffect();
            if (!next) break;
            if (next.type !== "action") {
              // Non-action bare effect — flush collected actions as one
              // patch, then emit this one separately.
              flushActions();
              patches.push({ op: "append", effect: next });
              break;
            }
            actions.push(next);
          }
          flushActions();
        } else {
          patches.push({ op: "append", effect });
        }
      }
    }

    flushPending();
    return patches;
  }

  parsePartialEffect() {
    const token = this.peek();
    if (token.type === TokenType.AT) {
      return this.parsePhaseBlock(true /* partial */);
    }
    return this.parseEffect();
  }

  parseEffect() {
    // Optional anchor prefix `@name` attaches to whatever follows. Works at
    // top-level (whole effect) and inside effect bodies (single action) —
    // customizations can then patch the anchored piece.
    let anchor = null;
    if (this.check(TokenType.AT_SIGN)) {
      this.advance();
      const idToken = this.expect(
        TokenType.IDENTIFIER,
        "Expected anchor name after '@'"
      );
      anchor = idToken.value;
    }

    const token = this.peek();
    let effect;

    switch (token.type) {
      case TokenType.AT:
        effect = this.parsePhaseBlock();
        break;
      case TokenType.IF:
        effect = this.parseConditionBlock();
        break;
      case TokenType.TARGET:
        effect = this.parseTargetBlock();
        break;
      case TokenType.DO:
        effect = this.parseAction();
        break;
      case TokenType.IDENTIFIER:
        // Bare action without "do:" prefix
        effect = this.parseBareAction();
        break;
      case TokenType.EOF:
      case TokenType.RBRACE:
        if (anchor) {
          throw new Error(
            `Dangling anchor '@${anchor}' at line ${token.line}, col ${token.col}`
          );
        }
        return null;
      default:
        if (MODIFIER_TOKENS.includes(token.type)) {
          if (anchor) {
            throw new Error(
              `Cannot anchor a modifier at line ${token.line}, col ${token.col}`
            );
          }
          return this.parseModifier();
        }
        throw new Error(
          `Unexpected token ${token.type} at line ${token.line}, col ${token.col}`
        );
    }

    if (effect && anchor) effect.anchor = anchor;
    return effect;
  }

  // Block parsing

  parsePhaseBlock(partial = false) {
    this.expect(TokenType.AT, "Expected 'at'");
    this.expect(TokenType.COLON, "Expected ':' after 'at'");
    const phaseToken = this.expect(TokenType.IDENTIFIER, "Expected phase name");

    // Optional target-rule filter: at:phase[targetExpr] — fires only when the
    // phase's source card (typically state.usedCard) matches the rule.
    let filter = null;
    if (this.match(TokenType.LBRACKET)) {
      filter = this.parseCondition();
      this.expect(TokenType.RBRACKET, "Expected ']' after phase filter");
    }

    let body = [];
    if (this.match(TokenType.LBRACE)) {
      body = this.parseEffectBody();
      this.expect(TokenType.RBRACE, "Expected '}' to close phase block");
    } else if (!partial) {
      throw new Error(
        `Expected '{' after phase at line ${this.peek().line}, col ${this.peek().col}`
      );
    }

    return { type: "phase", phase: phaseToken.value, filter, body };
  }

  parseConditionBlock() {
    this.expect(TokenType.IF, "Expected 'if'");
    this.expect(TokenType.COLON, "Expected ':' after 'if'");
    const condition = this.parseCondition();

    // Body is optional - allows `if:condition` without `{ ... }`
    let body = [];
    if (this.match(TokenType.LBRACE)) {
      body = this.parseEffectBody();
      this.expect(TokenType.RBRACE, "Expected '}' to close condition block");
    }

    return { type: "condition", expr: condition, body };
  }

  parseTargetBlock() {
    this.expect(TokenType.TARGET, "Expected 'target'");
    this.expect(TokenType.COLON, "Expected ':' after 'target'");
    const target = this.parseCondition();

    // Body is optional
    let body = [];
    if (this.match(TokenType.LBRACE)) {
      body = this.parseEffectBody();
      this.expect(TokenType.RBRACE, "Expected '}' to close target block");
    }

    return { type: "target", target, body };
  }

  parseAction() {
    this.expect(TokenType.DO, "Expected 'do'");
    const hasColon = !!this.match(TokenType.COLON);

    if (this.match(TokenType.LBRACE)) {
      const body = this.parseActionBody();
      this.expect(TokenType.RBRACE, "Expected '}' to close do block");
      return { type: "actionBlock", body };
    }

    if (!hasColon) {
      throw new Error(
        `Expected ':' or '{' after 'do' at line ${this.peek().line}, col ${this.peek().col}`
      );
    }

    const expr = this.parseAssignmentExpr();

    return { type: "action", expr };
  }

  parseBareAction() {
    // Parse action without "do:" prefix (identifier already verified by caller)
    const expr = this.parseAssignmentExpr();
    return { type: "action", expr };
  }

  parseModifier() {
    const token = this.advance();
    this.expect(TokenType.COLON, `Expected ':' after '${token.value}'`);
    const value = this.expect(TokenType.NUMBER, "Expected number after ':'");

    return { type: MODIFIER_TYPE_MAP[token.type], value: value.value };
  }

  parseActionBody() {
    const body = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const token = this.peek();
      let effect;

      if (token.type === TokenType.DO) {
        effect = this.parseAction();
        if (effect?.type === "actionBlock") {
          throw new Error(
            `Nested do blocks are not supported at line ${token.line}, col ${token.col}`
          );
        }
      } else if (token.type === TokenType.IDENTIFIER) {
        effect = this.parseBareAction();
      } else if (MODIFIER_TOKENS.includes(token.type)) {
        effect = this.parseModifier();
      } else {
        throw new Error(
          `Expected action or modifier in do block at line ${token.line}, col ${token.col}. Got ${token.type}`
        );
      }

      if (effect) {
        body.push(effect);
      }

      while (this.match(TokenType.SEMICOLON)) {}
    }

    return body;
  }

  parseEffectBody() {
    const body = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const effect = this.parseEffect();
      if (effect) {
        body.push(effect);
      }
      // Skip optional semicolons
      while (this.match(TokenType.SEMICOLON)) {}
    }

    return body;
  }

  // Condition expression parsing

  parseCondition() {
    return this.parseOrExpr();
  }

  parseOrExpr() {
    let left = this.parseAndExpr();

    while (this.match(TokenType.OR)) {
      const right = this.parseAndExpr();
      left = { type: "binary", op: "|", left, right };
    }

    return left;
  }

  parseAndExpr() {
    let left = this.parseUnaryCondition();

    while (this.match(TokenType.AND)) {
      const right = this.parseUnaryCondition();
      left = { type: "binary", op: "&", left, right };
    }

    return left;
  }

  parseUnaryCondition() {
    if (this.match(TokenType.NOT)) {
      const operand = this.parseUnaryCondition();
      return { type: "unary", op: "!", operand };
    }

    return this.parseComparisonExpr();
  }

  parseComparisonExpr() {
    // Handle parenthesized conditions. A group followed by a comparison or
    // arithmetic operator (`(a+1)>2`) is arithmetic: reparse it as such.
    if (this.check(TokenType.LPAREN)) {
      const start = this.pos;
      this.advance();
      const expr = this.parseCondition();
      this.expect(TokenType.RPAREN, "Expected ')' after condition");
      if (
        !COMPARISON_TOKENS.includes(this.peek().type) &&
        !ARITHMETIC_TOKENS.includes(this.peek().type)
      ) {
        return expr;
      }
      this.pos = start;
    }

    const left = this.parseAddExpr();
    const opToken = this.match(...COMPARISON_TOKENS);

    if (opToken) {
      const right = this.parseAddExpr();
      return {
        type: "comparison",
        op: COMPARISON_OP_MAP[opToken.type],
        left,
        right,
      };
    }

    // If no comparison operator, this is a truthy check (like isFullPower)
    return left;
  }

  // Assignment expression parsing

  parseAssignmentExpr() {
    if (!this.check(TokenType.IDENTIFIER)) {
      throw new Error(
        `Expected identifier at line ${this.peek().line}, col ${this.peek().col}`
      );
    }

    const idToken = this.advance();

    // Check for target expression in brackets: func[target]
    let target = null;
    if (this.match(TokenType.LBRACKET)) {
      target = this.parseCondition();
      this.expect(TokenType.RBRACKET, "Expected ']' after target expression");
    }

    // Function call: identifier(args) or identifier[target](args)
    // or a named-counter assignment target: effectCounter(name)
    let lhsName = null;
    if (this.match(TokenType.LPAREN)) {
      if (idToken.value === "effectCounter") {
        if (!this.check(TokenType.IDENTIFIER)) {
          throw new Error(
            `Expected counter name at line ${this.peek().line}, col ${this.peek().col}`
          );
        }
        const nameToken = this.advance();
        this.expect(TokenType.RPAREN, "Expected ')' after counter name");
        lhsName = nameToken.value;
      } else {
        const args = this.parseArgumentList();
        return { type: "call", name: idToken.value, target, args };
      }
    }

    // If we have a target but no parens, it's still a call (e.g., countCards[hand])
    if (target) {
      return { type: "call", name: idToken.value, target, args: [] };
    }

    // Assignment: identifier op= expression
    const opToken = this.match(...ASSIGNMENT_TOKENS);
    if (opToken) {
      const rhs = this.parseExpression();
      return {
        type: "assignment",
        lhs: idToken.value,
        ...(lhsName && { lhsName }),
        op: ASSIGNMENT_OP_MAP[opToken.type],
        rhs,
      };
    }

    // Just an identifier (special action)
    return { type: "identifier", name: idToken.value };
  }

  parseArgumentList() {
    const args = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        args.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }
    this.expect(TokenType.RPAREN, "Expected ')' after arguments");
    return args;
  }

  // Arithmetic expression parsing

  parseExpression() {
    return this.parseAddExpr();
  }

  parseAddExpr() {
    let left = this.parseMulExpr();

    while (true) {
      const opToken = this.match(TokenType.PLUS, TokenType.MINUS);
      if (!opToken) break;

      const right = this.parseMulExpr();
      const op = opToken.type === TokenType.PLUS ? "+" : "-";
      left = { type: "binary", op, left, right };
    }

    return left;
  }

  parseMulExpr() {
    let left = this.parseUnaryMath();

    while (true) {
      const opToken = this.match(TokenType.MUL, TokenType.DIV, TokenType.MOD);
      if (!opToken) break;

      const right = this.parseUnaryMath();
      left = { type: "binary", op: MUL_OP_MAP[opToken.type], left, right };
    }

    return left;
  }

  parseUnaryMath() {
    if (this.match(TokenType.MINUS)) {
      const operand = this.parseUnaryMath();
      return { type: "unary", op: "-", operand };
    }

    return this.parsePrimaryExpr();
  }

  parsePrimaryExpr() {
    // Parenthesized expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }

    // Number
    if (this.check(TokenType.NUMBER)) {
      const token = this.advance();
      return { type: "number", value: token.value };
    }

    // Identifier or function call
    if (this.check(TokenType.IDENTIFIER)) {
      const idToken = this.advance();

      // Check for target expression in brackets
      let target = null;
      if (this.match(TokenType.LBRACKET)) {
        target = this.parseCondition();
        this.expect(TokenType.RBRACKET, "Expected ']' after target expression");
      }

      // Check for arguments in parentheses
      if (this.match(TokenType.LPAREN)) {
        const args = this.parseArgumentList();
        return { type: "call", name: idToken.value, target, args };
      }

      // If we have a target but no parens, it's still a call
      if (target) {
        return { type: "call", name: idToken.value, target, args: [] };
      }

      return { type: "identifier", name: idToken.value };
    }

    throw new Error(
      `Unexpected token in expression at line ${this.peek().line}, col ${this.peek().col}`
    );
  }
}
