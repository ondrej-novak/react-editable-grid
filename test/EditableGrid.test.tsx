import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditableGrid } from '../src';
import type { Column } from '../src';

interface Item {
  name: string;
  qty: number | null;
  unit: string;
  taxable: boolean;
  total?: number;
}

const columns: Column<Item>[] = [
  { key: 'name', header: 'Item', validate: (v) => (v ? undefined : 'Item is required') },
  { key: 'qty', header: 'Qty', type: 'number', align: 'end' },
  { key: 'unit', header: 'Unit', type: 'select', options: [{ value: 'pcs', label: 'Pieces' }, { value: 'h', label: 'Hours' }] },
  { key: 'taxable', header: 'Taxable', type: 'checkbox' },
  { key: 'total', header: 'Total', readOnly: true },
];

const item = (name: string, qty = 1): Item => ({ name, qty, unit: 'pcs', taxable: false, total: qty * 10 });

function Harness({ initial, onChange = () => {}, foldAfter }: { initial: Item[]; onChange?: (rows: Item[]) => void; foldAfter?: number }) {
  const [rows, setRows] = useState(initial);
  return (
    <>
      <button type="button">Before</button>
      <EditableGrid
        label="Invoice lines"
        rows={rows}
        columns={columns}
        foldAfter={foldAfter}
        createRow={() => item('')}
        onChange={(next) => { setRows(next); onChange(next); }}
      />
      <button type="button">After</button>
    </>
  );
}

