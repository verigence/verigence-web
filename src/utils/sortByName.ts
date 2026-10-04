const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** A new list in name order: A to Z, ignoring case, numbers in their natural order, blanks last. */
export function sortByName<T>(items: readonly T[], nameOf: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => {
    const x = (nameOf(a) ?? '').trim();
    const y = (nameOf(b) ?? '').trim();
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return collator.compare(x, y);
  });
}
