import { ViewTransition } from "react";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { getServerSession } from "next-auth";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import Navbar from "@/components/Navbar";
import PinnedTools from "@/components/PinnedTools";
import Tooltips from "@/components/Tooltips";
import WebVitals from "@/components/WebVitals";
import { DataContextProvider } from "@/contexts/DataContext";
import { LoadoutContextProvider } from "@/contexts/LoadoutContext";
import { LoadoutUrlContextProvider } from "@/contexts/LoadoutUrlContext";
import { SimulationRunsContextProvider } from "@/contexts/SimulationRunsContext";
import { MemoryCalculatorContextProvider } from "@/contexts/MemoryCalculatorContext";
import { MemoryContextProvider } from "@/contexts/MemoryContext";
import { ModalContextProvider } from "@/contexts/ModalContext";
import { SearchContextProvider } from "@/contexts/SearchContext";
import { SessionContextProvider } from "@/contexts/SessionContext";
import { WorkspaceContextProvider } from "@/contexts/WorkspaceContext";
import { routing } from "@/i18n/routing";
import { authOptions } from "@/utils/auth";
import { GA_ID } from "@/utils/logging";
import { generateDefaultMetadata } from "@/utils/metadata";
import { activeOshiProps } from "@/utils/oshi";
import { getCachedOshiSettings } from "@/utils/oshiStore";
import { parseWorkspace, WORKSPACE_COOKIE_KEY } from "@/utils/workspace";
import styles from "./layout.module.scss";
import "../globals.scss";

const inter = Inter({ subsets: ["latin"] });

const TOOL_SWITCH = { "nav-tool": "tool-switch", default: "none" };

export const viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export async function generateMetadata({ params }) {
  const { locale } = await params;

  return await generateDefaultMetadata(locale);
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ params, children }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const messages = await getMessages();
  const session = await getServerSession(authOptions);

  const workspaceCookie = (await cookies()).get(WORKSPACE_COOKIE_KEY);
  const initialWorkspace = workspaceCookie
    ? parseWorkspace(workspaceCookie.value)
    : null;
  const oshi = activeOshiProps(await getCachedOshiSettings(), locale);

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <SessionContextProvider session={session}>
          <NextIntlClientProvider messages={messages}>
            <WorkspaceContextProvider initialWorkspace={initialWorkspace}>
              <Navbar oshi={oshi} />
              <DataContextProvider>
                <MemoryCalculatorContextProvider>
                  <MemoryContextProvider>
                    <SearchContextProvider>
                      <LoadoutUrlContextProvider>
                        <LoadoutContextProvider>
                          <SimulationRunsContextProvider>
                            <ModalContextProvider>
                              <div className={styles.tools}>
                                <PinnedTools />
                                <ViewTransition
                                  update={TOOL_SWITCH}
                                  default="none"
                                >
                                  <main>{children}</main>
                                </ViewTransition>
                              </div>
                              <Tooltips />
                            </ModalContextProvider>
                          </SimulationRunsContextProvider>
                        </LoadoutContextProvider>
                      </LoadoutUrlContextProvider>
                    </SearchContextProvider>
                  </MemoryContextProvider>
                </MemoryCalculatorContextProvider>
              </DataContextProvider>
            </WorkspaceContextProvider>
          </NextIntlClientProvider>
        </SessionContextProvider>
        <WebVitals />
      </body>
      <GoogleAnalytics gaId={GA_ID} />
    </html>
  );
}
