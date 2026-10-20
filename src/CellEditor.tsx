import type { Column } from './types';
import { typeOf } from './cells';

interface CellEditorProps<Row> {
  column: Column<Row>;
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
}

export function CellEditor<Row>({ column, value, onChange, label }: CellEditorProps<Row>) {
  switch (typeOf(column)) {
    case 'select':
      return (
        <select aria-label={label} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="" />
          {column.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'checkbox':
      return <input type="checkbox" aria-label={label} checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case 'number':
      return (
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return <input type="text" aria-label={label} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
  }
}
