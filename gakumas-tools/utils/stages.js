import { Stages } from "gakumas-data";
import { FaLink } from "react-icons/fa6";

const latestSeason = Math.max(...Stages.getAll().map((s) => s.season));

export function isLatestSeason(stage) {
  return stage.season === latestSeason;
}

export function formatStageName(stage, t) {
  let stageName = "";
  if (stage.id == "custom") {
    stageName = t("custom");
  } else if (stage.type == "contest" || stage.type == "linkContest") {
    stageName = t("contestStageName", {
      season: stage.season,
      stage: stage.stage,
    });
  } else if (stage.type == "event") {
    stageName = t("eventStageName", {
      name: stage.name,
      stage: stage.stage,
      round: stage.round,
    });
  } else if (stage.type == "idolRoad") {
    // The name as the game shows it, from stages.csv, after the road's
    // name so it reads as an Idol Road stage wherever it's listed.
    stageName = t("idolRoadStageName", { name: stage.name });
  }
  if (stage.preview) {
    stageName += "*";
  }
  // Mark after the "*" so a link contest preview doesn't stringify the span
  if (stage.id != "custom" && stage.type == "linkContest") {
    return (
      <span>
        <FaLink />
        {stageName}
      </span>
    );
  }
  return stageName;
}

// The stage's name as plain text (titles, meta tags): a link contest without
// its icon.
export function formatStageNameText(stage, t) {
  if (stage.type == "linkContest") {
    return formatStageName({ ...stage, type: "contest" }, t);
  }
  return formatStageName(stage, t);
}

export function formatStageShortName(stage, t) {
  let stageName = "";
  if (stage.id == "custom") {
    stageName = t("custom");
  } else if (stage.type == "contest") {
    stageName = `${stage.season} - ${stage.stage}`;
  } else if (stage.type == "linkContest") {
    stageName = (
      <span>
        <FaLink /> {stage.season} - {stage.stage}
      </span>
    );
  } else if (stage.type == "event") {
    stageName = `${stage.stage} - ${stage.round}`;
  } else if (stage.type == "idolRoad") {
    stageName = `${stage.stage}`;
  }
  return stageName;
}
