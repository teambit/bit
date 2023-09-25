import { SchemaNode, SchemaRegistry } from '@teambit/semantics.entities.semantic-schema';
import { ComponentID } from '@teambit/component-id';

export type TaggedExportsQueryResult = {
  getHost: {
    getTaggedSchemaExports: {
      taggedModuleExports: JSON[];
    };
  };
};

export class TaggedExportsModel {
  constructor(public taggedExports: SchemaNode[], public componentId: ComponentID) {}

  static from(result: TaggedExportsQueryResult, componentIdStr: string): TaggedExportsModel {
    try {
      const taggedExports = result.getHost.getTaggedSchemaExports.taggedModuleExports.map((taggedExport) =>
        SchemaRegistry.fromObject(taggedExport)
      );
      const componentId = ComponentID.fromString(componentIdStr);
      return new TaggedExportsModel(taggedExports, componentId);
    } catch (e) {
      // console.log("🚀 ~ file: api-tagged-exports-model.ts:26 ~ APITaggedExportsModel ~ from ~ e:", e)
      return new TaggedExportsModel([], ComponentID.fromString(componentIdStr));
    }
  }
}
