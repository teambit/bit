// TODO: remove this type and consolidate in teambit.semantics/schema-extractor.

export type NamedImport = {
  /**
   * name of the import.
   */
  name: string;

  /**
   * as definition of the named import -> e.g. defined as `import { Foo as Bar } from './a'`;
   * if `as` was not defined, value will be referenced to the name.
   */
  value: string;
};

export type ImportSpecifier = {
  /**
   * relative/absolute or module name. e.g. the `y` in the example of `import x from 'y';`
   */
  fromModule: string;

  /**
   * is default import (e.g. `import x from 'y';`)
   */
  isDefault?: boolean;

  /**
   * the name used to identify the module, e.g. the `x` in the example of `import x from 'y';`
   */
  identifier?: string;
};
