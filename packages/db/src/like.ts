/** An `ilike` pattern that matches `text` anywhere, with its wildcards taken literally. */
export function contains(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
