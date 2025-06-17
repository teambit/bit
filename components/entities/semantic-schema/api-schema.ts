import chalk from 'chalk';
import { ComponentID } from '@teambit/component-id';
import { ExportSchema, ModuleSchema } from './schemas';
import { SchemaLocation, SchemaNode } from './schema-node';
import { TagName } from './schemas/docs/tag';
import { SchemaRegistry } from './schema-registry';

export class APISchema extends SchemaNode {
  readonly module: ModuleSchema; // index

  readonly internals: ModuleSchema[];

  readonly componentId: ComponentID;

  readonly taggedModuleExports: SchemaNode[];

  constructor(
    readonly location: SchemaLocation,
    module: ModuleSchema,
    internals: ModuleSchema[],
    componentId: ComponentID,
    taggedModuleExports: SchemaNode[] = []
  ) {
    super();
    this.module = module;
    this.internals = internals;
    this.componentId = componentId;
    taggedModuleExports = (taggedModuleExports.length && taggedModuleExports) || this.listTaggedExports(module);
    this.taggedModuleExports = taggedModuleExports;
  }

  listTaggedExports(module?: ModuleSchema): SchemaNode[] {
    if (!module) return [];
    return module.exports
      .filter((e) => {
        if (ExportSchema.isExportSchema(e)) {
          return e.exportNode.doc?.hasTag(TagName.exports) || e.doc?.hasTag(TagName.exports);
        }
        return e.doc?.hasTag(TagName.exports);
      })
      .map((e) => {
        if (ExportSchema.isExportSchema(e)) {
          return e.exportNode;
        }
        return e;
      });
  }

  toString() {
    return JSON.stringify(
      this.module.exports.map((exp) => exp.toObject()),
      undefined,
      2
    );
  }

  private createSectionNameFromSchemaType(schemaType: string): string {
    const baseName = schemaType.replace(/Schema$/, '');
    const spacedName = baseName.replace(/([A-Z])/g, ' $1').trim();
    return spacedName;
  }

  toStringPerType() {
    const title = chalk.inverse(`API Schema of ${this.componentId.toString()}\n`);

    const exportGroups = this.module.exports.reduce(
      (acc, exp) => {
        const node = ExportSchema.isExportSchema(exp) ? exp.exportNode : exp;
        const schemaType = node.__schema;
        (acc[schemaType] = acc[schemaType] || []).push(exp);
        return acc;
      },
      {} as { [key: string]: SchemaNode[] }
    );

    const sortedSchemaTypes = Object.keys(exportGroups).sort();

    if (sortedSchemaTypes.length === 0) {
      return title;
    }

    const sections = sortedSchemaTypes.map((schemaType) => {
      const exports = exportGroups[schemaType];
      const sectionName = this.createSectionNameFromSchemaType(schemaType);
      const sectionBody = exports.map((c) => c.toString({ color: true })).join('\n');
      return `${chalk.green.bold(sectionName)}\n${sectionBody}`;
    });

    return title + sections.join('\n\n') + '\n\n';
  }

  toFullSignature(options: { showDocs?: boolean; showTitles?: boolean } = { showDocs: true }): string {
    const title = `API Schema of ${this.componentId.toString()}\n\n`;

    const exportGroups: { [key: string]: SchemaNode[] } = {};

    for (const exp of this.module.exports) {
      const node = ExportSchema.isExportSchema(exp) ? exp.exportNode : exp;
      const constructorName = node.constructor.name;

      if (!exportGroups[constructorName]) {
        exportGroups[constructorName] = [];
      }

      exportGroups[constructorName].push(exp);
    }

    let output = options.showTitles ? title : '';

    for (const [sectionName, exports] of Object.entries(exportGroups)) {
      const readableSectionName = options.showTitles ? this.getReadableSectionName(sectionName) : '';

      output += `${readableSectionName}\n\n`;

      const sectionBody = exports.map((exp) => exp.toFullSignature(options)).join('\n\n');

      output += `${sectionBody}\n\n`;
    }

    return output.trim();
  }

  private getReadableSectionName(constructorName: string): string {
    const sectionNameMap: { [key: string]: string } = {
      ModuleSchema: 'Namespaces',
      ClassSchema: 'Classes',
      InterfaceSchema: 'Interfaces',
      FunctionLikeSchema: 'Functions',
      VariableLikeSchema: 'Variables',
      TypeSchema: 'Types',
      EnumSchema: 'Enums',
      TypeRefSchema: 'Type References',
      UnresolvedSchema: 'Unresolved',
      ReactSchema: 'React Components',
    };

    return sectionNameMap[constructorName] || constructorName;
  }

  listSignatures() {
    return this.module.exports.map((exp) => exp.signature);
  }

  toObject() {
    return {
      ...super.toObject(),
      module: this.module.toObject(),
      internals: this.internals.map((i) => i.toObject()),
      componentId: this.componentId.toObject(),
      taggedModuleExports: this.taggedModuleExports.map((e) => e.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>): APISchema {
    const location: SchemaLocation = obj.location;
    const module: ModuleSchema = ModuleSchema.fromObject(obj.module);
    const internals: ModuleSchema[] = (obj.internals || []).map((i: any) => ModuleSchema.fromObject(i));
    const componentId: ComponentID = ComponentID.fromObject(obj.componentId);
    const taggedModuleExports = (obj.taggedModuleExports || []).map((e: any) => SchemaRegistry.fromObject(e));
    return new APISchema(location, module, internals, componentId, taggedModuleExports);
  }

  static empty(componentId: ComponentID) {
    return new APISchema(
      { filePath: '', line: 0, character: 0 },
      new ModuleSchema({ filePath: '', line: 0, character: 0 }, [], []),
      [],
      componentId
    );
  }
}
