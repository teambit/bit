export class DocReadError extends Error {
  constructor(filePath: string, error: Error) {
    super(`failed reading doc in file path: ${filePath} with error: ${error}`);
  }
}
