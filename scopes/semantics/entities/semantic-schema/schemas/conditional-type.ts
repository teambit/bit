import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

/**
 * e.g. `T extends U ? Y : N`
 *
 */
export class ConditionalTypeSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly checkType: SchemaNode;

  @Transform(schemaObjToInstance)
  readonly extendsType: SchemaNode;

  @Transform(schemaObjToInstance)
  readonly trueType: SchemaNode;

  @Transform(schemaObjToInstance)
  readonly falseType: SchemaNode;
  constructor(
    readonly location: Location,
    checkType: SchemaNode,
    extendsType: SchemaNode,
    trueType: SchemaNode,
    falseType: SchemaNode
  ) {
    super();
    this.checkType = checkType;
    this.extendsType = extendsType;
    this.trueType = trueType;
    this.falseType = falseType;
  }

  toString() {
    return `${this.checkType.toString()} extends ${this.extendsType.toString()} ? ${this.trueType.toString()} : ${this.falseType.toString()}`;
  }
}
