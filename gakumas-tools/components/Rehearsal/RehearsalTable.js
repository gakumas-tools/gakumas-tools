import React, { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AiOutlineBarChart, AiOutlineBoxPlot } from "react-icons/ai";
import { FaCheck, FaRegImage, FaXmark } from "react-icons/fa6";
import Collapse from "@/components/Collapse";
import c from "@/utils/classNames";
import styles from "./Rehearsal.module.scss";

export default function RehearsalTable({
  data,
  selected,
  onChartClick,
  onRowDelete,
  onCellEdit,
  onVerifyRow,
}) {
  const t = useTranslations("Rehearsal");
  // [rowIndex, stageIndex, scoreIndex] of the cell being edited, or null.
  const [editing, setEditing] = useState(null);
  const [previewRow, setPreviewRow] = useState(null);
  const inputRef = useRef(null);
  // Set while moving focus from one cell to another via Tab. The old input
  // unmounts and fires a blur we must ignore, since the new cell's autoFocus
  // is taking over rather than focus leaving the table.
  const navigatingRef = useRef(false);

  const commitEdit = () => {
    if (!editing || !inputRef.current) return;
    const [i, j, k] = editing;
    const value = parseInt(inputRef.current.value, 10);
    // Skip unchanged values so the charts don't redraw on a plain blur.
    if (!isNaN(value) && value >= 0 && value !== data[i].scores[j][k]) {
      onCellEdit(i, j, k, value);
    }
  };

  const moveTo = ([i, j, k]) => {
    setEditing([i, j, k]);
    setPreviewRow(data[i].src ? i : null);
  };

  // Cell switching happens on mousedown with preventDefault, so the active
  // input never blurs when moving between cells. A real blur therefore means
  // focus left the cells entirely — commit and close the preview.
  const startEditing = (i, j, k) => {
    commitEdit();
    moveTo([i, j, k]);
  };

  // The cell one step forward (or back) in row-major order across the whole
  // table, or null at the very first/last cell.
  const adjacentCell = (i, j, k, back) => {
    const flat = j * 3 + k + (back ? -1 : 1);
    const row = i + Math.floor(flat / 9);
    if (row < 0 || row >= data.length) return null;
    const cell = ((flat % 9) + 9) % 9;
    return [row, Math.floor(cell / 3), cell % 3];
  };

  const tabTo = (next) => {
    commitEdit();
    navigatingRef.current = true;
    moveTo(next);
  };

  // Drop edit/preview state without committing. Nulling the ref also keeps a
  // stray unmount blur from committing a canceled value.
  const cancelEditing = () => {
    inputRef.current = null;
    setEditing(null);
    setPreviewRow(null);
  };

  const stopEditing = () => {
    // A blur fired while Tab-navigating belongs to the old, unmounting input;
    // the new cell's autoFocus will reset the flag. Ignore it.
    if (navigatingRef.current) return;
    commitEdit();
    cancelEditing();
  };
  const [minValue, maxValue] = useMemo(() => {
    const allScores = data.flatMap((row) => row.scores.flat());
    return [Math.min(...allScores), Math.max(...allScores)];
  }, [data]);

  function getCellHeat(value) {
    return { "--heat": (value - minValue) / (maxValue - minValue || 1) };
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr className={styles.chartButtons}>
          <td>
            <button
              type="button"
              className={selected == null ? styles.selected : null}
              onClick={() => onChartClick(null)}
              aria-pressed={selected == null}
            >
              <AiOutlineBoxPlot />
            </button>
          </td>
          {[...Array(9)].map((_, i) => (
            <td key={i} className={i % 3 === 0 ? styles.stageStart : null}>
              <button
                type="button"
                className={selected == i ? styles.selected : null}
                onClick={() => onChartClick(i)}
                aria-pressed={selected == i}
              >
                <AiOutlineBarChart />
              </button>
            </td>
          ))}
          <td className={styles.stageStart} />
        </tr>
        <tr className={styles.stageHeaders}>
          <th />
          {[1, 2, 3].map((n) => (
            <th key={n} colSpan="3" className={styles.stageStart}>
              {t("stage", { n })}
            </th>
          ))}
          <th className={styles.stageStart} />
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => {
          const showPreview = row.src && previewRow === i;
          const rowFlagged = row.flags?.some((f) => f === "flagged");
          return (
            <React.Fragment key={i}>
              <tr>
                {/* preventDefault keeps the active input focused, so blur
                    doesn't close the preview before the click registers. */}
                <td
                  className={styles.action}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => {
                      // The open input never blurs (see onMouseDown above),
                      // so save its value before the delete. Indices shift on
                      // delete; drop any cell/preview state.
                      commitEdit();
                      cancelEditing();
                      onRowDelete(i);
                    }}
                  >
                    <FaXmark />
                  </button>
                </td>
                {row.scores.map((stage, j) => (
                  <React.Fragment key={j}>
                    {stage.map((score, k) => {
                      const isEditing =
                        editing &&
                        editing[0] === i &&
                        editing[1] === j &&
                        editing[2] === k;
                      return (
                        <td
                          key={k}
                          className={c(
                            styles.score,
                            k === 0 && styles.stageStart,
                            isEditing && styles.editing,
                            row.flags?.[j] === "flagged" && styles.flagged,
                          )}
                          style={getCellHeat(score)}
                          onMouseDown={(e) => {
                            if (isEditing) return; // input handles its own clicks
                            e.preventDefault(); // don't blur the active input
                            startEditing(i, j, k);
                          }}
                        >
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              type="text"
                              inputMode="numeric"
                              // Keep the intrinsic width tiny so mounting the
                              // input doesn't expand the column.
                              size={1}
                              defaultValue={score}
                              autoFocus
                              onFocus={(e) => {
                                navigatingRef.current = false;
                                e.target.select();
                              }}
                              onBlur={stopEditing}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.target.blur();
                                if (e.key === "Escape") cancelEditing();
                                if (e.key === "Tab") {
                                  const next = adjacentCell(i, j, k, e.shiftKey);
                                  if (!next) return; // let focus leave the table
                                  e.preventDefault();
                                  tabTo(next);
                                }
                              }}
                            />
                          ) : (
                            score
                          )}
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
                <td
                  className={c(styles.action, styles.stageStart)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {rowFlagged && (
                    <button
                      type="button"
                      className={styles.verify}
                      title={t("confirmRow")}
                      onClick={() => onVerifyRow(i)}
                    >
                      <FaCheck />
                    </button>
                  )}
                  {row.src && (
                    <button
                      type="button"
                      className={previewRow === i ? styles.active : null}
                      onClick={() => setPreviewRow(previewRow === i ? null : i)}
                      aria-expanded={previewRow === i}
                    >
                      <FaRegImage />
                    </button>
                  )}
                </td>
              </tr>
              {row.src && (
                <tr className={styles.previewRow}>
                  <td colSpan={11}>
                    <Collapse open={showPreview}>
                      {/* Natural resolution in a scrollable box, so the scores
                          are readable while the row above stays editable. */}
                      <div className={styles.preview}>
                        <img src={row.src} alt="" />
                      </div>
                    </Collapse>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
