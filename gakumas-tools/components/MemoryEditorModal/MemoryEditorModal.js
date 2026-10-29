"use client";
import { memo, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FaChevronDown } from "react-icons/fa6";
import { PIdols, SkillCards } from "gakumas-data";
import gkImg from "gakumas-images";
import Collapse from "@/components/Collapse";
import ConfirmModal from "@/components/ConfirmModal";
import Image from "@/components/Image";
import Input from "@/components/Input";
import MemorySave from "@/components/MemorySave";
import Modal from "@/components/Modal";
import ParametersInput from "@/components/ParametersInput";
import PIdolSelect from "@/components/PIdolSelect";
import StagePItems from "@/components/StagePItems";
import StageSkillCards from "@/components/StageSkillCards";
import MemoryContext from "@/contexts/MemoryContext";
import ModalContext from "@/contexts/ModalContext";
import WorkspaceContext from "@/contexts/WorkspaceContext";
import { MAX_NAME_LENGTH } from "@/utils/apiValidation";
import { calculateContestPowerBreakdown } from "@/utils/contestPower";
import c from "@/utils/classNames";
import styles from "./MemoryEditorModal.module.scss";

function MemoryEditorModal() {
  const t = useTranslations("MemoryEditorModal");

  const {
    name,
    setName,
    pIdolId,
    setPIdolId,
    params,
    setParams,
    pItemIds,
    replacePItemId,
    skillCardIds,
    replaceSkillCardId,
    customizations,
    replaceCustomizations,
    dirty,
  } = useContext(MemoryContext);
  const { setModal, closeModal } = useContext(ModalContext);
  const { idolId: workspaceIdolId } = useContext(WorkspaceContext);

  const [powerOpen, setPowerOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);

  const idolId = PIdols.getById(pIdolId)?.idolId || workspaceIdolId;

  const powerBreakdown = useMemo(
    () =>
      calculateContestPowerBreakdown(
        params,
        pItemIds,
        skillCardIds,
        customizations
      ),
    [params, pItemIds, skillCardIds, customizations]
  );

  const costBreakdown = useMemo(
    () =>
      skillCardIds
        .filter((id) => id)
        .map((id) => {
          const card = SkillCards.getById(id);
          return {
            id,
            name: card.name,
            cost: card.sourceType === "pIdol" ? 0 : card.contestPower,
            card,
          };
        }),
    [skillCardIds]
  );

  const skillCardCost = useMemo(
    () => costBreakdown.reduce((acc, cur) => acc + cur.cost, 0),
    [costBreakdown]
  );

  const dismiss = () => {
    if (!dirty) {
      closeModal();
      return;
    }
    setModal(
      <ConfirmModal
        message={t("confirmDiscard")}
        confirmLabel={t("discard")}
        cancelLabel={t("keepEditing")}
        danger
        onConfirm={closeModal}
      />
    );
  };

  return (
    <Modal onDismiss={dismiss}>
      <div className={styles.memoryEditor}>
        <div className={styles.name}>
          <Input
            placeholder={t("name")}
            value={name}
            onChange={setName}
            maxLength={MAX_NAME_LENGTH}
          />
        </div>

        <PIdolSelect selected={pIdolId} onChange={setPIdolId} />

        <div className={styles.params}>
          <ParametersInput
            parameters={params}
            onChange={setParams}
            withStamina
          />
        </div>

        <StagePItems
          pItemIds={pItemIds}
          replacePItemId={replacePItemId}
          size="medium"
        />

        <StageSkillCards
          skillCardIds={skillCardIds}
          customizations={customizations}
          replaceSkillCardId={replaceSkillCardId}
          replaceCustomizations={replaceCustomizations}
          idolId={idolId}
        />

        <div className={styles.stats}>
          <button
            type="button"
            className={c(styles.stat, powerOpen && styles.statOpen)}
            onClick={() => setPowerOpen((v) => !v)}
            aria-expanded={powerOpen}
          >
            <span className={styles.statLabel}>{t("contestPower")}</span>
            <span className={styles.statValue}>{powerBreakdown.total}</span>
            <FaChevronDown className={styles.caret} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={c(styles.stat, costOpen && styles.statOpen)}
            onClick={() => setCostOpen((v) => !v)}
            aria-expanded={costOpen}
          >
            <span className={styles.statLabel}>{t("cost")}</span>
            <span className={styles.statValue}>{skillCardCost}</span>
            <FaChevronDown className={styles.caret} aria-hidden="true" />
          </button>
        </div>

        <Collapse open={powerOpen}>
          <ul className={styles.breakdown}>
            <li>
              <span>{t("parameters")}</span>
              <span>{powerBreakdown.paramPower}</span>
            </li>
            <li>
              <span>{t("pItems")}</span>
              <span>{powerBreakdown.pItemPower}</span>
            </li>
            <li>
              <span>{t("skillCards")}</span>
              <span>{powerBreakdown.skillCardPower}</span>
            </li>
            <li>
              <span>{t("customizations")}</span>
              <span>{powerBreakdown.customizationPower}</span>
            </li>
          </ul>
        </Collapse>

        <Collapse open={costOpen && costBreakdown.length > 0}>
          <ul className={styles.breakdown}>
            {costBreakdown.map((item, i) => (
              <li key={`${i}_${item.id}`}>
                <Image
                  src={gkImg(item.card, idolId).icon}
                  width={24}
                  height={24}
                  alt=""
                />
                <span className={styles.breakdownName}>{item.name}</span>
                <span>{item.cost}</span>
              </li>
            ))}
          </ul>
        </Collapse>

        <MemorySave />
      </div>
    </Modal>
  );
}

export default memo(MemoryEditorModal);
