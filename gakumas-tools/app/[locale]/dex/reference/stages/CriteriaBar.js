import styles from "./page.module.scss";

// The stage's criteria as the stage picker draws them: Vo, Da, Vi widths.
export default function CriteriaBar({ criteria }) {
  const values = ["vocal", "dance", "visual"].map((k) => criteria?.[k] || 0);
  if (!values.every((v) => v)) return null;
  return (
    <span className={styles.criteria} aria-hidden="true">
      {values.map((v, i) => (
        <span key={i} style={{ flexGrow: v * 100 }} />
      ))}
    </span>
  );
}
