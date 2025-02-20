import { APISchema, ExportSchema, SchemaNode, TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import compact from 'lodash.compact';
import head from 'lodash.head';

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
  alias?: string;
};

export class APIReferenceModel {
  apiByType: Map<string, APINode[]>;
  apiByName: Map<string, APINode>;

  internalAPIKey(schema: SchemaNode, internalFilePath?: string) {
    return this.generateInternalAPIKey(internalFilePath || schema.location.filePath, schema.name);
  }

  generateInternalAPIKey(filePath: string, name = '') {
    return `${filePath}/${name}`;
  }

  apiNodes: APINode[];
  taggedAPINodes: APINode<SchemaNode>[] = [];
  componentId: ComponentID;

  constructor(
    public _api: APISchema,
    _renderers: APINodeRenderer[]
  ) {
    this.componentId = _api.componentId as any;
    this.apiNodes = this.mapToAPINode(_api, _renderers, this.componentId);
    this.apiByType = this.groupByType(this.apiNodes);
    this.apiByName = this.groupByName(this.apiNodes);
    this.taggedAPINodes = this.mapTaggedAPINode(_api, _renderers, this.componentId);
  }

  mapTaggedAPINode(api: APISchema, renderers: APINodeRenderer[], componentId: ComponentID): APINode<SchemaNode>[] {
    const { taggedModuleExports } = api;
    const defaultRenderers = renderers.filter((renderer) => renderer.default);
    const nonDefaultRenderers = renderers.filter((renderer) => !renderer.default);

    return taggedModuleExports
      .map((schemaNode) => ({
        componentId,
        api: schemaNode,
        exported: true,
        renderer:
          nonDefaultRenderers.find((renderer) => renderer.predicate(schemaNode)) ||
          defaultRenderers.find((renderer) => renderer.predicate(schemaNode)),
      }))
      .filter((schemaNode) => schemaNode.renderer) as APINode[];
  }

  mapToAPINode_bk(api: APISchema, renderers: APINodeRenderer[], componentId: ComponentID): APINode[] {
    const { internals } = api;

    const { exports: exportedSchemaNodes } = api.module;
    const exportedInternalKeySet = new Set(exportedSchemaNodes.map((schemaNode) => this.internalAPIKey(schemaNode)));

    const internalSchemaNodes = internals
      .reduce((acc, next) => {
        return acc.concat([...next.internals]);
      }, new Array<SchemaNode>())
      .filter((schemaNode) => !exportedInternalKeySet.has(this.internalAPIKey(schemaNode)));

    const defaultRenderers = renderers.filter((renderer) => renderer.default);
    const nonDefaultRenderers = renderers.filter((renderer) => !renderer.default);

    return exportedSchemaNodes
      .map(
        (schemaNode) =>
          ({
            componentId,
            api: ExportSchema.isExportSchema(schemaNode) ? schemaNode.exportNode : schemaNode,
            alias: ExportSchema.isExportSchema(schemaNode) ? schemaNode.alias : undefined,
            exported: true,
            renderer:
              nonDefaultRenderers.find((renderer) =>
                renderer.predicate(ExportSchema.isExportSchema(schemaNode) ? schemaNode.exportNode : schemaNode)
              ) ||
              defaultRenderers.find((renderer) =>
                renderer.predicate(ExportSchema.isExportSchema(schemaNode) ? schemaNode.exportNode : schemaNode)
              ),
          }) as APINode
      )
      .concat(
        internalSchemaNodes.map(
          (schemaNode) =>
            ({
              componentId,
              api: schemaNode,
              exported: false,
              renderer:
                nonDefaultRenderers.find((renderer) => renderer.predicate(schemaNode)) ||
                defaultRenderers.find((renderer) => renderer.predicate(schemaNode)),
            }) as APINode
        )
      )
      .filter((schemaNode) => schemaNode.renderer) as APINode[];
  }

  getByType(type: string): APINode<SchemaNode>[] {
    return this.apiByType.get(type) ?? [];
  }

  getByName(node: SchemaNode, internalFilePath?: string): APINode | undefined {
    if (!node.name) return undefined;
    return this.apiByName.get(node.name) ?? this.apiByName.get(this.internalAPIKey(node, internalFilePath));
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
      const name = next.alias || next.api.name;
      if (!name) return accum;
      const key = next.exported ? name : this.internalAPIKey(next.api);
      accum.set(key, next);
      return accum;
    }, new Map<string, APINode>());
  }

  private isInternalTypeReference(node: SchemaNode): node is TypeRefSchema {
    return node.__schema === 'TypeRefSchema' && (node as TypeRefSchema).isInternalReference();
  }

  mapToAPINode(api: APISchema, renderers: APINodeRenderer[], componentId: ComponentID): APINode[] {
    const { exports: exportedSchemaNodes } = api.module;

    const collectedInternals: SchemaNode[] = [];
    exportedSchemaNodes.forEach((exportedNode) => {
      const targetNode = ExportSchema.isExportSchema(exportedNode)
        ? exportedNode.exportNode
        : exportedNode;
      const allDescendants = targetNode.getAllNodesRecursively();
      allDescendants.forEach((descendant) => {
        if (descendant !== targetNode && this.isInternalTypeReference(descendant)) {
          collectedInternals.push(descendant);
        }
      });
    });

    const dedupedInternalsMap = new Map<string, SchemaNode>();
    for (const node of collectedInternals) {
      const key = this.internalAPIKey(node);
      if (!dedupedInternalsMap.has(key)) {
        dedupedInternalsMap.set(key, node);
      }
    }
    const internalSchemaNodes = Array.from(dedupedInternalsMap.values());

    const defaultRenderers = renderers.filter((renderer) => renderer.default);
    const nonDefaultRenderers = renderers.filter((renderer) => !renderer.default);

    const exportedAPINodes: APINode[] = exportedSchemaNodes.map((schemaNode) => {
      const targetNode = ExportSchema.isExportSchema(schemaNode)
        ? schemaNode.exportNode
        : schemaNode;
      return {
        componentId,
        api: targetNode,
        alias: ExportSchema.isExportSchema(schemaNode) ? schemaNode.alias : undefined,
        exported: true,
        renderer:
          nonDefaultRenderers.find((renderer) => renderer.predicate(targetNode)) ||
          defaultRenderers.find((renderer) => renderer.predicate(targetNode)),
      } as APINode;
    });

    const internalAPINodes: APINode[] = internalSchemaNodes.map((schemaNode) => {
      const internalSchemaNode = head(
        compact(
          api.internals
            .flatMap(i => i.exports)
            .map((e) => e.findNode((s) => s.name === schemaNode.name && s.__schema !== 'TypeRefSchema'))
        )
      ) || schemaNode;

      return {
        componentId,
        api: internalSchemaNode,
        exported: false,
        renderer:
          nonDefaultRenderers.find((renderer) => renderer.predicate(internalSchemaNode)) ||
          defaultRenderers.find((renderer) => renderer.predicate(internalSchemaNode)),
      } as APINode
    });

    return exportedAPINodes.concat(internalAPINodes).filter((node) => node.renderer);
  }

  static from(result: SchemaQueryResult, renderers: APINodeRenderer[] = []): APIReferenceModel {
    try {
      const apiSchema = APISchema.fromObject(result.getHost.getSchema);
      return new APIReferenceModel(apiSchema, renderers);
    } catch {
      return new APIReferenceModel(
        APISchema.empty(ComponentID.fromObject((result.getHost.getSchema as any).componentId as ComponentIdObj) as any),
        renderers
      );
    }
  }
}
