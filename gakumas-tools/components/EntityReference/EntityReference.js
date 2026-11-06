"use client";
import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import EntityBank from "@/components/EntityBank";
import EntityDetails from "@/components/EntityDetails";
import { Link } from "@/i18n/routing";
import { referencePath } from "@/utils/referenceEntities";
import styles from "./EntityReference.module.scss";

function EntityReference({ type }) {
  const t = useTranslations("EntityPage");
  const [selected, setSelected] = useState(null);
  const selectedId = selected?.type == type ? selected.id : null;

  const select = useCallback(({ id }) => setSelected({ type, id }), [type]);

  return (
    <div className={styles.reference}>
      <EntityDetails type={type} id={selectedId} />
      {selectedId && (
        <Link className={styles.open} href={referencePath(type, selectedId)}>
          {t("open")}
        </Link>
      )}
      <EntityBank
        type={type}
        onClick={select}
        selectedId={selectedId}
        includeNull={false}
      />
    </div>
  );
}

export default memo(EntityReference);
