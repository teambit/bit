import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances, schemaObjToInstance } from '../class-transformers';
import { ParameterSchema } from './parameter';
import { DocSchema } from './docs';
import { TagName } from './docs/tag';

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
  @Transform(schemaObjToInstance)
  readonly returnType: SchemaNode;

  @Transform(schemaObjArrayToInstances)
  readonly params: ParameterSchema[];

  @Transform(schemaObjToInstance)
  readonly doc?: DocSchema;

  constructor(
    readonly location: Location,
    readonly name: string,
    params: ParameterSchema[],
    returnType: SchemaNode,
    readonly signature: string,
    readonly modifiers: Modifier[] = [],
    doc?: DocSchema,
    readonly typeParams?: string[] // generics e.g. <T>myFunction
  ) {
    super();
    this.params = params;
    this.returnType = returnType;
    this.doc = doc;
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

  private modifiersToString() {
    const modifiersToPrint = this.modifiers.filter((modifier) => modifier !== 'export');
    return modifiersToPrint.length ? `${modifiersToPrint.join(' ')} ` : '';
  }
}
