export class NoMatchingComponents extends Error {
  constructor(pattern: string) {
    super(`could not find components matching to pattern: ${pattern}`);
  }
}
