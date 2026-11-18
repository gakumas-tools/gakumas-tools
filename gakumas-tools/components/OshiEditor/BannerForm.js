import { useRef, useState } from "react";
import { Idols } from "gakumas-data";
import gkImg from "gakumas-images";
import Button from "@/components/Button";
import ButtonGroup from "@/components/ButtonGroup";
import Checkbox from "@/components/Checkbox";
import IconSelect from "@/components/IconSelect";
import Input from "@/components/Input";
import Oshi from "@/components/Oshi";
import TabGroup from "@/components/TabGroup";
import { routing } from "@/i18n/routing";
import c from "@/utils/classNames";
import {
  idolToken,
  normalizeColor,
  oshiBackground,
  oshiProps,
} from "@/utils/oshi";
import { currentJstHour, weekAfter } from "./jst";
import styles from "./OshiEditor.module.scss";

const LANGUAGES = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "zh-Hans", label: "简体中文" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" },
];

const ACTIONS = [
  { value: "link", label: "Link" },
  { value: "video", label: "YouTube video" },
];

const IDOLS = Idols.getAll().map((idol) => ({
  id: idol.id,
  iconSrc: gkImg(idol).icon,
  alt: idol.name,
}));

const SWATCHES = [
  { name: "gk-orange", colors: ["#f39800"] },
  { name: "vocal", colors: ["#f23584"] },
  { name: "dance", colors: ["#1c85ed"] },
  { name: "visual", colors: ["#f7b12e"] },
  { name: "saki", colors: ["#e2041b"] },
  { name: "temari", colors: ["#007bbb"] },
  { name: "kotone", colors: ["#f7c114"] },
  { name: "mao", colors: ["#7f1184"] },
  { name: "lilja", colors: ["#eafdff"] },
  { name: "china", colors: ["#f68b1f"] },
  { name: "sumika", colors: ["#7cfc00"] },
  { name: "hiro", colors: ["#00afcc"] },
  { name: "rinami", colors: ["#f6adc6"] },
  { name: "ume", colors: ["#ea533a"] },
  { name: "sena", colors: ["#f6ae54"] },
  { name: "misuzu", colors: ["#7a99cf"] },
  { name: "pxw-mao", colors: ["#fa7abc"] },
  { name: "suukawa", colors: ["#f566a4"] },
  { name: "maokoku", colors: ["#f8bdbd"] },
  { name: "payton", colors: ["#36b596"] },
  { name: "mishima", colors: ["#9446ac"] },
  { name: "colorful", colors: ["#fbdb16"] },
  { name: "housoubu", colors: ["#88b1fe", "#fbb0b2"] },
  { name: "gradient-brand", colors: ["#f39800", "#ffb841"] },
  { name: "gradient-hajime", colors: ["#ff9870", "#ffbca3"] },
  { name: "gradient-nia", colors: ["#5a8bff", "#b56bff"] },
  { name: "gradient-hif", colors: ["#6357bb", "#4a8cd0", "#4ec0d8"] },
  { name: "gradient-regular", colors: ["#ffa563", "#ffb0c0"] },
  { name: "gradient-pro", colors: ["#7ea5ff", "#f2a4cc"] },
  { name: "gradient-master", colors: ["#ff5f92", "#ff8f60"] },
  { name: "gradient-legend", colors: ["#7d9cff", "#c88eff", "#ff7db9"] },
];

function DateField({ label, value, onChange, getDefault }) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.dateField}>
        <Input
          className={styles.text}
          type="datetime-local"
          value={value}
          aria-label={label}
          onChange={onChange}
        />
        <Button size="sm" onClick={() => onChange(value ? "" : getDefault())}>
          {value ? "Clear" : "Set"}
        </Button>
      </span>
    </div>
  );
}

