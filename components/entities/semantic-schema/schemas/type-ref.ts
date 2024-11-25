import { ComponentID } from '@teambit/component';
import chalk from 'chalk';
import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export type PlainTypeRefSchema = {
  name: string;
  componentId?: string;
  packageName?: string;
};

/**
 * can be one of the following:
 * 1. a reference to another "export" in the same component
 * 2  a reference to another declaration in the same file (internal)
 * 3. a reference to another component.
 * 4. a reference to a package.
 */
export class TypeRefSchema extends SchemaNode {
  /**
   *  optional type arguments, e.g. type Foo = Bar<X, Y>. The X and Y are type arguments.
   */
  typeArgs?: SchemaNode[];

  readonly componentId?: ComponentID;

  constructor(
    readonly location: SchemaLocation,
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
    readonly packageName?: string,
    /**
     * if the reference is not exported from the component, it can be internal to the file.
     */
    readonly internalFilePath?: string
  ) {
    super();
    this.componentId = componentId;
  }

  withTypeArgs(typeArgs: SchemaNode[]) {
    this.typeArgs = typeArgs;
    return this;
  }

  toString(options?: { color?: boolean }) {
    const name = this.nameToString(options);
    if (!this.typeArgs) {
      return name;
    }
    const args = this.typeArgs.map((arg) => arg.toString(options)).join(', ');
    return `${name}<${args}>`;
  }

  private nameToString(options?: { color?: boolean }) {
    const dim = options?.color ? chalk.dim : (str: string) => str;
    if (this.componentId) {
      const compStr = dim(`(component: ${this.componentId.toStringWithoutVersion()})`);
      return `${compStr} ${this.name}`;
    }
    if (this.packageName) {
      const pkgStr = dim(`(package: ${this.packageName})`);
      return `${pkgStr} ${this.name}`;
    }
    return this.name;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let signature = this.name;

    if (this.typeArgs && this.typeArgs.length > 0) {
      const argsSignatures = this.typeArgs.map((arg) => arg.toFullSignature(options)).join(', ');
      signature += `<${argsSignatures}>`;
    }

    if (options?.showDocs && this.doc) {
      const docString = this.doc.toFullSignature();
      signature = `${docString}\n${signature}`;
    }

    return signature;
  }

  /**
   * whether this type was already exported in this component
   */
  isFromThisComponent() {
    return !this.componentId && !this.packageName;
  }

  /**
   * whether this type is internal to the file.
   */
  isInternalReference() {
    return !!this.internalFilePath && this.isFromThisComponent();
  }

  /**
   * whether this type is exported from this component.
   */
  isExported() {
    return this.isFromThisComponent() && !this.isInternalReference();
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      componentId: this.componentId ? this.componentId.toObject() : undefined,
      packageName: this.packageName,
      internalFilePath: this.internalFilePath,
      typeArgs: this.typeArgs?.map((type) => type.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>): TypeRefSchema {
    const location = obj.location;
    const name = obj.name;
    let componentId;
    try {
      componentId = obj.componentId ? ComponentID.fromObject(obj.componentId) : undefined;
    } catch (e) {
      componentId = undefined;
    }
    const packageName = obj.packageName;
    const internalFilePath = obj.internalFilePath;
    const typeArgs = obj.typeArgs?.map((type: any) => SchemaRegistry.fromObject(type));
    return new TypeRefSchema(location, name, componentId, packageName, internalFilePath).withTypeArgs(typeArgs);
  }
}
