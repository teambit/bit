export default class ComponentNotExistsException extends Error {
  constructor(componentId) {
    super(`The component "${componentId}" does not found in the specified directory
    `);
    this.name = 'ComponentNotExistsException';
    this.code = 'ENOENT';
  }
}
