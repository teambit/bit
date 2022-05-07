import chalk from 'chalk';
import { ClassSchema, Export, FunctionSchema, InterfaceSchema, Module, TypeSchema, VariableSchema } from './schemas';
import { SchemaNode } from './schema-node';

export type PlainSemanticSchema = {
  exports?: Export[];
};

export class APISchema implements SchemaNode {
  constructor(readonly module: Module) {}

  toString() {
    return JSON.stringify(
      this.module.exports.map((exp) => exp.toObject()),
      undefined,
      2
    );
  }

  toObject() {
    return {
      exports: this.module.exports.map((exp) => exp.toObject()),
      filename: '',
    };
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
      getSection(FunctionSchema, 'Functions') +
      getSection(VariableSchema, 'Variables') +
      getSection(TypeSchema, 'Types')
    );
  }

  listSignatures() {
    return this.module.exports.map((exp) => exp.getSignature?.());
  }

  static fromSchema() {}

  // static from(plainSchema: PlainSemanticSchema) {
  //   return new APISchema(plainSchema.exports);
  // }
}
