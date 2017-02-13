export default class InvalidComponentIdException extends Error {
  constructor(componentId) {
    super(`The id "${componentId}" is invalid component id
    `);
    this.name = 'InvalidComponentIdException';
    this.code = 'INVALCID';
  }
}
