import { getServerSession } from "next-auth/next";
import { readJsonBody } from "@/utils/apiValidation";
import { authOptions, isAdmin } from "@/utils/auth";
import { validateOshiSettings } from "@/utils/oshi";
import { saveOshiSettings } from "@/utils/oshiStore";

const MAX_BODY_BYTES = 512_000;

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return new Response("Forbidden", { status: 403 });
  }

  const read = await readJsonBody(request, MAX_BODY_BYTES);
  if (read.error) return new Response(read.error, { status: read.status });
  const { settings, error } = validateOshiSettings(read.body);
  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  await saveOshiSettings(settings);
  return Response.json({ settings });
}
