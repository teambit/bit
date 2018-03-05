/** @flow */
export default class BuildException extends Error {
  id: string;
  message: string;
  stack: string;
  constructor(id: string, message?: string, stack?: string) {
    super();
    this.id = id;
    this.message = message;
    this.stack = stack;
  }
}
