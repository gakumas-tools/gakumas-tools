import { existsSync, readFileSync } from "node:fs";

const FOLDER = new URL("./fixtures/ingame/", import.meta.url);

export const hasIngameFixtures = existsSync(FOLDER);

export function loadIngameFixture(name) {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FOLDER), "utf8"));
}
