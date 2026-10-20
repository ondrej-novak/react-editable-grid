import type { Column, ColumnType } from './types';

export const typeOf = <Row,>(column: Column<Row>): ColumnType => column.type ?? 'text';

export function isCellReadOnly<Row>(column: Column<Row> | undefined, row: Row | undefined): boolean {
  if (!column || !row) return true;
  return typeof column.readOnly === 'function' ? column.readOnly(row) : !!column.readOnly;
}

// Typing a character replaces the cell, the way a spreadsheet does. That only makes sense where the
// typed text is the value: a select stores an option's code and a checkbox a boolean, so seeding either
// with a keystroke would write a stray letter into structured data.
export const acceptsTyping = <Row,>(column: Column<Row>): boolean =>
  typeOf(column) === 'text' || typeOf(column) === 'number';

/** Turns what the editor holds into the value the row stores. */
export function parseDraft<Row>(column: Column<Row>, draft: unknown): unknown {
  if (typeOf(column) !== 'number') return draft;
  if (draft === '' || draft === null || draft === undefined) return null;
  const parsed = Number(String(draft).replace(',', '.'));
  return Number.isNaN(parsed) ? draft : parsed;
}

export function displayValue<Row>(column: Column<Row>, value: unknown, row: Row): React.ReactNode {
  if (column.format) return column.format(value, row);
  if (value === null || value === undefined || value === '') return '';
  if (typeOf(column) === 'checkbox') return value ? '✓' : '';
  if (typeOf(column) === 'select') return column.options?.find((o) => o.value === value)?.label ?? String(value);
  return String(value);
}

export const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
