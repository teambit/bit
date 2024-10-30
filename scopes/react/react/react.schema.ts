import {
  DocSchema,
  FunctionLikeSchema,
  Location,
  Modifier,
  ParameterSchema,
  SchemaNode,
  SchemaRegistry,
  TagName,
  TypeRefSchema,
} from '@teambit/semantics.entities.semantic-schema';
import chalk from 'chalk';
import { compact } from 'lodash';

/**
 * function-like can be a function, method, arrow-function, variable-function, etc.
 */
export class ReactSchema extends SchemaNode {
  readonly returnType: SchemaNode;

  readonly props?: ParameterSchema;

  readonly doc?: DocSchema;

  readonly signature?: string | undefined;

  constructor(
    readonly location: Location,
    readonly name: string,
    returnType: TypeRefSchema,
    props?: ParameterSchema<TypeRefSchema>,
    signature?: string,
    readonly modifiers: Modifier[] = [],
    doc?: DocSchema,
    readonly typeParams?: string[]
  ) {
    super();
    this.props = props;
    this.returnType = returnType;
    this.doc = doc;
    this.signature = signature || FunctionLikeSchema.createSignature(name, compact([props]), returnType);
  }

  getNodes() {
    return compact([this.props, this.returnType]);
  }

  toString(options?: { color?: boolean }): string {
    const bold = options?.color ? chalk.bold : (x: string) => x;

    const paramsStr = this.props?.toString();
    const typeParamsStr = this.typeParams ? `<${this.typeParams.join(', ')}>` : '';
    return `${this.modifiersToString()}${typeParamsStr}${bold(this.name)}(${paramsStr}): ${this.returnType.toString()}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let signature = '';

    if (this.doc && options?.showDocs) {
      signature += `${this.doc.toFullSignature()}\n`;
    }

    const modifiersStr = this.modifiersToString();
    const typeParamsStr = this.typeParams ? `<${this.typeParams.join(', ')}>` : '';
    const paramsStr = this.props ? this.props.toFullSignature() : '';

    const returnTypeStr = this.returnType.toFullSignature();

    signature += `${modifiersStr}const ${this.name}${typeParamsStr} = (${paramsStr}): ${returnTypeStr};`;

    return signature;
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

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      props: this.props?.toObject(),
      returnType: this.returnType.toObject(),
      signature: this.signature,
      modifiers: this.modifiers,
      doc: this.doc?.toObject(),
      typeParams: this.typeParams,
    };
  }

  static fromObject(obj: Record<string, any>): ReactSchema {
    const location = obj.location;
    const name = obj.name;
    const props = obj.props ? ParameterSchema.fromObject<TypeRefSchema>(obj.props) : undefined;
    const returnType = SchemaRegistry.fromObject(obj.returnType);
    const signature = obj.signature;
    const modifiers = obj.modifiers;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    const typeParams = obj.typeParams;
    return new ReactSchema(location, name, returnType, props, signature, modifiers, doc, typeParams);
  }
}
