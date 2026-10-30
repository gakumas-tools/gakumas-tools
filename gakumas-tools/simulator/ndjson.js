const NON_FINITE = { Infinity, "-Infinity": -Infinity, NaN };

export function encodeLine(message) {
  return (
    JSON.stringify(message, (_, value) =>
      typeof value === "number" && !Number.isFinite(value)
        ? String(value)
        : value,
    ) + "\n"
  );
}

export function decodeLine(line) {
  return JSON.parse(line, (_, value) =>
    typeof value === "string" && Object.hasOwn(NON_FINITE, value)
      ? NON_FINITE[value]
      : value,
  );
}
