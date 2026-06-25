/**
 * Converts a store name into a URL-friendly slug.
 *
 * - Lowercases the input.
 * - Replaces runs of non-alphanumeric characters with a single hyphen.
 * - Strips leading/trailing hyphens.
 * - Returns "store" when the result would be empty (e.g. Japanese-only names).
 */
export function slugify(name: string): string {
  const result = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return result || "store";
}

/**
 * Builds a unique slug by appending a 5-character random alphanumeric suffix.
 *
 * Example: "My Cafe" → "my-cafe-x4k2p"
 */
export function buildSlug(name: string): string {
  return `${slugify(name)}-${randomSuffix(5)}`;
}

function randomSuffix(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
