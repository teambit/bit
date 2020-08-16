export default class Console {
  private stdout;
  constructor(stdout?: NodeJS.WritableStream);
  getStdout(): any;
  on(): void;
}
