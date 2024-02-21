import chalk from 'chalk';
import { ComponentID } from '@teambit/component-id';
import {
  ClassSchema,
  EnumSchema,
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

  listTaggedExports(module?: ModuleSchema) {
    if (!module) return [];
    return module.exports.filter((e) => e.doc?.hasTag(TagName.exports));
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
      const objects = this.module.exports.filter((exp) => exp instanceof ClassObj);
      if (!objects.length) {
        return '';
      }

      return `${chalk.green.bold(sectionName)}\n${objects.map((c) => c.toString()).join('\n')}\n\n`;
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
