import { turnSegments } from "./turnSegments";
import styles from "./TurnIndicator.module.scss";

export default function TurnIndicator({ turn }) {
  const { remaining, multiplier } = turn;
  const { turnsElapsed, totalTurns, remainingTurns, currentTurnType } =
    turnSegments(turn);
  const gapAngle = 5;
  const segmentAngle = 360 / totalTurns;

  return (
    <div className={styles.turnIndicatorContainer}>
      <div className={styles.turnIndicator}>
        <svg className={styles.ring} viewBox="0 0 100 100">
          {remainingTurns.map((turnType, remainingIndex) => {
            const index = turnsElapsed + remainingIndex;
            const startAngle = -index * segmentAngle - gapAngle / 2;
            const endAngle = -(index + 1) * segmentAngle + gapAngle / 2;
            const largeArcFlag = segmentAngle - gapAngle > 180 ? 1 : 0;

            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;

            const innerRadius = 35;
            const outerRadius = 45;

            const x1 = 50 + innerRadius * Math.cos(startRad);
            const y1 = 50 + innerRadius * Math.sin(startRad);
            const x2 = 50 + outerRadius * Math.cos(startRad);
            const y2 = 50 + outerRadius * Math.sin(startRad);
            const x3 = 50 + outerRadius * Math.cos(endRad);
            const y3 = 50 + outerRadius * Math.sin(endRad);
            const x4 = 50 + innerRadius * Math.cos(endRad);
            const y4 = 50 + innerRadius * Math.sin(endRad);

            const pathData = [
              `M ${x1} ${y1}`,
              `L ${x2} ${y2}`,
              `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${x3} ${y3}`,
              `L ${x4} ${y4}`,
              `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${x1} ${y1}`,
            ].join(" ");

            return (
              <path
                key={index}
                d={pathData}
                className={styles.segment}
                data-turn-type={turnType}
              />
            );
          })}

          {remainingTurns.length > 0 &&
            (() => {
              const firstSegmentIndex = turnsElapsed;
              const currentStartAngle =
                -firstSegmentIndex * segmentAngle - gapAngle / 2;
              const currentEndAngle =
                -(firstSegmentIndex + 1) * segmentAngle + gapAngle / 2;
              const segmentMiddleAngle =
                (currentStartAngle + currentEndAngle) / 2;
              const pointerRotation = segmentMiddleAngle + 90;

              return (
                <g transform={`rotate(${pointerRotation} 50 50)`}>
                  <polygon
                    points="50,10 40,-2 60,-2"
                    className={styles.pointer}
                  />
                </g>
              );
            })()}
        </svg>

        <div className={styles.center}>
          <span className={styles.number}>{remaining}</span>
        </div>
      </div>
      {multiplier && (
        <div className={styles.multiplier} data-turn-type={currentTurnType}>
          {Math.round(multiplier * 100)}%
        </div>
      )}
    </div>
  );
}
