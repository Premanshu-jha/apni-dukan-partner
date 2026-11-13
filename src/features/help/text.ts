/**
 * The length the backend will count (MessageText.clean): look-alike letters made normal (NFKC), invisible characters
 * dropped, spaces before a line break dropped, at most two empty lines in a row, the ends trimmed. Counting the same way here means Send is never on for a message the backend refuses.
 */
export function cleanedLength(text: string): number {
  return text
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    // invisible characters the backend drops (format, control, private use, unassigned), keeping line breaks and tabs
    .replace(/(?![\n\t])[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}\u2028\u2029]/gu, '')
    .replace(/[ \t\u00A0]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim().length
}

/** What to say for a refused send: the field the backend named, in words, else its message. */
export function sendError(details: Record<string, unknown> | undefined, fallback: string): string {
  const message = details?.message
  const subject = details?.subject
  if (typeof subject === 'string') return `The subject: ${subject}.`
  if (typeof message === 'string') return `Your message: ${message}.`
  return fallback
}
