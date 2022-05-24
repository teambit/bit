import { Transform, plainToInstance } from 'class-transformer';
import chalk from 'chalk';
import {
  ClassSchema,
  EnumSchema,
  FunctionLikeSchema,
  InterfaceSchema,
  Module,
  TypeSchema,
  VariableSchema,
} from './schemas';
import { Location, SchemaNode } from './schema-node';
import { schemaObjToInstance } from './schema-obj-to-class';

export class APISchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly module: Module;

  constructor(readonly location: Location, module: Module) {
    super();
    this.module = module;
  }

  toString() {
    return JSON.stringify(
      this.module.exports.map((exp) => exp.toObject()),
      undefined,
      2
    );
  }

  toStringPerType() {
    const getSection = (ClassObj, sectionName: string) => {
      const objects = this.module.exports.filter((exp) => exp instanceof ClassObj);
      if (!objects.length) {
        return '';
      }

      return `${chalk.green.bold(sectionName)}\n${objects.map((c) => c.toString()).join('\n')}\n\n`;
    };

    return (
      getSection(Module, 'Namespaces') +
      getSection(ClassSchema, 'Classes') +
      getSection(InterfaceSchema, 'Interfaces') +
      getSection(FunctionLikeSchema, 'Functions') +
      getSection(VariableSchema, 'Variables') +
      getSection(TypeSchema, 'Types') +
      getSection(EnumSchema, 'Enums')
    );
  }

  listSignatures() {
    return this.module.exports.map((exp) => exp.signature);
  }

  static fromSchema(obj: Record<string, any>): APISchema {
    return plainToInstance(APISchema, obj);
  }
}
