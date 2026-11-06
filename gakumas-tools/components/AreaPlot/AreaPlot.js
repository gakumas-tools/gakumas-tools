import { memo, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { S } from "gakumas-engine";
import "@/components/Charts/theme";
import c from "@/utils/classNames";
import styles from "./AreaPlot.module.scss";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

function AreaPlot({ data, plan }) {
  const t = useTranslations("stage");

  const FIELDS = useMemo(
    () => ({
      score: {
        label: t("score"),
        color: "28, 143, 232",
        yAxisID: "y1",
      },
      stamina: {
        label: t("stamina"),
        color: "0, 190, 85",
      },
      genki: {
        label: t("genki"),
        color: "0, 190, 220",
      },
      ...(plan == "sense"
        ? {
            goodConditionTurns: {
              label: t("goodConditionTurns"),
              color: "242, 77, 102",
            },
            concentration: {
              label: t("concentration"),
              color: "243, 152, 0",
            },
          }
        : {}),
      ...(plan == "logic"
        ? {
            goodImpressionTurns: {
              label: t("goodImpressionTurns"),
              color: "232, 190, 0",
            },
            motivation: {
              label: t("motivation"),
              color: "140, 140, 150",
            },
            prideTurns: {
              label: t("prideTurns"),
              color: "240, 120, 160",
            },
          }
        : {}),
      ...(plan == "anomaly"
        ? {
            cumulativeFullPowerCharge: {
              label: t("cumulativeFullPowerCharge"),
              color: "170, 80, 210",
            },
            strengthTimes: {
              label: t("strengthTimes"),
              color: "235, 70, 110",
            },
            preservationTimes: {
              label: t("preservationTimes"),
              color: "40, 170, 170",
            },
            fullPowerTimes: {
              label: t("fullPowerTimes"),
              color: "245, 140, 40",
            },
            // Synthesized: sum of the three stance-times series. The engine
            // exposes `stanceChangedTimes` only as a derived resolver, so we
            // compute it here from the components rather than add a state
            // field.
            stanceChangedTimes: {
              label: t("stanceChangedTimes"),
              color: "130, 90, 240",
              compute: (data) => {
                const a = data[S.strengthTimes] || [];
                const b = data[S.preservationTimes] || [];
                const c = data[S.fullPowerTimes] || [];
                const n = Math.max(a.length, b.length, c.length);
                const out = [];
                for (let i = 0; i < n; i++) {
                  out.push((a[i] || 0) + (b[i] || 0) + (c[i] || 0));
                }
                return out;
              },
            },
          }
        : {}),
    }),
    [t, plan]
  );

  const [activeFields, setActiveFields] = useState({
    stamina: true,
    score: true,
  });

  const options = {
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        grid: { display: false },
        title: {
          display: true,
          text: t("turn"),
        },
      },
      y: {
        title: {
          display: true,
          text: t("average"),
        },
        type: "linear",
        display: true,
        position: "left",
        beginAtZero: true,
      },
      y1: {
        type: "linear",
        display: activeFields.score,
        position: "right",
        beginAtZero: true,
        grid: {
          display: false,
        },
      },
    },
  };

  const formattedData = {
    labels: data[S.score].map((_, i) => i),
    datasets: Object.keys(FIELDS)
      .filter((f) => activeFields[f])
      .map((field) => {
        const config = FIELDS[field];
        const raw = config.compute ? config.compute(data) : data[S[field]];
        return {
          label: config.label,
          data: raw.map((v) => parseFloat(v.toFixed(2))),
          backgroundColor: `rgba(${config.color}, 0.14)`,
          borderColor: `rgb(${config.color})`,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: true,
          yAxisID: config.yAxisID || "y",
        };
      }),
  };

  return (
    <div>
      <div className={styles.fieldButtons}>
        {Object.keys(FIELDS).map((field) => (
          <button
            key={field}
            className={c(activeFields[field] && styles.selected)}
            aria-pressed={!!activeFields[field]}
            onClick={() =>
              setActiveFields({
                ...activeFields,
                [field]: !activeFields[field],
              })
            }
          >
            {FIELDS[field].label}
          </button>
        ))}
      </div>

      <Line data={formattedData} options={options} />
    </div>
  );
}

export default memo(AreaPlot);
