export function lazyParse(records, parse) {
  const unparsed = new Set(records);

  return {
    one(record) {
      if (unparsed.delete(record)) parse(record);
      return record;
    },
    all() {
      unparsed.forEach(parse);
      unparsed.clear();
      return records;
    },
  };
}
