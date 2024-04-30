import { SchemaNode, SchemaLocation } from '../schema-node';
import { DocSchema } from './docs';
import { SchemaRegistry } from '../schema-registry';

export class ExportSchema extends SchemaNode {
  alias?: string;
  exportNode: SchemaNode;
  readonly doc?: DocSchema;

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
  }

  toString() {
    if (this.alias) {
      return `${this.name} as ${this.alias}`;
    }
    return `${this.name}`;
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
