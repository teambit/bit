import chalk from 'chalk';
import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class ModuleSchema extends SchemaNode {
  exports: SchemaNode[];
  internals: SchemaNode[];
  namespace?: string;

  constructor(readonly location: SchemaLocation, exports: SchemaNode[], internals: SchemaNode[]) {
    super();
    this.exports = exports;
    this.internals = internals;
  }

  getNodes() {
    return [...this.exports, ...this.internals];
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

  toObject() {
    return {
      ...super.toObject(),
      exports: this.exports.map((member) => member.toObject()),
      internals: this.internals.map((member) => member.toObject()),
      namespace: this.namespace,
    };
  }

  static fromObject(obj: Record<string, any>): ModuleSchema {
    const location = obj.location;
    const exportNodes = (obj.exports || []).map((member: any) => SchemaRegistry.fromObject(member));
    const internals = (obj.internals || []).map((member: any) => SchemaRegistry.fromObject(member));
    const namespace = obj.namespace;
    const module = new ModuleSchema(location, exportNodes, internals);
    module.namespace = namespace;
    return module;
  }
}
