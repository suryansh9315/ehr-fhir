/**
 * Strips common EHR formatting artifacts from clinical notes.
 * Does not remove clinical content — only normalizes whitespace and metadata noise.
 */
export function preprocessNote(text: string): string {
  return text
    // Collapse 3+ blank lines into 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove common EHR boilerplate headers
    .replace(/^THIS IS A COMPUTER.GENERATED DOCUMENT.*$/gim, '')
    .replace(/^ELECTRONICALLY SIGNED BY.*$/gim, '')
    .replace(/^DICTATED BY:.*$/gim, '')
    .replace(/^TRANSCRIBED BY:.*$/gim, '')
    // Normalize horizontal rules to blank lines
    .replace(/^[-=*]{10,}$/gm, '')
    // Trim trailing whitespace per line
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}
