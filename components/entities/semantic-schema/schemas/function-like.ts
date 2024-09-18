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
    readonly typeParams?: string[],
    readonly decorators?: SchemaNode[]
  ) {
    super();
    this.params = params;
    this.returnType = returnType;
    this.doc = doc;
    this.signature = signature || FunctionLikeSchema.createSignature(this.name, this.params, this.returnType);
  }

  getNodes() {
    return [...this.params, this.returnType, ...(this.decorators || [])];
  }

  toString({ color }) {
    const bold = color ? chalk.bold : (text: string) => text;
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    const typeParamsStr = this.typeParams ? `<${this.typeParams.join(', ')}>` : '';
    const decoratorsStr = this.decorators?.map((decorator) => decorator.toString({ color })).join('\n');
    return `${this.decorators ? `${decoratorsStr}\n` : ''}${this.modifiersToString()}${typeParamsStr}${bold(
      this.name
    )}(${paramsStr}): ${this.returnType.toString({ color })}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let result = '';
    if (options?.showDocs && this.doc) {
      result += `${this.doc.toFullSignature()}\n`;
    }
    const decoratorsStr = this.decorators?.map((decorator) => decorator.toString()).join('\n');
    if (decoratorsStr) {
      result += `${decoratorsStr}\n`;
    }
    const modifiersStr = this.modifiersToString();
    const typeParamsStr = this.typeParams ? `<${this.typeParams.join(', ')}>` : '';
    const paramsStr = this.params
      .map((param) => {
        let paramStr = '';
        if (param.isSpread) {
          paramStr += '...';
        }
        paramStr += param.name;
        if (param.isOptional) {
          paramStr += '?';
        }
        paramStr += `: ${param.type.toString()}`;
        if (param.defaultValue !== undefined) {
          paramStr += ` = ${param.defaultValue}`;
        }
        return paramStr;
      })
      .join(', ');
    result += `${modifiersStr}${this.name}${typeParamsStr}(${paramsStr}): ${this.returnType.toString()}`;
    return result;
  }

  isDeprecated(): boolean {
    return Boolean(this.doc?.hasTag(TagName.deprecated));
  }

  isPrivate(): boolean {
    return Boolean(this.modifiers.find((m) => m === 'private') || this.doc?.hasTag(TagName.private));
  }

  generateSignature(): string {
    return FunctionLikeSchema.createSignature(this.name, this.params, this.returnType, this.decorators);
  }

  static createSignature(
    name: string,
    params: ParameterSchema[],
    returnType: SchemaNode,
    decorators?: SchemaNode[]
  ): string {
    const paramsStr = params
      .map((param) => {
        let type = param.type.toString();
        if (param.isSpread) type = `...${type}`;
        return `${param.name}${param.isOptional ? '?' : ''}: ${type}`;
      })
      .join(', ');
    const decoratorsStr = decorators?.map((decorator) => decorator.toString()).join('\n');
    return `${decorators ? `${decoratorsStr}\n` : ''}${name}(${paramsStr}): ${returnType.toString()}`;
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
      decorators: this.decorators?.map((decorator) => decorator.toObject()),
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
      obj.typeParams,
      obj.decorators?.map((decorator) => SchemaRegistry.fromObject(decorator))
    );
  }

  private modifiersToString() {
    const modifiersToPrint = this.modifiers.filter((modifier) => modifier !== 'export');
    return modifiersToPrint.length ? `${modifiersToPrint.join(' ')} ` : '';
  }
}
