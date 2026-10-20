import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CellPosition, Column } from './types';
import { CellEditor } from './CellEditor';
import { acceptsTyping, displayValue, isCellReadOnly, parseDraft, sameValue, typeOf } from './cells';
import './EditableGrid.css';

export interface EditableGridProps<Row extends object> {
  rows: Row[];
  columns: Column<Row>[];
  onChange: (rows: Row[]) => void;
  /** Accessible name of the table. */
  label: string;
  /** Creates the row that "Add row" appends. Without it, the table cannot grow. */
  createRow?: () => Row;
  readOnly?: boolean;
  /** Shows only this many rows until the reader asks for the rest. */
  foldAfter?: number;
}

// Folding away one or two rows behind a button reads as a malfunction rather than a tidy-up, so a table
// has to run this far past `foldAfter` before it folds at all.
const FOLD_MARGIN = 2;

const ADD_ROW = '+ Add row';

const PERCENTAGE = /^(?:\d+(?:\.\d*)?|\.\d+)%$/;
const LENGTH = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[a-z]+$/i;

function isLength(width: string) {
  if (LENGTH.test(width)) return true;
  const open = width.indexOf('(');
  if (open < 0 || !width.endsWith(')') || width.length <= open + 2) return false;
  if (!['calc', 'min', 'max', 'clamp', 'var'].includes(width.slice(0, open).toLowerCase())) return false;

  let depth = 0;
  for (let i = open; i < width.length; i++) {
    if (width[i] === '\n' || width[i] === '\r') return false;
    if (width[i] === '(') depth++;
    if (width[i] === ')') {
      depth--;
      if (depth < 0 || (depth === 0 && i !== width.length - 1)) return false;
    }
  }
  return depth === 0;
}

// A fixed layout gives a column without a width only what the others leave, which on a narrow screen is
// nothing. The table is held wide enough for each of them to get `--eg-column-min-width`, and scrolls
// sideways below that. A percentage is of the table, so everything else has to fit in what the percentages
// leave, and percentages that leave nothing count as no width. So does anything else `calc()` cannot add,
// such as `auto` or an empty string, because one such term would invalidate the whole sum.
function minTableWidth(widths: (string | undefined)[]) {
  const trimmed = widths.map((width) => width?.trim() ?? '');
  const percent = trimmed.reduce((sum, width) => sum + (PERCENTAGE.test(width) ? parseFloat(width) : 0), 0);
  const fits = percent < 100;
  const rest = trimmed
    .filter((width) => !(fits && PERCENTAGE.test(width)))
    .map((width) => (isLength(width) ? width : 'var(--eg-column-min-width)'));
  if (rest.length === 0) return '0px';
  const sum = rest.join(' + ');
  return fits && percent > 0 ? `calc((${sum}) * 100 / ${100 - percent})` : `calc(${sum})`;
}

// Where the row at `index` ends up once the row at `from` has moved to `to`.
function indexAfterMove(index: number, from: number, to: number) {
  if (index === from) return to;
  if (from < index && index <= to) return index - 1;
  if (to <= index && index < from) return index + 1;
  return index;
}

