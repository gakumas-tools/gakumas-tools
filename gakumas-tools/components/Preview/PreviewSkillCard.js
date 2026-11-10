import { Customizations } from "gakumas-data";
import gkImg from "gakumas-images";
import { countCustomizations } from "gakumas-loadout";
import { iconSrc } from "./iconSrc";
import PreviewIcon from "./PreviewIcon";
import styles, { CARD_SIZE } from "./Preview.styles";

export default function PreviewSkillCard({
  card,
  customizations,
  idolId,
  imageMap,
}) {
  const src = card && iconSrc(gkImg(card, idolId || 6).icon, imageMap);
  return (
    <PreviewIcon src={src} size={CARD_SIZE}>
      {!!countCustomizations(customizations) && (
        <div style={styles.customizations}>
          {Object.keys(customizations)
            .filter(
              (c11n) => customizations[c11n] && Customizations.getById(c11n),
            )
            .map((c11n) => (
              <div
                key={c11n}
                style={{
                  ...styles.customization,
                  ...styles[Customizations.getById(c11n).type],
                }}
              >
                {customizations[c11n]}
              </div>
            ))}
        </div>
      )}
    </PreviewIcon>
  );
}
