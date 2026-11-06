import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Scatter } from "react-chartjs-2";
import "@/components/Charts/theme";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

const PARAMETER_NAMES = ["Vo", "Da", "Vi"];
const PARAMETER_COLORS = ["#d62a6e", "#1470d0", "#e89e00"];
const PARAMETER_COLORS_TRANSPARENT = [
  "rgba(214, 42, 110, 0.35)",
  "rgba(20, 112, 208, 0.35)",
  "rgba(232, 158, 0, 0.35)",
];

function LineChart({
  paramOrder,
  paramRegimes,
  scores,
  gainedParams,
}) {
  const t = useTranslations("Calculator");

  const options = useMemo(
    () => ({
      scales: {
        x: {
          type: "linear",
          position: "bottom",
          title: {
            display: true,
            text: t("score"),
            padding: 1,
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: t("parameter"),
            padding: 0,
          },
        },
      },

      plugins: {
        legend: {
          display: false,
        },
      },
    }),
    [t]
  );

  const data = useMemo(
    () => ({
      datasets: paramOrder
        .map((order, i) => {
          const regimes = paramRegimes[order];
          // Each regime's line starts at its threshold; plot the value it
          // gives there, not its intercept.
          const data = regimes.map(({ threshold, multiplier, constant }) => ({
            x: threshold,
            y: threshold * multiplier + constant,
          }));
          return {
            label: PARAMETER_NAMES[i],
            data,
            pointRadius: 2,
            showLine: true,
            borderWidth: 2,
            borderColor: PARAMETER_COLORS[i],
            backgroundColor: PARAMETER_COLORS[i],
          };
        })
        .concat(
          scores.map((score, i) => ({
            data: [{ x: score, y: gainedParams[i] }],
            pointRadius: 8,
            borderColor: PARAMETER_COLORS[i],
            backgroundColor: PARAMETER_COLORS_TRANSPARENT[i],
          }))
        ),
    }),
    [paramOrder, paramRegimes, scores, gainedParams]
  );

  return <Scatter options={options} data={data} />;
}

export default memo(LineChart);
