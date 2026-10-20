# react-editable-grid

An editable table for React apps that works like a spreadsheet from the keyboard.

**[Live demo](https://ondrej-novak.github.io/react-editable-grid/)**

Most editable tables in business apps make you click a pencil icon, fill a dialog and save, once per row.
That is fine for one row. It is slow when someone has to check twenty invoice lines against a scanned
document and fix three of them. This component lets them do it the way they would in a spreadsheet:
arrow to the cell, type the new value, press Enter, carry on down the column.

## What it does

- **One tab stop.** Tab into the table, move with the arrow keys or Tab through the cells row by row, Tab
  out past the last one. Read-only cells (computed totals, locked rows) and the row buttons are skipped.
- **Type to replace.** Typing on a selected text or number cell starts editing with that character, as
  in Excel. A select or checkbox never takes a typed letter as its value: selects open on Enter, checkboxes
  toggle on Space.
- **Enter commits and moves down**, Tab commits and moves right, Escape cancels, clicking away commits.
  The selection stays on the table through all of it, so the next key lands where you expect.
- **No false changes.** Opening a cell and leaving it unchanged does not call `onChange`, so a form
  around the table does not become dirty just because someone read a value.
- **Validation per cell**, marked with `aria-invalid` and described for screen readers.
- **Long tables fold.** With `foldAfter`, only the first rows show until the reader asks for the rest.
  Arrowing past the fold opens it, and an invalid row is never folded out of sight.
- **Reordering and deleting** by mouse or with Alt+↑/↓ and Ctrl+Delete, so neither depends on a mouse.
- Follows the WAI-ARIA [grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).
- No dependencies besides React. Styling is one CSS file with custom properties, light and dark.

## Usage

```tsx
import { useState } from 'react';
import { EditableGrid, type Column } from 'react-editable-grid';

interface Line {
  description: string;
  quantity: number | null;
  unit: string;
}

const columns: Column<Line>[] = [
  { key: 'description', header: 'Description', validate: (v) => (v ? undefined : 'Required') },
  { key: 'quantity', header: 'Qty', type: 'number', align: 'end' },
  { key: 'unit', header: 'Unit', type: 'select', options: [{ value: 'h', label: 'Hours' }, { value: 'pcs', label: 'Pieces' }] },
];

export function InvoiceLines() {
  const [lines, setLines] = useState<Line[]>([]);
  return (
    <EditableGrid
      label="Invoice lines"
      rows={lines}
      columns={columns}
      onChange={setLines}
      createRow={() => ({ description: '', quantity: 1, unit: 'h' })}
      foldAfter={10}
    />
  );
}
```

### Props

| Prop | Type | |
|---|---|---|
| `rows` | `Row[]` | The data. The component is controlled and never mutates it. |
| `columns` | `Column<Row>[]` | See below |
| `onChange` | `(rows: Row[]) => void` | Called with a new array after each real change |
| `label` | `string` | Accessible name of the table |
| `createRow` | `() => Row` | Enables "Add row" |
| `readOnly` | `boolean` | Shows the data without editing, adding or reordering |
| `foldAfter` | `number` | Folds a long table to its first rows |

### Columns

| Field | |
|---|---|
| `key` | The row property the column reads and writes |
| `header` | Column title |
| `type` | `'text'` (default), `'number'`, `'select'`, `'checkbox'` |
| `options` | `{ value, label }[]` for a select |
| `readOnly` | `true`, or `(row) => boolean` to lock it for some rows only |
| `validate` | `(value, row) => string \| undefined`, returning the error message |
| `format` | `(value, row) => ReactNode` for display, such as currency |
| `width` | A CSS length, padding included. Columns without one share the space the others leave. |
| `align` | `'start'` (default) or `'end'` |
| `id` | Only needed when two columns share a `key` |

### Styling

The component imports its own CSS file. To change it, override the custom properties on `.eg`:

```css
.eg {
  --eg-accent: #7c3aed;
  --eg-column-min-width: 8rem;
}
```

| Property | |
|---|---|
| `--eg-border`, `--eg-header-bg` | Lines and the header row |
| `--eg-accent` | Selection ring and buttons |
| `--eg-locked-bg`, `--eg-locked-text` | Read-only cells and row controls |
| `--eg-error`, `--eg-error-bg` | Invalid cells |
| `--eg-radius` | Corner radius |
| `--eg-column-min-width` | Narrowest a column without a `width` gets. Default `10rem`. |
| `--eg-min-width` | Below this width the table scrolls sideways instead of squeezing. Default: what all the columns need. |

Light or dark follows the page's `color-scheme`. Set `color-scheme: light dark` on `:root` to follow the
operating system, or set `light` or `dark` from your theme switch. Without it, the table stays light.

## Keys

| Key | |
|---|---|
| Arrows, Home, End | Move between editable cells |
| Any character | Replace a text or number cell |
| Enter, F2 | Edit the cell. In the editor, Enter saves and moves down. |
| Tab, Shift+Tab | Move to the next or previous cell, wrapping to the next or previous row. In the editor, save first. |
| Escape | Cancel the edit |
| Space | Toggle a checkbox cell |
| Delete, Backspace | Clear a text or number cell |
| Alt+↑, Alt+↓ | Move the row |
| Ctrl+Delete, ⌘+Backspace | Delete the row |

## A few details that took more than one try

**Losing focus is two different events.** When focus leaves the table, the selection should go, or every
table on a long form ends up wearing a selection ring. But when Enter commits an edit, the editor is
removed from the page and focus briefly falls to `<body>` before the next cell takes it. Both look the
same in a `blur` handler. The table waits until focus has settled before deciding which one happened.

**Escape and blur both end an edit.** Pressing Escape closes the editor, which blurs it, which would commit
the draft that Escape was meant to throw away. A flag records which one ended the edit first.

**Row keys without ids.** Rows reorder and get deleted, so React needs stable keys, but adding an `id`
field would change the data the caller gets back. Keys live in a `WeakMap` keyed by the row object instead.

## Development

```sh
npm install
npm run dev    # demo on localhost
npm test       # Vitest + Testing Library
npm run build  # demo build for GitHub Pages
```

## License

MIT
