export class HarmonyLinkError extends Error {
  constructor(private err: Error) {
    super(`failed linking harmony with the following error: ${err.toString()}`);
  }
}
