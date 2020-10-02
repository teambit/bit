export class CoreAspectLinkError extends Error {
  constructor(private id: string, private err: Error) {
    super(`failed linking core aspect '${id}' with the following error: ${err.toString()}`);
  }
}
