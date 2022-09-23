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
  renderer?: APINodeRenderer;
};

export class APIReferenceModel {
  apiByType: Map<string, APINode[]>;
  apiNodes: APINode[];
  componentId: ComponentID;

  constructor(_api: APISchema, _renderers?: APINodeRenderer[]) {
    this.apiNodes = this.mapToAPINode(_api, _renderers);
    this.apiByType = this.groupByType(this.apiNodes);
    this.componentId = _api.componentId;
  }

  mapToAPINode(api: APISchema, renderers?: APINodeRenderer[]): APINode[] {
    const { exports: schemaNodes } = api.module;
    return schemaNodes.map((schemaNode) => ({
      api: schemaNode,
      renderer: renderers && renderers.find((renderer) => renderer.predicate(schemaNode)),
    }));
  }

  getByType(type: string) {
    return this.apiByType.get(type);
  }

  groupByType(apiNodes: APINode[]): Map<string, APINode[]> {
    return apiNodes.reduce((accum, next) => {
      const existing = accum.get(next.api.__schema) || [];
      accum.set(next.api.__schema, existing.concat(next));
      return accum;
    }, new Map<string, APINode[]>());
  }

  static from(result: SchemaQueryResult, renderers?: APINodeRenderer[]): APIReferenceModel {
    const apiSchema = APISchema.fromObject(result.getHost.getSchema);
    return new APIReferenceModel(apiSchema, renderers);
  }
}
