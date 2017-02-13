export default class VersionNotExistsException extends Error {
  constructor(componentId) {
    super(`The component "${componentId}" does not exist, please import it first 
    `);
    this.name = 'VersionNotExistsException';
    this.code = 'ENOENT';
  }
}
