import { Transform, plainToInstance } from 'class-transformer';
import chalk from 'chalk';
import { ComponentID } from '@teambit/component-id';
import {
  ClassSchema,
  EnumSchema,
  FunctionLikeSchema,
  InterfaceSchema,
  Module,
  TypeRefSchema,
  TypeSchema,
  VariableSchema,
} from './schemas';
import { Location, SchemaNode } from './schema-node';
import { schemaObjToInstance } from './schema-obj-to-class';

export class APISchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly module: Module;

  readonly componentId: ComponentID;

  constructor(readonly location: Location, module: Module, componentId: ComponentID) {
    super();
    this.module = module;
    this.componentId = componentId;
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
      getSection(Module, 'Namespaces') +
      getSection(ClassSchema, 'Classes') +
      getSection(InterfaceSchema, 'Interfaces') +
      getSection(FunctionLikeSchema, 'Functions') +
      getSection(VariableSchema, 'Variables') +
      getSection(TypeSchema, 'Types') +
      getSection(EnumSchema, 'Enums') +
      getSection(TypeRefSchema, 'TypeReferences')
    );
  }

  listSignatures() {
    return this.module.exports.map((exp) => exp.signature);
  }

  static fromObject(obj: Record<string, any>): APISchema {
    return plainToInstance(APISchema, obj);
  }
}
