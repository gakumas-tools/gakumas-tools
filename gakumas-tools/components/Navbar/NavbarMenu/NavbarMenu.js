"use client";
import { memo, Suspense, useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FaCircleUser, FaGithub, FaXTwitter } from "react-icons/fa6";
import { SiKofi } from "react-icons/si";
import Button from "@/components/Button";
import IconButton from "@/components/IconButton";
import Image from "@/components/Image";
import { Link, usePathname } from "@/i18n/routing";
import c from "@/utils/classNames";
import styles from "./NavbarMenu.module.scss";

const discordSignIn = () => signIn("discord");

const LANGUAGES = [
  ["en", "English"],
  ["ja", "日本語"],
  ["zh-Hans", "简体中文"],
  ["ko", "한국어"],
];

function LanguageLinks({ locale, query }) {
  const pathname = usePathname();
  return LANGUAGES.filter(([value]) => value != locale).map(
    ([value, label]) => (
      <Link key={value} href={{ pathname, query }} locale={value}>
        {label}
      </Link>
    )
  );
}

// Keep the query string when switching languages: some tools (the tier
// list) keep their whole state in it.
function LanguageLinksWithQuery({ locale }) {
  const searchParams = useSearchParams();
  return (
    <LanguageLinks locale={locale} query={Object.fromEntries(searchParams)} />
  );
}

function NavbarMenu() {
  const t = useTranslations("NavbarMenu");

  const locale = useLocale();
  const { data: session, status } = useSession();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  return (
    <div className={styles.menu}>
      <button
        className={styles.avatar}
        aria-label={t("menu")}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {status == "authenticated" ? (
          <Image
            src={session.user.image}
            alt=""
            fill
            sizes="32px"
            draggable={false}
          />
        ) : (
          <FaCircleUser />
        )}
      </button>

      <div
        className={c(styles.overlay, expanded && styles.expanded)}
        onClick={() => setExpanded(false)}
      >
        <div
          className={c(styles.dropdown, expanded && styles.expanded)}
          onClick={(e) => e.stopPropagation()}
        >
          {status == "unauthenticated" && (
            <div className={styles.signIn}>
              <Button style="primary" onClick={discordSignIn} fill>
                {t("signInWithDiscord")}
              </Button>
            </div>
          )}

          <Link href="/" onClick={() => setExpanded(false)}>
            {t("home")}
          </Link>

          <a href="https://wikiwiki.jp/gakumas/" target="_blank">
            {t("gakumasContestWiki")}
          </a>

          <div className={styles.author}>
            <div>Made by risりす</div>
            <div className={styles.socials}>
              <IconButton
                icon={FaXTwitter}
                href="https://x.com/surisuririsu"
                size="small"
                ariaLabel="X"
              />
              <IconButton
                icon={FaGithub}
                href="https://github.com/gakumas-tools/gakumas-tools"
                size="small"
                ariaLabel="GitHub"
              />
              <IconButton
                icon={SiKofi}
                href="https://ko-fi.com/surisuririsu"
                size="small"
                ariaLabel="Ko-fi"
              />
            </div>
            <div className={styles.fine}>
              with research from the Gakumas contest community
            </div>
          </div>

          <Suspense fallback={<LanguageLinks locale={locale} />}>
            <LanguageLinksWithQuery locale={locale} />
          </Suspense>

          {status == "authenticated" && (
            <button onClick={signOut}>{t("signOut")}</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(NavbarMenu);
