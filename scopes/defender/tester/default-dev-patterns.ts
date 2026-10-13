/** Shared default patterns for runtime registration and cold dependency capture. */
export function defaultTestPatterns(): string[] {
  return ['**/*.spec.+(js|ts|jsx|tsx)', '**/*.test.+(js|ts|jsx|tsx)'];
}
