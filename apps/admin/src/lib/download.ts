/**
 * Triggers a browser download of `data` as a JSON file named `filename`.
 * The link is attached to the document before clicking (some browsers
 * require this for `download` to fire reliably), and the object URL is
 * revoked on a delay rather than immediately — callers that navigate
 * away right after must not race the download's start.
 */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
