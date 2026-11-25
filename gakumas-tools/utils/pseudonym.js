import { createHash } from "node:crypto";

// A stable stand-in for an IP or user id that can't be turned back into it.
export function pseudonym(value) {
  return createHash("sha256")
    .update(`${process.env.NEXTAUTH_SECRET || ""}:${value}`)
    .digest("hex")
    .slice(0, 16);
}
