import { APISchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';

export type SchemaQueryResult = {
  getHost: {
    getSchema: JSON;
  };
};

export type APINode<T extends SchemaNode = SchemaNode> = {
  api: T;
  renderer: APINodeRenderer;
  componentId: ComponentID;
  exported: boolean;
};

export class APIReferenceModel {
  apiByType: Map<string, APINode[]>;
  apiByName: Map<string, APINode>;
  internalAPIKey(schema: SchemaNode) {
    return this.generateInternalAPIKey(schema.location.filePath, schema.name);
  }
  generateInternalAPIKey(filePath: string, name = '') {
    return `${filePath}/${name}`;
  }
  apiNodes: APINode[];
  componentId: ComponentID;

  constructor(public _api: APISchema, _renderers: APINodeRenderer[]) {
    this.componentId = _api.componentId;
    this.apiNodes = this.mapToAPINode(_api, _renderers, this.componentId);
    this.apiByType = this.groupByType(this.apiNodes);
    this.apiByName = this.groupByName(this.apiNodes);
  }

  mapToAPINode(api: APISchema, renderers: APINodeRenderer[], componentId: ComponentID): APINode[] {
    const { internals } = api;
    const internalSchemaNodes = internals.flatMap((internal) => internal.internals);

    const { exports: exportedSchemaNodes } = api.module;

    const defaultRenderers = renderers.filter((renderer) => renderer.default);
    const nonDefaultRenderers = renderers.filter((renderer) => !renderer.default);

    return exportedSchemaNodes
      .map((schemaNode) => ({
        componentId,
        api: schemaNode,
        exported: true,
        renderer:
          nonDefaultRenderers.find((renderer) => renderer.predicate(schemaNode)) ||
          defaultRenderers.find((renderer) => renderer.predicate(schemaNode)),
      }))
      .concat(
        internalSchemaNodes.map((schemaNode) => ({
          componentId,
          api: schemaNode,
          exported: false,
          renderer:
            nonDefaultRenderers.find((renderer) => renderer.predicate(schemaNode)) ||
            defaultRenderers.find((renderer) => renderer.predicate(schemaNode)),
        }))
      )
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

  groupByName(apiNodes: APINode[]): Map<string, APINode> {
    return apiNodes.reduce((accum, next) => {
      if (!next.api.name) return accum;
      const key = next.exported ? next.api.name : this.internalAPIKey(next.api);
      accum.set(key, next);
      return accum;
    }, new Map<string, APINode>());
  }

  static from(result: SchemaQueryResult, renderers: APINodeRenderer[]): APIReferenceModel {
    try {
      const apiSchema = APISchema.fromObject(result.getHost.getSchema);
      return new APIReferenceModel(apiSchema, renderers);
    } catch (e) {
      return new APIReferenceModel(
        APISchema.empty(ComponentID.fromObject((result.getHost.getSchema as any).componentId as ComponentIdObj)),
        renderers
      );
    }
  }
}