const cell = (row: number, col: number) =>
  screen.getAllByRole('row')[row + 1].querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`)!;

describe('EditableGrid', () => {
  it('is a single tab stop that rests on the first editable cell', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[item('Apples'), item('Pears')]} />);
    await user.tab();
    await user.tab();
    expect(cell(0, 0)).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
  });

  it('moves through the cells with Tab, row by row, skipping the row controls', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[item('Apples'), item('Pears')]} />);
    await user.click(cell(0, 2));
    await user.tab();
    expect(cell(0, 3)).toHaveFocus();
    await user.tab(); // Total is read-only, so this is the end of the row
    expect(cell(1, 0)).toHaveFocus();
    await user.tab({ shift: true });
    expect(cell(0, 3)).toHaveFocus();
    await user.click(cell(1, 3));
    await user.tab();
    expect(screen.getByRole('button', { name: '+ Add row' })).toHaveFocus();
  });

  it('commits on Shift+Tab at the start of a row and moves to the end of the one above', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples'), item('Pears')]} onChange={onChange} />);
    await user.click(cell(1, 0));
    await user.keyboard('Kiwi{Shift>}{Tab}{/Shift}');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Apples' }), expect.objectContaining({ name: 'Kiwi' })]);
    expect(cell(0, 3)).toHaveFocus();
  });

  it('deletes the selected row with Ctrl+Delete and keeps the selection in the table', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples'), item('Pears'), item('Plums')]} onChange={onChange} />);
    await user.click(cell(1, 0));
    await user.keyboard('{Control>}{Delete}{/Control}');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Apples' }), expect.objectContaining({ name: 'Plums' })]);
    expect(cell(1, 0)).toHaveFocus();
  });

  it('moves with the arrow keys and steps over read-only cells', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[item('Apples'), item('Pears')]} />);
    await user.click(cell(0, 3));
    await user.keyboard('{ArrowRight}');
    expect(cell(0, 3)).toHaveFocus(); // Total is read-only, so there is nowhere to go
    await user.keyboard('{ArrowDown}{Home}');
    expect(cell(1, 0)).toHaveFocus();
    expect(cell(1, 0)).toHaveAttribute('aria-selected', 'true');
  });

  it('replaces a text cell by typing and commits on Enter, moving down the column', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples'), item('Pears')]} onChange={onChange} />);
    await user.click(cell(0, 0));
    await user.keyboard('Plums{Enter}');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Plums' }), expect.objectContaining({ name: 'Pears' })]);
    expect(cell(1, 0)).toHaveFocus();
  });

  it('edits in place with Enter and parses numbers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples', 2)]} onChange={onChange} />);
    await user.click(cell(0, 1));
    await user.keyboard('{Enter}5{Enter}');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ qty: 25 })]);
    expect(cell(0, 1)).toHaveFocus(); // last row, so the selection stays put
  });

  it('cancels with Escape and leaves the data alone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples')]} onChange={onChange} />);
    await user.click(cell(0, 0));
    await user.keyboard('Plums{Escape}');
    expect(onChange).not.toHaveBeenCalled();
    expect(cell(0, 0)).toHaveTextContent('Apples');
    expect(cell(0, 0)).toHaveFocus();
  });

  it('does not report a change when an edit leaves the value as it was', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples')]} onChange={onChange} />);
    await user.click(cell(0, 0));
    await user.keyboard('{F2}{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits on Tab and moves to the next editable cell', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples')]} onChange={onChange} />);
    await user.click(cell(0, 0));
    await user.keyboard('Kiwi{Tab}');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Kiwi' })]);
    expect(cell(0, 1)).toHaveFocus();
  });

  it('commits when focus leaves the editor', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples')]} onChange={onChange} />);
    await user.click(cell(0, 0));
    await user.keyboard('Kiwi');
    await user.click(screen.getByRole('button', { name: 'After' }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Kiwi' })]);
  });

  it('drops the selection once focus leaves the table', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[item('Apples')]} />);
    await user.click(cell(0, 0));
    expect(cell(0, 0)).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'After' }));
    expect(cell(0, 0)).toHaveAttribute('aria-selected', 'false');
  });

  it('does not seed a select with a typed letter, but opens it on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples')]} onChange={onChange} />);
    await user.click(cell(0, 2));
    await user.keyboard('x');
    expect(within(cell(0, 2)).queryByRole('combobox')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    await user.selectOptions(within(cell(0, 2)).getByRole('combobox'), 'h');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ unit: 'h' })]);
    expect(cell(0, 2)).toHaveTextContent('Hours');
  });

  it('toggles a checkbox cell with Space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples')]} onChange={onChange} />);
    await user.click(cell(0, 3));
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ taxable: true })]);
  });

  it('clears a cell with Delete', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples', 3)]} onChange={onChange} />);
    await user.click(cell(0, 1));
    await user.keyboard('{Delete}');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ qty: null })]);
  });

  it('marks an invalid cell and describes the error', () => {
    render(<Harness initial={[item('')]} />);
    expect(cell(0, 0)).toHaveAttribute('aria-invalid', 'true');
    expect(cell(0, 0)).toHaveAccessibleDescription('Item is required');
  });

  it('moves a row with Alt+Arrow and keeps the selection on it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[item('Apples'), item('Pears')]} onChange={onChange} />);
    await user.click(cell(0, 0));
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Pears' }), expect.objectContaining({ name: 'Apples' })]);
    expect(cell(1, 0)).toHaveFocus();
  });

  it('adds and deletes rows', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[item('Apples')]} />);
    await user.click(screen.getByRole('button', { name: '+ Add row' }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(cell(1, 0)).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete row 1' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('keeps the selection on a row dragged to another place', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[item('Apples'), item('Pears'), item('Plums')]} />);
    await user.click(cell(0, 0));
    fireEvent.dragStart(screen.getAllByTitle(/Drag to reorder/)[0]);
    fireEvent.drop(screen.getAllByRole('row')[3]);
    expect(cell(2, 0)).toHaveTextContent('Apples');
    expect(cell(2, 0)).toHaveAttribute('aria-selected', 'true');
    expect(cell(0, 0)).toHaveAttribute('aria-selected', 'false');
  });

  describe('table width', () => {
    const free = 'var(--eg-column-min-width)';
    const widthWith = (widths: (string | undefined)[], readOnly = true) => {
      const sized = widths.map((width, i) => ({ ...columns[i], width }));
      const { unmount } = render(
        <EditableGrid label="Invoice lines" rows={[item('Apples')]} columns={sized} onChange={() => {}} readOnly={readOnly} />,
      );
      const value = screen.getByRole('grid').style.getPropertyValue('--eg-columns-width');
      unmount();
      return value;
    };

    it('is what all the columns need, row controls included', () => {
      expect(widthWith(['12rem', undefined], false)).toBe(`calc(var(--eg-reorder-width) + 12rem + ${free} + var(--eg-actions-width))`);
      expect(widthWith(['12rem', undefined])).toBe(`calc(12rem + ${free})`);
    });

    it('counts a width that cannot be added up as none', () => {
      expect(widthWith(['', 'auto', ' 5rem '])).toBe(`calc(${free} + ${free} + 5rem)`);
    });

    it('fits the other columns into what percentage widths leave', () => {
      expect(widthWith(['40%', '6rem', undefined])).toBe(`calc((6rem + ${free}) * 100 / 60)`);
      expect(widthWith(['60%', '40%', undefined])).toBe(`calc(${free} + ${free} + ${free})`);
      expect(widthWith(['50%'])).toBe('0px');
    });

    it('uses the fallback for percentage columns that leave no space', () => {
      const sized = ['60%', '40%', undefined].map((width, i) => ({ ...columns[i], width }));
      render(<EditableGrid label="Invoice lines" rows={[item('Apples')]} columns={sized} onChange={() => {}} readOnly />);
      const cols = screen.getByRole('grid').querySelectorAll('col');
      expect(Array.from(cols, (col) => (col as HTMLElement).style.width)).toEqual(['', '', '']);
    });
  });

  describe('folding', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`Item ${i + 1}`));

    it('shows the first rows and opens on request', async () => {
      const user = userEvent.setup();
      render(<Harness initial={many} foldAfter={5} />);
      expect(screen.getAllByRole('row')).toHaveLength(1 + 5);
      await user.click(screen.getByRole('button', { name: 'Show all 12 rows' }));
      expect(screen.getByRole('button', { name: 'Show first 5 rows' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('opens when the arrow keys walk past the fold', async () => {
      const user = userEvent.setup();
      render(<Harness initial={many} foldAfter={5} />);
      await user.click(cell(4, 0));
      await user.keyboard('{ArrowDown}');
      expect(cell(5, 0)).toHaveFocus();
    });

    it('opens when a row is moved past the fold, keeping the focus on it', async () => {
      const user = userEvent.setup();
      render(<Harness initial={many} foldAfter={5} />);
      await user.click(cell(4, 0));
      await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
      expect(cell(5, 0)).toHaveTextContent('Item 5');
      expect(cell(5, 0)).toHaveFocus();
    });

    it('stays a tab stop when folding hides the selected cell', async () => {
      const user = userEvent.setup();
      render(<Harness initial={many} foldAfter={5} />);
      await user.click(screen.getByRole('button', { name: 'Show all 12 rows' }));
      await user.click(cell(8, 0));
      await user.click(screen.getByRole('button', { name: 'Show first 5 rows' }));
      await user.tab({ shift: true });
      expect(screen.getByRole('button', { name: '+ Add row' })).toHaveFocus();
      await user.tab({ shift: true });
      expect(cell(0, 0)).toHaveFocus();
    });

    it('does not fold away a row that needs fixing', () => {
      render(<Harness initial={[...many.slice(0, 11), item('')]} foldAfter={5} />);
      expect(cell(11, 0)).toHaveAttribute('aria-invalid', 'true');
    });

    it('stays open once the row it opened for is fixed', async () => {
      const user = userEvent.setup();
      render(<Harness initial={[...many.slice(0, 11), item('')]} foldAfter={5} />);
      await user.click(cell(11, 0));
      await user.keyboard('Kiwi');
      await user.click(screen.getByRole('button', { name: 'After' }));
      expect(cell(11, 0)).toHaveTextContent('Kiwi');
      expect(screen.getAllByRole('row')).toHaveLength(1 + 12);
    });

    it('does not fold a table that is only slightly longer than the limit', () => {
      render(<Harness initial={many.slice(0, 7)} foldAfter={5} />);
      expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
    });
  });
});
