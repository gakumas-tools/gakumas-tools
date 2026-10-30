import DiscordProvider from "next-auth/providers/discord";

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      // Discord now sends `iss` on the OAuth callback; openid-client rejects it unless the issuer is known.
      issuer: "https://discord.com",
    }),
  ],
  callbacks: {
    async session({ session, token, user }) {
      delete session.user.email;
      session.user.id = token.sub;
      return session;
    },
  },
};

export function isAdmin(session) {
  const adminIds = process.env.ADMIN_DISCORD_IDS?.split(",") ?? [];
  return adminIds.map((id) => id.trim()).includes(session?.user?.id);
}