export default function BannerForm({ banner, onChange, onDelete }) {
  const textRef = useRef(null);
  const [language, setLanguage] = useState(routing.defaultLocale);
  const text = banner.text[language];

  const filledColors = banner.colors.filter(Boolean).join();

  function setColors(colors) {
    onChange({ colors: banner.colors.map((_, i) => colors[i] ?? "") });
  }

  function setColor(i, value) {
    onChange({
      colors: banner.colors.with(i, value.trim() ? normalizeColor(value) : ""),
    });
  }

  function setText(value) {
    onChange({ text: { ...banner.text, [language]: value } });
  }

  function insertIdol(idolId) {
    const input = textRef.current;
    const token = idolToken(idolId);
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className={styles.form}>
      <div className={styles.preview}>
        <div className={styles.navbarEdge} />
        <Oshi
          key={`${banner.id}-${banner.action}-${banner.initiallyExpanded}`}
          {...oshiProps(banner, language)}
        />
      </div>

      <Checkbox
        label="Enabled"
        checked={banner.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />

      <div className={styles.field}>
        <span className={styles.label}>Text</span>
        <TabGroup
          options={LANGUAGES}
          selected={language}
          onChange={setLanguage}
        />
        <Input
          ref={textRef}
          className={styles.text}
          value={text}
          placeholder={
            language == routing.defaultLocale
              ? ""
              : banner.text[routing.defaultLocale]
          }
          onChange={setText}
        />
        <span className={styles.hint}>
          Tap an idol to insert their icon at the cursor. Empty languages use
          the Japanese text.
        </span>
        <IconSelect options={IDOLS} selected={null} onChange={insertIdol} />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Colour</span>
        <div className={styles.swatches}>
          {SWATCHES.map(({ name, colors }) => (
            <button
              key={name}
              type="button"
              className={c(
                styles.swatch,
                colors.join() == filledColors && styles.selected
              )}
              style={{ background: oshiBackground(colors) }}
              aria-label={name}
              aria-pressed={colors.join() == filledColors}
              data-tooltip-id="panel-info-tooltip"
              data-tooltip-content={name}
              onClick={() => setColors(colors)}
            />
          ))}
        </div>
        <div className={styles.hexes}>
          {banner.colors.map((color, i) => (
            <label key={i} className={styles.hex}>
              <span aria-hidden="true">#</span>
              <Input
                className={styles.text}
                value={color.replace(/^#/, "")}
                aria-label={`Hex colour ${i + 1}`}
                onChange={(value) => setColor(i, value)}
              />
            </label>
          ))}
        </div>
        <span className={styles.hint}>
          Fill in more than one hex code for a gradient.
        </span>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Opens</span>
        <ButtonGroup
          options={ACTIONS}
          selected={banner.action}
          onChange={(action) => onChange({ action })}
        />
      </div>

      <label className={styles.field}>
        <span className={styles.label}>URL</span>
        <Input
          className={styles.text}
          type="url"
          value={banner.url}
          placeholder="https://"
          onChange={(url) => onChange({ url })}
        />
      </label>

      <div className={styles.row}>
        <Checkbox
          label="Start expanded"
          checked={banner.initiallyExpanded}
          onChange={(initiallyExpanded) => onChange({ initiallyExpanded })}
        />
        <Checkbox
          label="Red dot while collapsed"
          checked={banner.hasBadge}
          onChange={(hasBadge) => onChange({ hasBadge })}
        />
      </div>

      <div className={styles.schedule}>
        <DateField
          label="Show from (JST)"
          value={banner.startsAt}
          onChange={(startsAt) => onChange({ startsAt })}
          getDefault={currentJstHour}
        />
        <DateField
          label="Show until (JST)"
          value={banner.endsAt}
          onChange={(endsAt) => onChange({ endsAt })}
          getDefault={() => weekAfter(banner.startsAt || currentJstHour())}
        />
      </div>

      <div>
        <Button style="red-secondary" size="sm" onClick={onDelete}>
          Delete banner
        </Button>
      </div>
    </div>
  );
}
