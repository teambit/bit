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
   * name of the default import if exists.
   */
  defaultImport: null | string;

  /**
   * list of all named imports.
   */
  namedImports: NamedImport[];

  /**
   * If star import was defined.
   */
  starImport: null | string;

  /**
   * file to import from.
   */
  fromModule: string;
};
