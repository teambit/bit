import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

/**
 * e.g. `T extends U ? Y : N`
 *
 */
export class ConditionalTypeSchema extends SchemaNode {
  readonly checkType: SchemaNode;
  readonly extendsType: SchemaNode;
  readonly trueType: SchemaNode;
  readonly falseType: SchemaNode;

  constructor(
    readonly location: SchemaLocation,
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

  getNodes() {
    return [this.checkType, this.extendsType, this.trueType, this.falseType];
  }

  toString() {
    return `${this.checkType.toString()} extends ${this.extendsType.toString()} ? ${this.trueType.toString()} : ${this.falseType.toString()}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    const checkTypeStr = this.checkType.toFullSignature(options);
    const extendsTypeStr = this.extendsType.toFullSignature(options);
    const trueTypeStr = this.trueType.toFullSignature(options);
    const falseTypeStr = this.falseType.toFullSignature(options);

    return `${checkTypeStr} extends ${extendsTypeStr} ? ${trueTypeStr} : ${falseTypeStr}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      checkType: this.checkType.toObject(),
      extendsType: this.extendsType.toObject(),
      trueType: this.trueType.toObject(),
      falseType: this.falseType.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): ConditionalTypeSchema {
    const location = obj.location;
    const checkType = SchemaRegistry.fromObject(obj.checkType);
    const extendsType = SchemaRegistry.fromObject(obj.extendsType);
    const trueType = SchemaRegistry.fromObject(obj.trueType);
    const falseType = SchemaRegistry.fromObject(obj.falseType);
    return new ConditionalTypeSchema(location, checkType, extendsType, trueType, falseType);
  }
}
