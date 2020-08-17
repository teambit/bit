export class PreviewNotFound extends Error {
  constructor(name: string | null) {
    super(`Preview for name: ${name} was not found`);
  }
}
