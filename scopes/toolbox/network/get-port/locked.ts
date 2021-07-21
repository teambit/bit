export class Locked extends Error {
  constructor(port: number) {
    super(`${port} is locked`);
  }
}
