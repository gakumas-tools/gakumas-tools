import { useContext } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import ModalContext from "@/contexts/ModalContext";
import styles from "./ConfirmModal.module.scss";

export default function ConfirmModal({
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}) {
  const t = useTranslations("ConfirmModal");

  const { closeModal } = useContext(ModalContext);

  const confirm = () => {
    if (onConfirm) onConfirm();
    closeModal();
  };

  const cancel = () => {
    if (onCancel) onCancel();
    closeModal();
  };

  return (
    <Modal size="small">
      <h3>{message}</h3>
      <div className={styles.buttons}>
        <Button style="default" fill onClick={cancel}>
          {cancelLabel || t("cancel")}
        </Button>
        <Button style={danger ? "red" : "primary"} fill onClick={confirm}>
          {confirmLabel || t("ok")}
        </Button>
      </div>
    </Modal>
  );
}
