import type { APISchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { compact, uniqBy } from 'lodash';

export type ReactDocsProperty = {
  name: string;
  description: string;
  required: boolean;
  type: string;
  defaultValue?: { value: string; computed: boolean };
};

export type ReactDocsFromSchema = {
  abstract: string;
  filePath: string;
  properties: ReactDocsProperty[];
};

/**
 * schema nodes are matched on `__schema` rather than `instanceof`, so that a duplicated copy of
 * the semantic-schema module (a real possibility across the aspect graph) doesn't silently stop
 * every prop from resolving.
 */
function isSchema(node: SchemaNode | undefined, schemaName: string): boolean {
  return node?.__schema === schemaName;
}

function unwrapExports(module: { exports: SchemaNode[] }): SchemaNode[] {
  return module.exports.flatMap((node) => {
    if (isSchema(node, 'ExportSchema')) {
      const exportNode = (node as unknown as { exportNode?: SchemaNode }).exportNode;
      return exportNode ? [exportNode] : [];
    }
    if (isSchema(node, 'ModuleSchema')) return unwrapExports(node as unknown as { exports: SchemaNode[] });
    return [node];
  });
}

/**
 * a props type may be exported alongside the component, or declared privately in one of its files,
 * so both are indexed to resolve a type reference by name.
 */
function indexByName(api: APISchema): Map<string, SchemaNode> {
  const index = new Map<string, SchemaNode>();
  const add = (node: SchemaNode) => {
    if (node.name && !index.has(node.name)) index.set(node.name, node);
  };
  unwrapExports(api.module).forEach(add);
  api.module.internals.forEach(add);
  api.internals.forEach((internal) => {
    unwrapExports(internal).forEach(add);
    internal.internals.forEach(add);
  });
  return index;
}

/**
 * resolves a props type down to the members it contributes: an inline object type, an interface, an
 * alias to either, or an intersection of them. a reference that resolves to nothing contributes no
 * members — the schema of one component doesn't describe types owned by another component or by an
 * external package.
 */
function membersOf(
  node: SchemaNode | undefined,
  index: Map<string, SchemaNode>,
  seen = new Set<SchemaNode>()
): SchemaNode[] {
  if (!node || seen.has(node)) return [];
  seen.add(node);

  if (isSchema(node, 'TypeRefSchema')) {
    return node.name ? membersOf(index.get(node.name), index, seen) : [];
  }
  if (isSchema(node, 'TypeSchema')) {
    return membersOf((node as unknown as { type?: SchemaNode }).type, index, seen);
  }
  if (isSchema(node, 'TypeLiteralSchema') || isSchema(node, 'InterfaceSchema')) {
    return (node as unknown as { members: SchemaNode[] }).members;
  }
  if (isSchema(node, 'TypeIntersectionSchema')) {
    return (node as unknown as { types: SchemaNode[] }).types.flatMap((type) => membersOf(type, index, seen));
  }
  return [];
}

/**
 * default values live on the destructured parameter (`{ isTag = () => true }`) rather than on the
 * props type, so they are collected separately and merged in by name.
 */
function defaultsByName(props: SchemaNode | undefined): Map<string, string> {
  const bindingNodes = (props as unknown as { objectBindingNodes?: SchemaNode[] } | undefined)?.objectBindingNodes;
  const defaults = new Map<string, string>();
  bindingNodes?.forEach((node) => {
    const { name, defaultValue } = node as unknown as { name?: string; defaultValue?: string };
    if (name && defaultValue !== undefined && !defaults.has(name)) defaults.set(name, defaultValue);
  });
  return defaults;
}

function toProperty(member: SchemaNode, defaults: Map<string, string>): ReactDocsProperty | undefined {
  if (!member.name) return undefined;
  const { type, isOptional, doc } = member as unknown as {
    type?: SchemaNode;
    isOptional?: boolean;
    doc?: { comment?: string; raw?: string };
  };
  const defaultValue = defaults.get(member.name);

  return {
    name: member.name,
    description: doc?.comment || '',
    required: isOptional === undefined ? false : !isOptional,
    type: type ? type.toString() : member.toString(),
    defaultValue: defaultValue === undefined ? undefined : { value: defaultValue, computed: false },
  };
}

/**
 * derives the docs shown in the properties table from the component's API schema.
 *
 * only the first React component that resolves any props is described, which is what the docs UI
 * has always rendered — it reads a single entry, not one per export.
 */
export function reactDocsFromSchema(api: APISchema): ReactDocsFromSchema | undefined {
  const reactNodes = unwrapExports(api.module).filter((node) => isSchema(node, 'ReactSchema'));
  if (!reactNodes.length) return undefined;

  const index = indexByName(api);

  const docsFor = (node: SchemaNode): ReactDocsFromSchema => {
    const props = (node as unknown as { props?: SchemaNode }).props;
    const propsType = (props as unknown as { type?: SchemaNode } | undefined)?.type;
    const defaults = defaultsByName(props);
    const properties = uniqBy(
      compact(membersOf(propsType, index).map((member) => toProperty(member, defaults))),
      'name'
    );
    const doc = (node as unknown as { doc?: { comment?: string } }).doc;

    return {
      abstract: doc?.comment || '',
      filePath: node.location.filePath,
      properties,
    };
  };

  const allDocs = reactNodes.map(docsFor);
  return allDocs.find((docs) => docs.properties.length > 0) || allDocs[0];
}
