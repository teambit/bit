import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances, schemaObjToInstance } from '../schema-obj-to-class';
import { ParameterSchema } from './parameter';

export type Modifier = 'static' | 'public' | 'private' | 'protected' | 'readonly' | 'abstract' | 'async' | 'override';

/**
 * function-like can be a function, method, arrow-function, variable-function, etc.
 */
export class FunctionLikeSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly returnType: SchemaNode;

  @Transform(schemaObjArrayToInstances)
  readonly params: ParameterSchema[];

  constructor(
    readonly location: Location,
    readonly name: string,
    // readonly doc: any,
    params: ParameterSchema[],

    returnType: SchemaNode,
    readonly signature: string,
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
