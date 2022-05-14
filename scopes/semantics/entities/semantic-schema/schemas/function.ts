import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';

export type Modifier = 'static' | 'public' | 'private' | 'protected' | 'readonly' | 'abstract' | 'async' | 'override';

export class FunctionSchema implements SchemaNode {
  constructor(
    readonly name: string,
    // readonly doc: any,
    readonly params: ParameterSchema[],

    readonly returnType: SchemaNode,
    readonly signature: string,
    readonly modifiers: Modifier[] = []
  ) {}

  serialize() {}

  toJsonSchema() {}

  getSignature() {
    return this.signature;
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      name: this.name,
      params: this.params,
      returnType: this.returnType.toObject(),
      signature: this.signature,
      modifiers: this.modifiers,
    };
  }

  toString() {
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    const modifiersStr = this.modifiers.length ? `${this.modifiers.join(' ')} ` : '';
    return `${modifiersStr}${chalk.bold(this.name)}(${paramsStr}): ${this.returnType.toString()}`;
  }
}
