import multimatch from 'multimatch';

export function splitComponentPatterns(pattern: string): string[] {
  const patterns = pattern.split(',').map((part) => part.trim());
  if (patterns.every((part) => part.startsWith('!'))) patterns.unshift('**');
  return patterns;
}

/** The shared glob grammar consumes only identity strings, without loading component models. */
export function matchComponentPatterns(identities: string[], patterns: string[]): string[] {
  return multimatch(identities, patterns.map((pattern) => pattern.split('@')[0]));
}
