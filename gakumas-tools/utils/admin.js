export function isAdmin(session) {
  const adminIds = process.env.ADMIN_DISCORD_IDS?.split(",") ?? [];
  return adminIds.map((id) => id.trim()).includes(session?.user?.id);
}
