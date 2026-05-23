/** Normalize user-typed text into a form the fast-path classifier can match. */
export function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\s+/g, " ");
}
