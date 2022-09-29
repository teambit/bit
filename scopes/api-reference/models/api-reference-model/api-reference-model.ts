import { APISchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentID } from '@teambit/component-id';

export type SchemaQueryResult = {
  getHost: {
    getSchema: JSON;
  };
};

export type APINode = {
  api: SchemaNode;
  renderer: APINodeRenderer;
  componentId: ComponentID;
};

export class APIReferenceModel {
  apiByType: Map<string, APINode[]>;
  apiNodes: APINode[];
  componentId: ComponentID;

  constructor(_api: APISchema, _renderers: APINodeRenderer[]) {
    this.componentId = _api.componentId;
    this.apiNodes = this.mapToAPINode(_api, _renderers, this.componentId);
    this.apiByType = this.groupByType(this.apiNodes);
  }

  mapToAPINode(api: APISchema, renderers: APINodeRenderer[], componentId: ComponentID): APINode[] {
    const { exports: schemaNodes } = api.module;
    return schemaNodes
      .map((schemaNode) => ({
        api: schemaNode,
        renderer: renderers && renderers.find((renderer) => renderer.predicate(schemaNode)),
        componentId,
      }))
      .filter((schemaNode) => schemaNode.renderer) as APINode[];
  }

  getByType(type: string) {
    return this.apiByType.get(type);
  }

  groupByType(apiNodes: APINode[]): Map<string, APINode[]> {
    return apiNodes.reduce((accum, next) => {
      const existing = accum.get(next.renderer.nodeType) || [];
      accum.set(next.renderer.nodeType, existing.concat(next));
      return accum;
    }, new Map<string, APINode[]>());
  }

  static from(result: SchemaQueryResult, renderers: APINodeRenderer[]): APIReferenceModel {
    const apiSchema = APISchema.fromObject(result.getHost.getSchema);
    return new APIReferenceModel(apiSchema, renderers);
  }
}
