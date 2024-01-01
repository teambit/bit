import chalk from 'chalk';
import { SchemaLocation, SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';
import { DocSchema } from './docs';
import { TagName } from './docs/tag';
import { SchemaRegistry } from '../schema-registry';

export type Modifier =
  | 'static'
  | 'public'
  | 'private'
  | 'protected'
  | 'readonly'
  | 'abstract'
  | 'async'
  | 'override'
  | 'export';

/**
 * function-like can be a function, method, arrow-function, variable-function, etc.
 */
export class FunctionLikeSchema extends SchemaNode {
  readonly returnType: SchemaNode;
  readonly params: ParameterSchema[];
  readonly doc?: DocSchema;
  readonly signature?: string | undefined;

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    params: ParameterSchema[],
    returnType: SchemaNode,
    signature: string,
    readonly modifiers: Modifier[] = [],
    doc?: DocSchema,
    readonly typeParams?: string[] // generics e.g. <T>myFunction
  ) {
    super();
    this.params = params;
    this.returnType = returnType;
    this.doc = doc;
    this.signature = signature || FunctionLikeSchema.createSignature(this.name, this.params, this.returnType);
  }

  getNodes() {
    return [...this.params, this.returnType];
  }

  toString() {
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    const typeParamsStr = this.typeParams ? `<${this.typeParams.join(', ')}>` : '';
    return `${this.modifiersToString()}${typeParamsStr}${chalk.bold(
      this.name
    )}(${paramsStr}): ${this.returnType.toString()}`;
  }

  isDeprecated(): boolean {
    return Boolean(this.doc?.hasTag(TagName.deprecated));
  }

  isPrivate(): boolean {
    return Boolean(this.modifiers.find((m) => m === 'private') || this.doc?.hasTag(TagName.private));
  }

  generateSignature(): string {
    return FunctionLikeSchema.createSignature(this.name, this.params, this.returnType);
  }

  static createSignature(name: string, params: ParameterSchema[], returnType: SchemaNode): string {
    const paramsStr = params
      .map((param) => {
        let type = param.type.toString();
        if (param.isSpread) type = `...${type}`;
        return `${param.name}${param.isOptional ? '?' : ''}: ${type}`;
      })
      .join(', ');
    return `${name}(${paramsStr}): ${returnType.toString()}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      params: this.params.map((param) => param.toObject()),
      returnType: this.returnType.toObject(),
      signature: this.signature,
      modifiers: this.modifiers,
      doc: this.doc?.toObject(),
      typeParams: this.typeParams,
    };
  }

  static fromObject(obj: Record<string, any>) {
    return new FunctionLikeSchema(
      obj.location,
      obj.name,
      obj.params.map((param: Record<string, any>) => ParameterSchema.fromObject(param)),
      SchemaRegistry.fromObject(obj.returnType),
      obj.signature,
      obj.modifiers,
      obj.doc ? DocSchema.fromObject(obj.doc) : undefined,
      obj.typeParams
    );
  }

  private modifiersToString() {
    const modifiersToPrint = this.modifiers.filter((modifier) => modifier !== 'export');
    return modifiersToPrint.length ? `${modifiersToPrint.join(' ')} ` : '';
  }
}
