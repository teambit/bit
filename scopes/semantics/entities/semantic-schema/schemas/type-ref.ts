import { ComponentID } from '@teambit/component';
import { SchemaNode } from '../schema-node';

export class TypeRefSchema implements SchemaNode {
  constructor(
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
  ) {}
}
