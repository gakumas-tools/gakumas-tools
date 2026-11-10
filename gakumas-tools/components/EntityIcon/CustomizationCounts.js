import { Customizations } from "gakumas-data";
import { countCustomizations } from "gakumas-loadout";
import c from "@/utils/classNames";
import styles from "./EntityIcon.module.scss";

// `size` scales the badges down for icons smaller than the default 60px.
export default function CustomizationCounts({
  customizations = {},
  size = "default",
}) {
  if (!countCustomizations(customizations)) return null;

  return (
    <div className={c(styles.customizations, styles[`${size}Customizations`])}>
      {Object.keys(customizations)
        .filter((c11n) => customizations[c11n] && Customizations.getById(c11n))
        .map((c11n) => (
          <div
            key={c11n}
            className={c(
              styles.badge,
              styles.customization,
              styles[`${size}Badge`],
              styles[Customizations.getById(c11n).type]
            )}
          >
            {customizations[c11n]}
          </div>
        ))}
    </div>
  );
}
