import { memo, useContext, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { FaXmark } from "react-icons/fa6";
import ModalContext, { ModalLayerContext } from "@/contexts/ModalContext";
import c from "@/utils/classNames";
import styles from "./Modal.module.scss";

const INLINE_LAYER = { closing: false, covered: false, stacked: false };
const EXIT_FALLBACK_MS = 400;

function Modal({ children, dismissable = true, onClose, onDismiss, size }) {
  const t = useTranslations("Modal");
  const { closeModal: contextClose, getModalStackDepth } =
    useContext(ModalContext);
  const close = onClose || contextClose;
  const dismiss = onDismiss || close;
  // When `onClose` is provided, the modal is rendered inline by a parent
  // rather than pushed onto the global stack. If a stacked modal is currently
  // on top, defer ESC to it instead of closing ourselves alongside it.
  const isInline = !!onClose;
  const layer = useContext(ModalLayerContext);
  const { closing, covered, stacked, onExited } =
    (!isInline && layer) || INLINE_LAYER;
  const active = !closing && !covered;
  const modalRef = useRef(null);
  const mouseDownOnOverlayRef = useRef(false);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onExited, EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [closing, onExited]);

  useEffect(() => {
    if (!modalRef.current) return;
    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      modalRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && dismissable) {
        if (isInline && getModalStackDepth() > 0) return;
        e.preventDefault();
        dismiss();
        return;
      }

      if (e.key !== "Tab" || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, dismissable, dismiss, isInline, getModalStackDepth]);

  const handleOverlayMouseDown = (e) => {
    mouseDownOnOverlayRef.current = e.target === e.currentTarget;
  };

  const handleOverlayMouseUp = (e) => {
    // Only dismiss when both the press and the release land on the overlay
    // itself. A drag that crosses the overlay/modal boundary in either
    // direction fires `click` on the nearest common ancestor (the overlay),
    // which would otherwise look indistinguishable from a real outside click.
    const shouldDismiss =
      active &&
      dismissable &&
      mouseDownOnOverlayRef.current &&
      e.target === e.currentTarget;
    mouseDownOnOverlayRef.current = false;
    if (shouldDismiss) dismiss();
  };

  return (
    <div
      className={c(
        styles.overlay,
        stacked && styles.stacked,
        covered && styles.covered,
        closing && styles.closing
      )}
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onExited();
      }}
    >
      <div
        ref={modalRef}
        className={c(styles.modal, size == "small" && styles.small)}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
      >
        {dismissable && (
          <button
            type="button"
            className={styles.close}
            onClick={dismiss}
            aria-label={t("close")}
          >
            <FaXmark aria-hidden="true" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export default memo(Modal);
