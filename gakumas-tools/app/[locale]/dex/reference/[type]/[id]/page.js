import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FaChevronLeft } from "react-icons/fa6";
import { Customizations, Descriptions } from "gakumas-data";
import gkImg from "gakumas-images";
import Image from "@/components/Image";
import { Link } from "@/i18n/routing";
import c from "@/utils/classNames";
import { generateMetadataForReference } from "@/utils/metadata";
import { getReferenceEntity } from "@/utils/referenceEntities";
import styles from "./page.module.scss";

export async function generateMetadata({ params }) {
  const { locale, type, id } = await params;
  const entity = getReferenceEntity(type, id);
  if (!entity) notFound();

  return await generateMetadataForReference(entity, type, locale);
}

export default async function EntityPage({ params }) {
  const { locale, type, id } = await params;
  setRequestLocale(locale);

  const entity = getReferenceEntity(type, id);
  if (!entity) notFound();

  const t = await getTranslations({ locale, namespace: "EntityPage" });
  const t_dex = await getTranslations({ locale, namespace: "Dex" });
  const category = t_dex(`tabs.${type}`);
  const { icon, details } = gkImg(entity);
  const description = Descriptions.get(entity);
  const customizations = (entity.availableCustomizations || []).map(
    Customizations.getById,
  );

  return (
    <article className={styles.page}>
      <Link className={styles.back} href={`/dex/reference/${type}`}>
        <FaChevronLeft aria-hidden="true" />
        {t("back", { category })}
      </Link>

      <header className={styles.header}>
        {icon && (
          <div className={styles.icon}>
            <Image src={icon} alt="" fill sizes="80px" />
          </div>
        )}
        <div className={styles.heading}>
          <h1>{entity.name}</h1>
          <div className={styles.tags}>
            {entity.rarity && (
              <span className={styles.tag}>{entity.rarity}</span>
            )}
            {entity.plan && (
              <span className={styles.tag}>
                <Image
                  src={`/plans/${entity.plan}.png`}
                  alt=""
                  width={14}
                  height={14}
                />
                {t_dex(`plans.${entity.plan}`)}
              </span>
            )}
            {entity.unlockPlv > 1 && (
              <span className={styles.tag}>
                {t_dex("unlockPlv", { n: entity.unlockPlv })}
              </span>
            )}
          </div>
        </div>
      </header>

      {(description || details) && (
        <div className={styles.description}>
          {description ? (
            description.split("\n").map((line, i) => <p key={i}>{line}</p>)
          ) : (
            <div className={styles.crop}>
              <Image src={details} alt={entity.name} width={500} height={215} />
            </div>
          )}
        </div>
      )}

      {customizations.length > 0 && (
        <section className={styles.section}>
          <h2>{t("customizations")}</h2>
          <ul className={styles.c11ns}>
            {customizations.map((c11n) => (
              <li key={c11n.id} className={c(styles.c11n, styles[c11n.type])}>
                <span className={styles.name}>{c11n.name}</span>
                <span className={styles.max}>
                  {t_dex("maxTimes", { n: c11n.max })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
