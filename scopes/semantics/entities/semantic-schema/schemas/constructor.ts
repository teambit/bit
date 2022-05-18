import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';
import { schemaObjArrayToInstances } from '../schema-obj-to-class';

export class ConstructorSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly params: ParameterSchema[];
  constructor(params: ParameterSchema[]) {
    super();
    this.params = params;
  }

  toString() {
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    return `${chalk.bold('constructor')}(${paramsStr})`;
  }
}
