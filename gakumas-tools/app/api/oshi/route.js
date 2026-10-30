import { getServerSession } from "next-auth/next";
import { authOptions, isAdmin } from "@/utils/auth";
import { validateOshiSettings } from "@/utils/oshi";
import { saveOshiSettings } from "@/utils/oshiStore";

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { settings, error } = validateOshiSettings(await request.json());
  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  await saveOshiSettings(settings);
  return Response.json({ settings });
}
