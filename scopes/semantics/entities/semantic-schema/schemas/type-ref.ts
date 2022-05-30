import { Transform } from 'class-transformer';
import { ComponentID } from '@teambit/component';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../class-transformers';
import { componentIdTransformer } from '../class-transformers/comp-id-transformer';

export type PlainTypeRefSchema = {
  name: string;
  componentId?: string;
  packageName?: string;
};

/**
 * can be one of the following:
 * 1. a reference to another "export" in the same component
 * 2. a reference to another component.
 * 3. a reference to a package.
 */
export class TypeRefSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  /**
   *  optional type arguments, e.g. type Foo = Bar<X, Y>. The X and Y are type arguments.
   */
  typeArgs?: SchemaNode[];

  @Transform(componentIdTransformer)
  readonly componentId?: ComponentID;

  constructor(
    readonly location: Location,
    /**
     * name of the reference to type.
     */
    readonly name: string,

    /**
     * target component id. existing if the type is defined in another component.
     */
    componentId?: ComponentID,

    /**
     * target package name. existing if type is defined in different package.
     */
    readonly packageName?: string
  ) {
    super();
    this.componentId = componentId;
  }

  toString() {
    const name = this.nameToString();
    if (!this.typeArgs) {
      return name;
    }
    const args = this.typeArgs.map((arg) => arg.toString()).join(', ');
    return `${name}<${args}>`;
  }

  private nameToString() {
    if (this.componentId) {
      const compStr = chalk.dim(`(component: ${this.componentId.toStringWithoutVersion()})`);
      return `${compStr} ${this.name}`;
    }
    if (this.packageName) {
      const pkgStr = chalk.dim(`(package: ${this.packageName})`);
      return `${pkgStr} ${this.name}`;
    }
    return this.name;
  }

  /**
   * whether this type was already exported in this component
   */
  isFromThisComponent() {
    return !this.componentId && !this.packageName;
  }
}
