import { Footer, Page, Watermark } from "./parts";
import { COLORS, FONT_FAMILY, SITE_HOST } from "./theme";
import { TEXT_FONT_FAMILY } from "@/utils/ogTextFont";

const PAD = 56;
const ICON_SIZE = 48;
const NAME_WIDTH = 294;
// The median column fits a six-digit score (263,076) at 28px; the plot
// takes what the row has left.
const MEDIAN_WIDTH = 140;
const PLOT_WIDTH = 452;
const PLOT_HEIGHT = 34;
const BOX = "#2a8de0";
const BOX_FILL = "#e6f1fc";
const MEDIAN = "#f39800";

const fmt = (v) => Math.round(v).toLocaleString("en-US");

// One run's box on the stage's shared axis, drawn as the board's box plot is:
// whiskers min to max, box q1 to q3, the median as a bar.
function BoxPlot({ stats, xMin, xMax }) {
  const x = (v) => ((v - xMin) / (xMax - xMin)) * PLOT_WIDTH;
  const mid = PLOT_HEIGHT / 2;
  return (
    <svg width={PLOT_WIDTH} height={PLOT_HEIGHT} style={{ flexShrink: 0 }}>
      <line
        x1={x(stats.min)}
        y1={mid}
        x2={x(stats.max)}
        y2={mid}
        stroke={BOX}
        strokeWidth={3}
      />
      <line
        x1={x(stats.min)}
        y1={6}
        x2={x(stats.min)}
        y2={PLOT_HEIGHT - 6}
        stroke={BOX}
        strokeWidth={3}
      />
      <line
        x1={x(stats.max)}
        y1={6}
        x2={x(stats.max)}
        y2={PLOT_HEIGHT - 6}
        stroke={BOX}
        strokeWidth={3}
      />
      <rect
        x={x(stats.q1)}
        y={2}
        width={Math.max(2, x(stats.q3) - x(stats.q1))}
        height={PLOT_HEIGHT - 4}
        fill={BOX_FILL}
        stroke={BOX}
        strokeWidth={3}
      />
      <line
        x1={x(stats.median)}
        y1={2}
        x2={x(stats.median)}
        y2={PLOT_HEIGHT - 2}
        stroke={MEDIAN}
        strokeWidth={6}
      />
    </svg>
  );
}

function RunRow({ rank, run, axis }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, height: 66 }}>
      <div
        style={{
          display: "flex",
          width: 34,
          justifyContent: "flex-end",
          fontSize: 28,
          fontWeight: 800,
          color: COLORS.faint,
        }}
      >
        {rank}
      </div>
      {run.icon ? (
        <img
          src={run.icon}
          width={ICON_SIZE}
          height={ICON_SIZE}
          style={{ borderRadius: 8, flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            width: ICON_SIZE,
            height: ICON_SIZE,
            flexShrink: 0,
            borderRadius: 8,
            backgroundColor: COLORS.border,
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: NAME_WIDTH,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "block",
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {run.name}
        </div>
        {run.by && (
          <div
            style={{
              display: "block",
              fontSize: 20,
              fontWeight: 600,
              color: COLORS.muted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {run.by}
          </div>
        )}
      </div>
      <BoxPlot stats={run.stats} xMin={axis.min} xMax={axis.max} />
      <div
        style={{
          display: "flex",
          width: MEDIAN_WIDTH,
          flexShrink: 0,
          justifyContent: "flex-end",
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        {fmt(run.stats.median)}
      </div>
    </div>
  );
}

/**
 * A stage's board of shared runs as a link card: the stage, then its top
 * runs by median on one score axis, as /shared?stage=<id> lists them.
 * runs: [{ name, by, stats: { min, q1, median, q3, max } }].
 */
export default function BoardCard({ title, stageName, runs, axis, more }) {
  return (
    <Page
      style={{
        fontFamily: `Inter, ${TEXT_FONT_FAMILY}, ${FONT_FAMILY}`,
        flexDirection: "column",
        padding: `${PAD - 8}px ${PAD}px ${PAD - 16}px`,
      }}
    >
      <Watermark size={150} style={{ top: 10, right: -40 }} />
      <div
        style={{
          display: "flex",
          fontSize: 26,
          fontWeight: 700,
          color: COLORS.accentInk,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "block",
          fontSize: 48,
          fontWeight: 800,
          lineHeight: 1.2,
          marginTop: 4,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {stageName}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          padding: "8px 24px",
          borderRadius: 24,
          backgroundColor: COLORS.panel,
          boxShadow: `0 4px 0 ${COLORS.border}`,
        }}
      >
        {runs.map((run, i) => (
          <RunRow key={i} rank={i + 1} run={run} axis={axis} />
        ))}
        {more && (
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 600,
              color: COLORS.muted,
              // Under the names: past the rank, the icon and their gaps.
              padding: `4px 0 8px ${34 + ICON_SIZE + 2 * 18}px`,
            }}
          >
            {more}
          </div>
        )}
      </div>
      <Footer size={34} host={SITE_HOST} style={{ marginTop: "auto" }} />
    </Page>
  );
}
