import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { setRequestLocale } from "next-intl/server";
import OshiEditor from "@/components/OshiEditor";
import { authOptions, isAdmin } from "@/utils/auth";
import { readOshiSettings } from "@/utils/oshiStore";

export const metadata = {
  title: "Oshi banner - Gakumas Tools",
  robots: { index: false, follow: false },
};

export default async function BannerAdminPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) notFound();

  return (
    <OshiEditor
      initialSettings={await readOshiSettings()}
      initialNow={Date.now()}
    />
  );
}
