export default class DuplicateComponentException extends Error {
  constructor() {
    super(`Multiple components with the same Box and ID are invalid  
    `);
    this.name = 'DuplicateComponentIdException';
    this.code = 'DUPCID';
  }
}
