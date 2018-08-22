/** @flow */

import ExternalError from '../../error/external-error';

export default class ExtensionLoadError extends ExternalError {
  name: string;
  printStack: boolean;

  constructor(originalError: Error, name: string, printStack: boolean = true) {
    super(originalError);
    this.name = name;
    this.printStack = printStack;
  }
}
