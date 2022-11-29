import chalk from 'chalk';
import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../class-transformers';

export class ModuleSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  exports: SchemaNode[];

  @Transform(schemaObjArrayToInstances)
  internals: SchemaNode[];

  namespace?: string;

  constructor(readonly location: Location, exports: SchemaNode[], internals: SchemaNode[], readonly filePath: string) {
    super();
    this.exports = exports;
    this.internals = internals;
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      namespace: this.namespace,
      exports: this.exports.map((exp) => exp.toObject()),
    };
  }

  flatExportsRecursively() {
    this.exports = this.exports.reduce((acc, exp) => {
      if (exp instanceof ModuleSchema) {
        exp.flatExportsRecursively();
        if (exp.namespace) return [...acc, exp];
        return [...acc, ...exp.exports];
      }
      return [...acc, exp];
    }, [] as SchemaNode[]);
  }

  toString() {
    if (!this.namespace)
      throw new Error(
        'toString() should not be called on a module without namespace, make sure this.flatExportsRecursively() is called'
      );
    const exportsStr = this.exports.map((m) => `* ${m.toString()}`).join('\n');
    return `${chalk.bold.underline(this.namespace)}\n${exportsStr}`;
  }
}
