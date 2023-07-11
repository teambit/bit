import {
  DocSchema,
  Location,
  Modifier,
  ParameterSchema,
  SchemaNode,
  TagName,
  schemaObjToInstance,
} from '@teambit/semantics.entities.semantic-schema';
import { Transform } from 'class-transformer';
import chalk from 'chalk';

/**
 * function-like can be a function, method, arrow-function, variable-function, etc.
 */
export class ReactSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly returnType: SchemaNode;

  @Transform(schemaObjToInstance)
  readonly props: ParameterSchema;

  @Transform(schemaObjToInstance)
  readonly doc?: DocSchema;

  constructor(
    readonly location: Location,
    readonly name: string,
    props: ParameterSchema,
    returnType: SchemaNode,
    readonly signature: string,
    readonly modifiers: Modifier[] = [],
    doc?: DocSchema,
    readonly typeParams?: string[]
  ) {
    super();
    this.props = props;
    this.returnType = returnType;
    this.doc = doc;
  }

  toString() {
    const paramsStr = this.props.toString();
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
