import chalk from 'chalk';
import { ComponentID } from '@teambit/component-id';
import {
  ClassSchema,
  EnumSchema,
  ExportSchema,
  FunctionLikeSchema,
  InterfaceSchema,
  ModuleSchema,
  TypeRefSchema,
  TypeSchema,
  UnresolvedSchema,
  VariableLikeSchema,
} from './schemas';
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

  toStringPerType() {
    const title = chalk.inverse(`API Schema of ${this.componentId.toString()}\n`);
    const getSection = (ClassObj, sectionName: string) => {
      const objects = this.module.exports.filter((exp) => {
        if (ExportSchema.isExportSchema(exp)) {
          return exp.exportNode instanceof ClassObj;
        }
        return exp instanceof ClassObj;
      });
      if (!objects.length) {
        return '';
      }

      return `${chalk.green.bold(sectionName)}\n${objects.map((c) => c.toString({ color: true })).join('\n')}\n\n`;
    };

    return (
      title +
      getSection(ModuleSchema, 'Namespaces') +
      getSection(ClassSchema, 'Classes') +
      getSection(InterfaceSchema, 'Interfaces') +
      getSection(FunctionLikeSchema, 'Functions') +
      getSection(VariableLikeSchema, 'Variables') +
      getSection(TypeSchema, 'Types') +
      getSection(EnumSchema, 'Enums') +
      getSection(TypeRefSchema, 'TypeReferences') +
      getSection(UnresolvedSchema, 'Unresolved')
    );
  }

  toFullSignature(options: { showDocs?: boolean } = { showDocs: true }): string {
    const title = `API Schema of ${this.componentId.toString()}\n`;
    const sections: string[] = [];

    const getSection = (ClassObj: any, sectionName: string) => {
      const objects = this.module.exports.filter((exp) => {
        const node = ExportSchema.isExportSchema(exp) ? exp.exportNode : exp;
        return node instanceof ClassObj;
      });

      if (!objects.length) {
        return '';
      }

      const sectionHeader = `${sectionName}\n\n`;
      const sectionBody = objects
        .map((obj) => {
          return obj.toFullSignature(options);
        })
        .join('\n\n');

      return `${sectionHeader}${sectionBody}\n\n`;
    };

    sections.push(getSection(ModuleSchema, 'Namespaces'));
    sections.push(getSection(ClassSchema, 'Classes'));
    sections.push(getSection(InterfaceSchema, 'Interfaces'));
    sections.push(getSection(FunctionLikeSchema, 'Functions'));
    sections.push(getSection(VariableLikeSchema, 'Variables'));
    sections.push(getSection(TypeSchema, 'Types'));
    sections.push(getSection(EnumSchema, 'Enums'));
    sections.push(getSection(TypeRefSchema, 'TypeReferences'));
    sections.push(getSection(UnresolvedSchema, 'Unresolved'));

    return title + sections.filter(Boolean).join('');
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
