// The workspace drives layout (pinned tools sit beside <main>), so the server
// has to know it at render time. A cookie travels with the request; localStorage
// does not, which is why reading it post-hydration shifted the page.
export const WORKSPACE_COOKIE_KEY = "gakumas-tools.workspace";

// Pre-cookie visitors still have their workspace here. Read once, then migrate.
export const WORKSPACE_STORAGE_KEY = "gakumas-tools.workspace";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const DEFAULT_WORKSPACE = {
  filter: true,
  plan: "sense",
  idolId: 6,
  pinnedTools: [],
};

export function parseWorkspace(value) {
  const workspace = { ...DEFAULT_WORKSPACE };
  if (!value) return workspace;

  // Cookies are written URI-encoded. Decoding is a no-op if a caller hands us
  // an already-decoded value, since the payload never contains a literal "%".
  let text = value;
  try {
    text = decodeURIComponent(value);
  } catch {
    // Malformed encoding — fall through and try the raw value.
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return workspace;
  }
  if (!data || typeof data != "object") return workspace;

  if (typeof data.filter == "boolean") workspace.filter = data.filter;
  if (data.plan) workspace.plan = data.plan;
  if (data.idolId) workspace.idolId = data.idolId;
  if (Array.isArray(data.pinnedTools)) workspace.pinnedTools = data.pinnedTools;

  return workspace;
}

export function serializeWorkspace(workspace) {
  return encodeURIComponent(JSON.stringify(workspace));
}

export function writeWorkspaceCookie(workspace) {
  const secure = window.location.protocol == "https:" ? "; Secure" : "";
  document.cookie =
    `${WORKSPACE_COOKIE_KEY}=${serializeWorkspace(workspace)}` +
    `; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
