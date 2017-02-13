export default class ComponentNotExistsException extends Error {
  constructor(componentId, callerFile) {
    super(`The component "${componentId}" does not found in the specified directory
    called from ${callerFile}
    `);
    this.name = 'ComponentNotExistsException';
    this.code = 'ENOENT';
  }
}
