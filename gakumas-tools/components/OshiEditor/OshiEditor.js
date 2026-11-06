"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import c from "@/utils/classNames";
import { DEFAULT_BANNER, validateOshiSettings } from "@/utils/oshi";
import BannerForm from "./BannerForm";
import BannerTimeline from "./BannerTimeline";
import { currentJstHour, fromJstInput, toJstInput, weekAfter } from "./jst";
import styles from "./OshiEditor.module.scss";

const MAX_COLORS = 3;
const NOW_TICK_MS = 60 * 1000;

function toForm(banner) {
  return {
    ...banner,
    colors: [...banner.colors, ...Array(MAX_COLORS).fill("")].slice(
      0,
      MAX_COLORS
    ),
    startsAt: toJstInput(banner.startsAt),
    endsAt: toJstInput(banner.endsAt),
  };
}

function toPayload(banner) {
  return {
    ...banner,
    startsAt: fromJstInput(banner.startsAt),
    endsAt: fromJstInput(banner.endsAt),
  };
}

function toSchedule(banner) {
  const date = (value) => {
    const parsed = value && new Date(fromJstInput(value));
    return parsed && !isNaN(parsed) ? parsed : null;
  };
  return {
    ...banner,
    startsAt: date(banner.startsAt),
    endsAt: date(banner.endsAt),
  };
}

async function putSettings(payload) {
  try {
    const res = await fetch("/api/oshi", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return {};
    const { error } = await res.json().catch(() => ({}));
    return { error: error ?? `Save failed (${res.status})` };
  } catch {
    return { error: "Save failed" };
  }
}

export default function OshiEditor({ initialSettings, initialNow }) {
  const router = useRouter();
  const [banners, setBanners] = useState(() =>
    initialSettings.banners.map(toForm)
  );
  const [savedBanners, setSavedBanners] = useState(banners);
  const [selectedId, setSelectedId] = useState(banners[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const payload = { banners: banners.map(toPayload) };
  const { error, index: errorIndex } = validateOshiSettings(payload);
  const dirty = JSON.stringify(banners) != JSON.stringify(savedBanners);
  const selected = banners.find(({ id }) => id == selectedId);
  // An edit made while a save was in flight leaves the editor dirty after
  // the save reports success, so "Saved" only shows while nothing is dirty.
  const shownNotice = notice?.tone == "success" && dirty ? null : notice;
  const message = error
    ? { text: error, tone: "error" }
    : (shownNotice ?? (dirty ? { text: "Unsaved changes" } : null));

  function change(nextBanners) {
    setBanners(nextBanners);
    setNotice(null);
  }

  function updateSelected(changes) {
    change(
      banners.map((banner) =>
        banner.id == selectedId ? { ...banner, ...changes } : banner
      )
    );
  }

  function add() {
    const startsAt = currentJstHour();
    const banner = {
      ...toForm({ ...DEFAULT_BANNER, id: crypto.randomUUID() }),
      startsAt,
      endsAt: weekAfter(startsAt),
    };
    change([...banners, banner]);
    setSelectedId(banner.id);
  }

  function remove() {
    const index = banners.findIndex(({ id }) => id == selectedId);
    const remaining = banners.filter(({ id }) => id != selectedId);
    change(remaining);
    setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id);
  }

  async function save() {
    setSaving(true);
    const { error } = await putSettings(payload);
    setSaving(false);

    if (error) {
      setNotice({ text: error, tone: "error" });
    } else {
      setSavedBanners(banners);
      setNotice({ text: "Saved", tone: "success" });
      router.refresh();
    }
  }

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <h1 className={styles.title}>Oshi banners</h1>
        <Button size="sm" onClick={add}>
          Add banner
        </Button>
      </div>

      {banners.length == 0 ? (
        <span className={styles.hint}>No banners yet.</span>
      ) : (
        <BannerTimeline
          banners={banners.map(toSchedule)}
          selectedId={selectedId}
          errorIndex={errorIndex}
          now={now}
          onSelect={setSelectedId}
        />
      )}

      {selected && (
        <BannerForm
          key={selected.id}
          banner={selected}
          onChange={updateSelected}
          onDelete={remove}
        />
      )}

      <div className={styles.footer}>
        <span className={c(styles.message, message && styles[message.tone])}>
          {message?.text}
        </span>
        <Button
          style="primary"
          onClick={save}
          disabled={!dirty || !!error || saving}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
