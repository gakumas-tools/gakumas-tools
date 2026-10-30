import { getServerSession } from "next-auth/next";
import { authOptions } from "@/utils/auth";
import { handleSimulationRequest } from "@/simulator/server";

export async function POST(request) {
  return handleSimulationRequest(
    request,
    await getServerSession(authOptions),
  );
}
