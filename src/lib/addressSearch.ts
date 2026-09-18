export function extractHouseNumber(query: string): string {
  const segments = query.split(',').slice(1);
  for (const segment of segments) {
    const match = segment.trim().match(/^(\d{1,6}(?:[-/]?[a-z])?|s\/?n)(?:\s|$)/i);
    if (match && !/^\d{8}$/.test(match[1])) return match[1];
  }
  return '';
}
