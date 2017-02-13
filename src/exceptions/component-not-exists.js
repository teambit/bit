export default class ComponentNotExistsInException extends Error {
  constructor(componentPath) {
    super(`The component in path "${componentPath}" has not found
    `);
    this.name = 'ComponentNotExistsInException';
    this.code = 'ENOENT';
  }
}
