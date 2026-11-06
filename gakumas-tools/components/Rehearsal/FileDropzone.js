import { memo, useState } from "react";
import { FaArrowUpFromBracket } from "react-icons/fa6";
import c from "@/utils/classNames";
import styles from "./FileDropzone.module.scss";

function FileDropzone({
  title,
  hint,
  accept,
  multiple,
  disabled,
  onFiles,
  children,
}) {
  const [over, setOver] = useState(false);

  return (
    <label
      className={c(
        styles.dropzone,
        over && styles.over,
        disabled && styles.disabled
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && e.dataTransfer.files.length) {
          // The file picker enforces `multiple`; a drop doesn't.
          const files = Array.from(e.dataTransfer.files);
          onFiles(multiple ? files : files.slice(0, 1));
        }
      }}
    >
      <input
        className={styles.input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <span className={styles.tile} aria-hidden="true">
        <FaArrowUpFromBracket />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.hint}>{hint}</span>
        {children}
      </span>
    </label>
  );
}

export default memo(FileDropzone);
