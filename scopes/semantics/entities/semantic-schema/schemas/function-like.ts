import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances, schemaObjToInstance } from '../schema-obj-to-class';
import { ParameterSchema } from './parameter';

export type Modifier = 'static' | 'public' | 'private' | 'protected' | 'readonly' | 'abstract' | 'async' | 'override';

export class FunctionLikeSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly returnType: SchemaNode;

  @Transform(schemaObjArrayToInstances)
  readonly params: ParameterSchema[];

  constructor(
    readonly name: string,
    // readonly doc: any,
    params: ParameterSchema[],

    returnType: SchemaNode,
    readonly signature: string,
    readonly location: Location,
    readonly modifiers: Modifier[] = []
  ) {
    super();
    this.params = params;
    this.returnType = returnType;
  }

  getSignature() {
    return this.signature;
  }

  toString() {
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    const modifiersStr = this.modifiers.length ? `${this.modifiers.join(' ')} ` : '';
    return `${modifiersStr}${chalk.bold(this.name)}(${paramsStr}): ${this.returnType.toString()}`;
  }
}
