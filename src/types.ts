export type ColumnType = 'text' | 'number' | 'select' | 'checkbox';

export interface SelectOption {
  value: string;
  label: string;
}

export interface Column<Row> {
  /** Needed only when two columns share a `key`, such as a computed column next to its source. */
  id?: string;
  /** The row property this column reads and writes. */
  key: keyof Row & string;
  header: string;
  type?: ColumnType;
  /** Options for a `select` column. */
  options?: SelectOption[];
  /** A computed column, or one that is locked for some rows only. */
  readOnly?: boolean | ((row: Row) => boolean);
  /** Returns an error message for an invalid value, or nothing when the value is fine. */
  validate?: (value: unknown, row: Row) => string | undefined;
  /** Renders the value when the cell is not being edited. */
  format?: (value: unknown, row: Row) => React.ReactNode;
  /** A CSS length or a percentage of the table, padding included. Columns without one share the space the others leave. */
  width?: string;
  align?: 'start' | 'end';
}

export interface CellPosition {
  row: number;
  col: number;
}
