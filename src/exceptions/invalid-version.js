export default class InvalidVersionException extends Error {
  constructor(componentId) {
    super(`The version of "${componentId}" must be a number with type string, please check bit.json file
    `);
    this.name = 'InvalidVersionException';
    this.code = 'INVALVER';
  }
}
