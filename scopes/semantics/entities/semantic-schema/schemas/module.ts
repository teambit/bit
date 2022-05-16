import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { Export } from '../schemas';

export class Module implements SchemaNode {
  namespace?: string;
  constructor(public exports: SchemaNode[]) {}

  getExportSchemas(): Export[] {
    return this.exports.filter((e) => e instanceof Export) as Export[];
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
      if (exp instanceof Module) {
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
