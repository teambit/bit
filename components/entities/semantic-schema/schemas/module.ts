import chalk from 'chalk';
import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';
import { ExportSchema } from './export';

export class ModuleSchema extends SchemaNode {
  // exports could either be re exports (export declarations) or nodes with export modifier
  exports: SchemaNode[];
  internals: SchemaNode[];
  namespace?: string;

  constructor(
    readonly location: SchemaLocation,
    exports: SchemaNode[],
    internals: SchemaNode[]
  ) {
    super();
    this.exports = exports;
    this.internals = internals;
  }

  getNodes() {
    return [...this.exports, ...this.internals];
  }

  flatExportsRecursively() {
    this.exports = this.exports.reduce(
      (acc, exp) => {
        if (exp instanceof ModuleSchema) {
          exp.flatExportsRecursively();
          if (exp.namespace) return [...acc, exp];
          return [...acc, ...exp.exports];
        }
        return [...acc, exp];
      },
      [] as (ExportSchema | SchemaNode)[]
    );
  }

  toString(options?: { color?: boolean }) {
    if (!this.namespace)
      throw new Error(
        'toString() should not be called on a module without namespace, make sure this.flatExportsRecursively() is called'
      );
    const boldUnderline = options?.color ? chalk.bold.underline : (str: string) => str;

    const exportsStr = this.exports.map((m) => `* ${m.toString(options)}`).join('\n');
    return `${boldUnderline(this.namespace)}\n${exportsStr}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    if (!this.namespace)
      throw new Error(
        'toFullSignature() should not be called on a module without namespace; make sure this.flatExportsRecursively() is called'
      );

    const exportsSignatures = this.exports.map((m) => m.toFullSignature(options)).join('\n');

    let signature = `${this.namespace}\n${exportsSignatures}`;

    if (options?.showDocs && this.doc) {
      const docString = this.doc.toFullSignature();
      signature = `${docString}\n${signature}`;
    }

    return signature;
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
