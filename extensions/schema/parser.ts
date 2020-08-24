import { Module } from './schemas';

export interface Parser {
  /**
   * Regex to apply on which components compiler applies.
   */
  extension: RegExp;

  /**
   * Parse a module.
   */
  parseModule(modulePath: string): Module;

  /**
   * Extract module public api.
   */
  extractApi?: (modulePath: string) => any; //TODO:[uri]: Define public api interface
}
