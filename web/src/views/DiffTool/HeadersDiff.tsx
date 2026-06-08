import { cn } from '@/lib/cn';

interface HeadersDiffProps {
  left: Record<string, string> | undefined;
  right: Record<string, string> | undefined;
}

type RowKind = 'added' | 'removed' | 'changed' | 'equal';

interface Row {
  name: string;
  leftVal: string;
  rightVal: string;
  kind: RowKind;
}

function buildRows(
  left: Record<string, string> = {},
  right: Record<string, string> = {},
): Row[] {
  const allKeys = new Set([
    ...Object.keys(left).map((k) => k.toLowerCase()),
    ...Object.keys(right).map((k) => k.toLowerCase()),
  ]);

  const rows: Row[] = [];
  for (const key of allKeys) {
    const lVal = left[key] ?? Object.entries(left).find(([k]) => k.toLowerCase() === key)?.[1] ?? '';
    const rVal = right[key] ?? Object.entries(right).find(([k]) => k.toLowerCase() === key)?.[1] ?? '';

    let kind: RowKind;
    if (!lVal) kind = 'added';
    else if (!rVal) kind = 'removed';
    else if (lVal !== rVal) kind = 'changed';
    else kind = 'equal';

    rows.push({ name: key, leftVal: lVal, rightVal: rVal, kind });
  }

  const order: Record<RowKind, number> = { removed: 0, added: 1, changed: 2, equal: 3 };
  rows.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
  return rows;
}

const kindBg: Record<RowKind, string> = {
  added: 'bg-emerald-50 dark:bg-emerald-900/20',
  removed: 'bg-red-50 dark:bg-red-900/20',
  changed: 'bg-amber-50 dark:bg-amber-900/20',
  equal: '',
};

const kindText: Record<RowKind, string> = {
  added: 'text-emerald-700 dark:text-emerald-300',
  removed: 'text-red-700 dark:text-red-300',
  changed: 'text-amber-700 dark:text-amber-300',
  equal: 'text-neutral-400',
};

const kindBadge: Record<RowKind, string> = {
  added: '+',
  removed: '−',
  changed: '~',
  equal: '=',
};

export function HeadersDiff({ left, right }: HeadersDiffProps) {
  const rows = buildRows(left, right);

  return (
    <div className="overflow-auto font-mono text-xs">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-700 text-neutral-500">
            <th className="w-6 p-1 text-center" />
            <th className="p-1 text-left">Header</th>
            <th className="p-1 text-left">Left</th>
            <th className="p-1 text-left">Right</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className={cn('border-b border-neutral-100 dark:border-neutral-800', kindBg[row.kind])}>
              <td className={cn('p-1 text-center font-bold', kindText[row.kind])}>
                {kindBadge[row.kind]}
              </td>
              <td className="p-1 font-semibold text-neutral-700 dark:text-neutral-300">
                {row.name}
              </td>
              <td className={cn('p-1 break-all', row.kind === 'added' ? 'text-neutral-300 dark:text-neutral-600' : '')}>
                {row.leftVal || <span className="text-neutral-300">—</span>}
              </td>
              <td className={cn('p-1 break-all', row.kind === 'removed' ? 'text-neutral-300 dark:text-neutral-600' : '')}>
                {row.rightVal || <span className="text-neutral-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
