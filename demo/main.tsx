import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditableGrid } from '../src';
import type { Column } from '../src';
import './demo.css';

interface Line {
  description: string;
  quantity: number | null;
  unit: string;
  price: number | null;
  billable: boolean;
}

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' });
const lineTotal = (line: Line) => (line.quantity ?? 0) * (line.price ?? 0);

const columns: Column<Line>[] = [
  { key: 'description', header: 'Description', validate: (v) => (String(v ?? '').trim() ? undefined : 'Description is required') },
  {
    key: 'quantity',
    header: 'Qty',
    type: 'number',
    align: 'end',
    width: '6rem',
    validate: (v) => (typeof v === 'number' && v > 0 ? undefined : 'Enter a quantity above zero'),
  },
  {
    key: 'unit',
    header: 'Unit',
    type: 'select',
    width: '8rem',
    options: [
      { value: 'h', label: 'Hours' },
      { value: 'day', label: 'Days' },
      { value: 'pcs', label: 'Pieces' },
    ],
  },
  {
    key: 'price',
    header: 'Unit price',
    type: 'number',
    align: 'end',
    width: '8rem',
    format: (v) => (typeof v === 'number' ? money.format(v) : ''),
  },
  { key: 'billable', header: 'Billable', type: 'checkbox', width: '6rem' },
  // A computed column: always read-only, and the arrow keys step over it.
  {
    id: 'total',
    key: 'price',
    header: 'Total',
    readOnly: true,
    align: 'end',
    width: '8rem',
    format: (_, line) => money.format(lineTotal(line)),
  },
];

const initial: Line[] = [
  { description: 'Discovery workshop', quantity: 1, unit: 'day', price: 800, billable: true },
  { description: 'Design system audit', quantity: 12, unit: 'h', price: 75, billable: true },
  { description: 'Component library setup', quantity: 24, unit: 'h', price: 75, billable: true },
  { description: 'Accessibility review', quantity: 6, unit: 'h', price: 75, billable: true },
  { description: 'Project management', quantity: 4, unit: 'h', price: 60, billable: false },
  { description: 'Playwright test suite', quantity: 16, unit: 'h', price: 75, billable: true },
  { description: 'CI pipeline', quantity: 1, unit: 'day', price: 600, billable: true },
  { description: 'Usability testing sessions', quantity: 5, unit: 'pcs', price: 120, billable: true },
  { description: 'Handover documentation', quantity: 8, unit: 'h', price: 60, billable: true },
  { description: 'Support hours', quantity: 10, unit: 'h', price: 70, billable: true },
];

function App() {
  const [lines, setLines] = useState(initial);
  const total = lines.filter((l) => l.billable).reduce((sum, l) => sum + lineTotal(l), 0);

  return (
    <main>
      <h1>react-editable-grid</h1>
      <p className="lead">
        An editable table that works like a spreadsheet from the keyboard. Click a cell, or Tab into the table, and try the keys below.
      </p>

      <EditableGrid
        label="Invoice lines"
        rows={lines}
        columns={columns}
        onChange={setLines}
        foldAfter={6}
        createRow={() => ({ description: '', quantity: 1, unit: 'h', price: 75, billable: true })}
      />

      <p className="total">Billable total: <strong>{money.format(total)}</strong></p>

      <section>
        <h2>Keys</h2>
        <dl className="keys">
          <dt><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></dt><dd>Move between cells, skipping read-only ones</dd>
          <dt>Any character</dt><dd>Replace a text or number cell</dd>
          <dt><kbd>Enter</kbd> / <kbd>F2</kbd></dt><dd>Edit the cell; Enter again saves and moves down</dd>
          <dt><kbd>Tab</kbd></dt><dd>While editing, save and move right</dd>
          <dt><kbd>Esc</kbd></dt><dd>Cancel the edit</dd>
          <dt><kbd>Space</kbd></dt><dd>Toggle a checkbox cell</dd>
          <dt><kbd>Delete</kbd></dt><dd>Clear a text or number cell</dd>
          <dt><kbd>Alt</kbd> + <kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move the row</dd>
        </dl>
      </section>

      <details>
        <summary>Data passed to <code>onChange</code></summary>
        <pre>{JSON.stringify(lines, null, 2)}</pre>
      </details>

      <footer>
        <a href="https://github.com/ondrej-novak/react-editable-grid">Source on GitHub</a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
