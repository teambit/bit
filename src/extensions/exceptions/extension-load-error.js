/** @flow */

import ExternalError from '../../error/external-error';

export default class ExtensionLoadError extends ExternalError {
  compName: string;
  printStack: boolean;

  constructor(originalError: Error, compName: string, printStack: boolean = true) {
    super(originalError);
    this.compName = compName;
    this.printStack = printStack;
  }
}
