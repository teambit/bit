import { Module } from './schemas';

export interface Parser {
  /**
   * regex to apply on which components compiler applies.
   */
  extension: RegExp;

  /**
   * parse a module.
   */
  parseModule(modulePath: string): Module;
}
