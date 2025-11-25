import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { DocSchema } from './docs';
import { SchemaRegistry } from '../schema-registry';

export class ExportSchema extends SchemaNode {
  alias?: string;
  exportNode: SchemaNode;
  readonly doc?: DocSchema;
  readonly signature?: string;

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    exportNode: SchemaNode,
    alias?: string,
    doc?: DocSchema
  ) {
    super();
    this.exportNode = exportNode;
    this.alias = alias;
    this.doc = doc;
    this.signature = exportNode.signature || this.toFullSignature();
  }

  toString(options?: { color?: boolean }): string {
    let signature = '';

    const alias = this.alias || this.name;
    const originalName = this.exportNode.name || this.name;

    if (alias !== originalName) {
      signature += `export { ${originalName} as ${alias} };\n`;
    } else {
      signature += `export { ${originalName} };\n`;
    }

    const exportNodeSignature = this.exportNode.toString(options);

    signature += `\n${exportNodeSignature}`;

    return signature;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let signature = '';

    if (options?.showDocs && this.doc) {
      const docString = this.doc.toFullSignature();
      signature += `${docString}\n`;
    }

    const alias = this.alias || this.name;
    const originalName = this.exportNode.name || this.name;

    if (alias !== originalName) {
      signature += `export { ${originalName} as ${alias} };\n`;
    } else {
      signature += `export { ${originalName} };\n`;
    }

    const exportNodeSignature = this.exportNode.toFullSignature(options);

    signature += `\n${exportNodeSignature}`;

    return signature;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      doc: this.doc?.toObject(),
      location: this.location,
      exportNode: this.exportNode.toObject(),
      alias: this.alias,
    };
  }

  static fromObject(obj: Record<string, any>): ExportSchema {
    const name = obj.name;
    const location = obj.location;
    const exportNode = SchemaRegistry.fromObject(obj.exportNode);
    const alias = obj.alias;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    return new ExportSchema(location, name, exportNode, alias, doc);
  }

  static isExportSchema(node: SchemaNode): node is ExportSchema {
    return 'exportNode' in node;
  }
}
