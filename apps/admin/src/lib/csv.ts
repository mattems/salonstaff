/** Saves rows as a CSV file, the first row's keys as its heading. */
export function downloadCsv(name: string, rows: Record<string, string | number | null>[]) {
  const first = rows[0];
  if (!first) return;
  const columns = Object.keys(first);
  const cell = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((c) => cell(row[c] ?? null)).join(",")),
  ];
  const url = URL.createObjectURL(new Blob([`${lines.join("\n")}\n`], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