export function EditableGrid<Row extends object>({
  rows,
  columns,
  onChange,
  label,
  createRow,
  readOnly = false,
  foldAfter,
}: EditableGridProps<Row>) {
  const gridId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Two layers, as in a spreadsheet. `selected` is where the reader is; `editing` is a cell they opened
  // on purpose, and `draft` is what they have typed into it so far.
  const [rawSelected, setSelected] = useState<CellPosition | null>(null);
  const [editing, setEditing] = useState<CellPosition | null>(null);
  const [draft, setDraft] = useState<unknown>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Focus moves only after a keyboard move. A click has already focused the cell it landed on.
  const pendingFocus = useRef(false);
  // Escape and blur can both end one edit. Whichever runs first owns it.
  const editSettled = useRef(false);
  const blurTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
  }, []);

  // Stable React keys across reorder and delete, without adding an id field to the caller's data.
  const rowKeys = useRef(new WeakMap<Row, string>());
  const keyCounter = useRef(0);
  const keyOf = (row: Row) => {
    let key = rowKeys.current.get(row);
    if (!key) {
      key = `row-${++keyCounter.current}`;
      rowKeys.current.set(row, key);
    }
    return key;
  };

  const errorAt = useCallback((rowIndex: number, col: number): string | undefined => {
    const column = columns[col];
    const row = rows[rowIndex];
    return column?.validate?.(row[column.key], row);
  }, [columns, rows]);

  const foldable = !!foldAfter && rows.length > foldAfter + FOLD_MARGIN;
  const foldsAway = useCallback((rowIndex: number) => foldable && rowIndex >= foldAfter!, [foldable, foldAfter]);

  // An invalid row hidden behind the fold is a problem nobody can see, so the table opens for it.
  const hiddenError = useMemo(
    () => foldable && rows.some((_, r) => foldsAway(r) && columns.some((_, c) => errorAt(r, c))),
    [foldable, rows, columns, foldsAway, errorAt],
  );
  const folded = foldable && !expanded && !hiddenError;
  const visibleCount = folded ? foldAfter! : rows.length;

  // A deleted or folded-away row can take the selected cell with it.
  const selected = rawSelected && rawSelected.row < visibleCount ? rawSelected : null;

  const editable = useCallback(
    (row: number, col: number) => !readOnly && !isCellReadOnly(columns[col], rows[row]),
    [readOnly, columns, rows],
  );

  // The table is a single tab stop. Before anything is selected, it rests on the first editable cell.
  const firstEditable = useMemo(() => {
    for (let r = 0; r < visibleCount; r++) {
      for (let c = 0; c < columns.length; c++) if (editable(r, c)) return { row: r, col: c };
    }
    return null;
  }, [visibleCount, columns.length, editable]);
  const tabStop = selected ?? firstEditable;

  // Walks in the given direction until it finds a cell that can be landed on, so a read-only column
  // is stepped over instead of stopping the walk in front of it.
  const moveSelection = useCallback((row: number, col: number, rowStep = 0, colStep = 0) => {
    for (let r = row, c = col; r >= 0 && r < rows.length && c >= 0 && c < columns.length; r += rowStep, c += colStep) {
      if (editable(r, c)) {
        // The fold is a tidy-up, not the end of the data: arrowing past it opens it.
        if (foldsAway(r)) setExpanded(true);
        pendingFocus.current = true;
        setSelected({ row: r, col: c });
        return true;
      }
      if (rowStep === 0 && colStep === 0) return false;
    }
    return false;
  }, [rows.length, columns.length, editable, foldsAway]);

  const reselect = (position: CellPosition) => {
    pendingFocus.current = true;
    setSelected({ ...position });
  };

  // Tab reads the table like text: along the row, then on from the start of the next one. Only past the
  // last cell, or before the first, does it leave the table.
  const tabFrom = (row: number, col: number, step: 1 | -1) => {
    for (let i = row * columns.length + col + step; i >= 0 && i < rows.length * columns.length; i += step) {
      const r = Math.floor(i / columns.length);
      const c = i % columns.length;
      if (editable(r, c)) return moveSelection(r, c);
    }
    return false;
  };

  useEffect(() => {
    if (!pendingFocus.current || !selected) return;
    pendingFocus.current = false;
    wrapperRef.current
      ?.querySelector<HTMLElement>(`[data-cell="${selected.row}:${selected.col}"]`)
      ?.focus();
  }, [selected]);

  // The key or click that opened the editor has to land in it, with the caret after any typed text.
  useEffect(() => {
    if (!editing) return;
    const control = editorRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
    control?.focus();
    if (control instanceof HTMLInputElement && control.type === 'text') {
      control.setSelectionRange(control.value.length, control.value.length);
    }
  }, [editing]);

  const writeCell = useCallback((row: number, col: number, value: unknown) => {
    const { key } = columns[col];
    // Opening a cell to read it and leaving it alone is not a change.
    if (sameValue(rows[row][key], value)) return;
    onChange(rows.map((r, i) => (i === row ? { ...r, [key]: value } : r)));
  }, [columns, rows, onChange]);

  const startEditing = (row: number, col: number, initial?: string) => {
    if (!editable(row, col)) return;
    editSettled.current = false;
    setDraft(initial ?? rows[row][columns[col].key]);
    setEditing({ row, col });
  };

  const closeEditor = () => {
    editSettled.current = true;
    setEditing(null);
    setDraft(undefined);
  };

  const commitEdit = (row: number, col: number) => {
    if (editSettled.current) return;
    writeCell(row, col, parseDraft(columns[col], draft));
    closeEditor();
  };

  const moveRow = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return false;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    // The selection stays with the row it was on, wherever the move leaves that row.
    setSelected((current) => current && { ...current, row: indexAfterMove(current.row, from, to) });
    return true;
  };

  const handleCellClick = (row: number, col: number) => () => {
    if (!editable(row, col) || (editing?.row === row && editing.col === col)) return;
    // A row the table only opened for because of its error would otherwise fold away under the reader
    // the moment they fix it.
    if (foldsAway(row)) setExpanded(true);
    setSelected({ row, col });
  };

  const handleCellKeyDown = (row: number, col: number) => (event: React.KeyboardEvent) => {
    if (editing) return;
    const column = columns[col];

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !readOnly) {
      event.preventDefault();
      const to = row + (event.key === 'ArrowUp' ? -1 : 1);
      if (!moveRow(row, to)) return;
      // A row moved past the fold opens it, as an arrowed selection does, or the row vanishes with the focus.
      if (foldsAway(to)) setExpanded(true);
      reselect({ row: to, col });
      return;
    }

    // The delete button is out of the tab order, so the keyboard needs its own way to remove a row.
    if ((event.ctrlKey || event.metaKey) && (event.key === 'Delete' || event.key === 'Backspace') && !readOnly) {
      event.preventDefault();
      onChange(rows.filter((_, i) => i !== row));
      // The row below slides into place, and the selection stays on it instead of falling out of the table.
      if (rows.length > 1) reselect({ row: Math.min(row, rows.length - 2), col });
      return;
    }

    if (event.key === 'Tab') {
      if (tabFrom(row, col, event.shiftKey ? -1 : 1)) event.preventDefault();
      return;
    }

    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); moveSelection(row + 1, col, 1, 0); return;
      case 'ArrowUp': event.preventDefault(); moveSelection(row - 1, col, -1, 0); return;
      case 'ArrowRight': event.preventDefault(); moveSelection(row, col + 1, 0, 1); return;
      case 'ArrowLeft': event.preventDefault(); moveSelection(row, col - 1, 0, -1); return;
      case 'Home': event.preventDefault(); moveSelection(row, 0, 0, 1); return;
      case 'End': event.preventDefault(); moveSelection(row, columns.length - 1, 0, -1); return;
      default: break;
    }

    if (!editable(row, col)) return;

    // A checkbox has nothing to type, so the keys that would open an editor toggle it instead.
    if (typeOf(column) === 'checkbox' && (event.key === 'Enter' || event.key === ' ' || event.key === 'F2')) {
      event.preventDefault();
      writeCell(row, col, !rows[row][column.key]);
      return;
    }
    // Enter belongs to the table while a cell is selected, so it cannot submit a form around it.
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing(row, col);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && acceptsTyping(column)) {
      event.preventDefault();
      writeCell(row, col, typeOf(column) === 'number' ? null : '');
      return;
    }
    // Modified keys are shortcuts, not input.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && acceptsTyping(column)) {
      event.preventDefault();
      startEditing(row, col, event.key);
    }
  };

  const handleEditorKeyDown = (row: number, col: number) => (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeEditor();
      reselect({ row, col });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(row, col);
      // Down the column, which is how a table gets checked: one field, every row.
      if (!moveSelection(row + 1, col, 1, 0)) reselect({ row, col });
      return;
    }
    if (event.key === 'Tab') {
      // Leaving the table is left to the browser, and the blur that follows commits the edit.
      if (!tabFrom(row, col, event.shiftKey ? -1 : 1)) return;
      event.preventDefault();
      commitEdit(row, col);
    }
  };

  // A select's own menu can move focus around inside the editor. Only focus leaving it ends the edit.
  const handleEditorBlur = (row: number, col: number) => (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && editorRef.current?.contains(next)) return;
    commitEdit(row, col);
  };

  // The selection ring says "this table is in use". Once focus leaves the table that stops being true,
  // and a ring left behind on every table the reader has visited only adds noise.
  const handleTableBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && wrapperRef.current?.contains(next)) return;
    // Switching to another window is not leaving the table. Coming back should find the same cell.
    if (!next && !document.hasFocus()) return;
    if (next) {
      setSelected(null);
      return;
    }
    // No relatedTarget can mean a click on empty page, or an editor that just closed after Enter while
    // the next cell is about to take focus. Judge it once focus has settled.
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null;
      if (!wrapperRef.current?.contains(document.activeElement)) setSelected(null);
    }, 0);
  };

  const addRow = () => {
    if (!createRow) return;
    const row = createRow();
    onChange([...rows, row]);
    setExpanded(true);
    const col = columns.findIndex((column) => !isCellReadOnly(column, row));
    if (col >= 0) reselect({ row: rows.length, col });
  };

  const deleteRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
    setSelected(null);
  };

  const handleDrop = (target: number) => (event: React.DragEvent) => {
    event.preventDefault();
    if (dragIndex !== null) moveRow(dragIndex, target);
    setDragIndex(null);
  };

  const showActions = !readOnly;
  const canAdd = !!createRow && !readOnly;
  const showFold = foldable && !hiddenError;
  // One list sets both the columns and the table's `min-width`, so the two cannot disagree.
  const columnWidths = [
    ...(showActions ? ['var(--eg-reorder-width)'] : []),
    ...columns.map((column) => column.width),
    ...(showActions ? ['var(--eg-actions-width)'] : []),
  ];
  const percentWidth = columnWidths.reduce((sum, width) => {
    const trimmed = width?.trim() ?? '';
    return sum + (PERCENTAGE.test(trimmed) ? parseFloat(trimmed) : 0);
  }, 0);
  if (percentWidth >= 100) {
    columnWidths.forEach((width, i) => {
      if (width && PERCENTAGE.test(width.trim())) columnWidths[i] = undefined;
    });
  }

  return (
    <div className="eg" ref={wrapperRef} onBlur={handleTableBlur}>
      <div className="eg-scroll">
        <table
          className="eg-table"
          role="grid"
          aria-label={label}
          aria-rowcount={rows.length + 1}
          aria-readonly={readOnly || undefined}
          style={{ '--eg-columns-width': minTableWidth(columnWidths) } as React.CSSProperties}
        >
          <colgroup>
            {columnWidths.map((width, i) => <col key={i} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr role="row" aria-rowindex={1}>
              {showActions && <th role="columnheader" scope="col" className="eg-reorder"><span className="eg-sr-only">Reorder</span></th>}
              {columns.map((column) => (
                <th
                  key={column.id ?? column.key}
                  role="columnheader"
                  scope="col"
                  className={column.align === 'end' ? 'eg-end' : undefined}
                >
                  {column.header}
                </th>
              ))}
              {showActions && <th role="columnheader" scope="col" className="eg-actions"><span className="eg-sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, visibleCount).map((row, r) => (
              <tr
                key={keyOf(row)}
                role="row"
                aria-rowindex={r + 2}
                className={dragIndex === r ? 'eg-dragging' : undefined}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop(r)}
              >
                {showActions && (
                  <td role="gridcell" className="eg-reorder">
                    <span
                      className="eg-handle"
                      draggable
                      aria-hidden
                      title="Drag to reorder (or Alt+Arrow keys on a cell)"
                      onDragStart={() => setDragIndex(r)}
                      onDragEnd={() => setDragIndex(null)}
                    >
                      ⠿
                    </span>
                  </td>
                )}
                {columns.map((column, c) => {
                  const isEditing = editing?.row === r && editing.col === c;
                  const isSelected = selected?.row === r && selected.col === c;
                  const canEdit = editable(r, c);
                  const error = errorAt(r, c);
                  const errorId = error ? `${gridId}-err-${r}-${c}` : undefined;
                  const cellLabel = `${column.header}, row ${r + 1}`;
                  return (
                    <td
                      key={column.id ?? column.key}
                      role="gridcell"
                      data-cell={`${r}:${c}`}
                      tabIndex={!isEditing && tabStop?.row === r && tabStop.col === c ? 0 : -1}
                      aria-selected={canEdit ? isSelected : undefined}
                      aria-readonly={canEdit ? undefined : true}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={errorId}
                      className={[
                        'eg-cell',
                        column.align === 'end' && 'eg-end',
                        isSelected && 'eg-selected',
                        isEditing && 'eg-editing',
                        !canEdit && 'eg-locked',
                        error && 'eg-invalid',
                      ].filter(Boolean).join(' ')}
                      onClick={handleCellClick(r, c)}
                      onDoubleClick={() => { if (typeOf(column) !== 'checkbox') startEditing(r, c); }}
                      onKeyDown={handleCellKeyDown(r, c)}
                    >
                      {isEditing ? (
                        <div ref={editorRef} className="eg-editor" onKeyDown={handleEditorKeyDown(r, c)} onBlur={handleEditorBlur(r, c)}>
                          <CellEditor column={column} value={draft} onChange={setDraft} label={cellLabel} />
                        </div>
                      ) : (
                        <span className="eg-value" title={error}>{displayValue(column, row[column.key], row)}</span>
                      )}
                      {error && <span id={errorId} className="eg-sr-only">{error}</span>}
                    </td>
                  );
                })}
                {showActions && (
                  <td role="gridcell" className="eg-actions">
                    <button
                      type="button"
                      className="eg-delete"
                      tabIndex={-1}
                      aria-label={`Delete row ${r + 1}`}
                      title="Delete row (or Ctrl+Delete on a cell)"
                      onClick={() => deleteRow(r)}
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(canAdd || showFold) && (
        <div className="eg-footer">
          {canAdd && <button type="button" className="eg-add" onClick={addRow}>{ADD_ROW}</button>}
          {canAdd && showFold && <span className="eg-add eg-mirror" aria-hidden>{ADD_ROW}</span>}
          {showFold && (
            <button type="button" className="eg-fold" aria-expanded={!folded} onClick={() => setExpanded(!expanded)}>
              {folded ? `Show all ${rows.length} rows` : `Show first ${foldAfter} rows`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
