import { Export } from '@teambit/semantics.entities.semantic-schema';

export interface Parser {
  /**
   * regex to apply on which components compiler applies.
   */
  extension: RegExp;

  /**
   * parse a module.
   */
  parseModule(modulePath: string): Export[];
}
