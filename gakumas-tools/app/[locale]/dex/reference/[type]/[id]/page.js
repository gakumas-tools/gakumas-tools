import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Customizations } from "gakumas-data";
import gkImg from "gakumas-images";
import Image from "@/components/Image";
import { Link } from "@/i18n/routing";
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
  const { details } = gkImg(entity);
  const customizations = (entity.availableCustomizations || []).map(
    Customizations.getById,
  );

  return (
    <article className={styles.page}>
      <Link className={styles.back} href={`/dex/reference/${type}`}>
        {t("back", { category })}
      </Link>
      <h1>{entity.name}</h1>
      <dl className={styles.facts}>
        {entity.rarity && (
          <div>
            <dt>{t("rarity")}</dt>
            <dd>{entity.rarity}</dd>
          </div>
        )}
        {entity.plan && (
          <div>
            <dt>{t("plan")}</dt>
            <dd>{t_dex(`plans.${entity.plan}`)}</dd>
          </div>
        )}
        {entity.unlockPlv > 1 && (
          <div>
            <dt>{t("unlockPlv")}</dt>
            <dd>{entity.unlockPlv}</dd>
          </div>
        )}
      </dl>
      {details && (
        <Image
          className={styles.details}
          src={details}
          alt={entity.name}
          width={500}
          height={215}
        />
      )}
      {customizations.length > 0 && (
        <section>
          <h2>{t("customizations")}</h2>
          <ul className={styles.customizations}>
            {customizations.map((c11n) => (
              <li key={c11n.id}>
                <span>{c11n.name}</span>
                <span>{t_dex("maxTimes", { n: c11n.max })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
