/** Splits PostgreSQL source without splitting semicolons inside strings, comments, or dollar quotes. */
export function splitPostgresStatements(source: string) {
  const statements: string[] = [];
  let statementStart = 0;
  let quote: "'" | '"' | null = null;
  let dollarQuoteTag: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (character === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (character === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (dollarQuoteTag) {
      if (source.startsWith(dollarQuoteTag, index)) {
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      }
      continue;
    }

    if (quote) {
      if (character === quote) {
        if (quote === "'" && next === "'") {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "-" && next === "-") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (character === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === "$") {
      const tag = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        dollarQuoteTag = tag;
        index += tag.length - 1;
        continue;
      }
    }

    if (character === ";") {
      const statement = source.slice(statementStart, index).trim();
      if (statement) statements.push(statement);
      statementStart = index + 1;
    }
  }

  const remainder = source.slice(statementStart).trim();
  if (remainder) statements.push(remainder);
  return statements;
}
