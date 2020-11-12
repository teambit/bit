export class ParserNotFound extends Error {
  constructor(readonly filePath: string) {
    super(`
no parser is configured to apply on file path: ${filePath}.\n
please use an extension to handle your file extension formats.
`);
  }
}
