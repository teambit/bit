import { ComponentID } from '@teambit/component';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';

export type PlainTypeRefSchema = {
  name: string;
  componentId?: string;
  packageName?: string;
};

export class TypeRefSchema extends SchemaNode {
  constructor(
    readonly location: Location,
    /**
     * name of the reference to type.
     */
    readonly name: string,

    /**
     * target component id. existing if the type is defined in another component.
     */
    readonly componentId?: ComponentID,

    /**
     * target package name. existing if type is defined in different package.
     */
    readonly packageName?: string
  ) {
    super();
  }

  toString() {
    if (this.componentId) {
      return `${this.componentId}/${this.name}`;
    }
    if (this.packageName) {
      return `${chalk.dim(this.packageName)}/${this.name}`;
    }
    return this.name;
  }

  /**
   * whether this type was already exported in this component
   */
  isFromThisComponent() {
    return !this.componentId && !this.packageName;
  }

  // static from(plainSchema: PlainTypeRefSchema) {
  //   return new TypeRefSchema(
  //     plainSchema.name,
  //     plainSchema.componentId ? ComponentID.fromString(plainSchema.componentId) : undefined,
  //     plainSchema.packageName
  //   );
  // }
}
