/**
 * Triggers a browser download of `blob` named `filename`. The link is
 * attached to the document before clicking (some browsers require this
 * for `download` to fire reliably), and the object URL is revoked on a
 * delay rather than immediately — callers that navigate away right after
 * must not race the download's start.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Triggers a browser download of `data` as a JSON file named `filename`. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, filename);
}

/** Wraps a CSV field in quotes (doubling any internal quotes) if it
 * contains a comma, quote, or newline. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Triggers a browser download of `headers` + `rows` as a CSV file named
 * `filename`. Prefixes a UTF-8 BOM so Excel (the expected reader for
 * Japanese-text CSVs) doesn't mis-detect the encoding.
 */
export function downloadCsv(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
): void {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(","));
  const csv = `\uFEFF${lines.join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}
