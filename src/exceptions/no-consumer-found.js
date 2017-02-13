export default class NoConsumerFoundException extends Error {
  constructor(startPath) {
    super(`could not found a bit environement starting at "${startPath}"
    `);
    this.name = 'NoConsumerFoundException';
    this.code = 'NOCONFOU';
  }
}
