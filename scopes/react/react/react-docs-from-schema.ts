import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { APISchema, SchemaRegistry, Schemas, VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { compact, uniqBy } from 'lodash';
import { ReactSchema } from './react.schema';

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

let schemaClassesRegistered = false;

/**
 * a schema may have been built by another copy of the semantic-schema package — an env's extractor graph,
 * or an artifact hydrated elsewhere — whose nodes predate the members API. the serialized form is the
 * contract between versions, so such a schema is re-hydrated through this package's classes.
 */
function normalize(api: APISchema): APISchema {
  if (typeof api.getMembersOf === 'function') return api;
  if (!schemaClassesRegistered) {
    SchemaRegistry.registerGetSchemas(() => [...Object.values(Schemas), ReactSchema]);
    schemaClassesRegistered = true;
  }
  return APISchema.fromObject(api.toObject());
}

function toProperty(member: SchemaNode, defaults: Map<string, string>): ReactDocsProperty | undefined {
  if (!member.name) return undefined;
  const defaultValue = defaults.get(member.name);
  const shape = VariableLikeSchema.isVariableLikeSchema(member)
    ? { type: member.type.toString(), required: !member.isOptional }
    : { type: member.toString(), required: false };

  return {
    name: member.name,
    description: member.doc?.comment || '',
    ...shape,
    defaultValue: defaultValue === undefined ? undefined : { value: defaultValue, computed: false },
  };
}

/**
 * derives the docs shown in the properties table from the component's API schema: the exported React
 * components, and the members of their props type as the schema resolves them.
 *
 * only the first component that resolves any props is described, which is what the docs UI has always
 * rendered — it reads a single entry, not one per export.
 */
export function reactDocsFromSchema(schema: APISchema): ReactDocsFromSchema | undefined {
  const api = normalize(schema);
  const reactNodes = api.module.listExports().filter(ReactSchema.isReactSchema);
  if (!reactNodes.length) return undefined;

  const docsFor = (node: ReactSchema): ReactDocsFromSchema => {
    const members = node.props ? api.getMembersOf(node.props.type) : [];
    const defaults = node.props?.getBindingDefaults() || new Map<string, string>();

    return {
      abstract: node.doc?.comment || '',
      filePath: node.location.filePath,
      properties: uniqBy(compact(members.map((member) => toProperty(member, defaults))), 'name'),
    };
  };

  const allDocs = reactNodes.map(docsFor);
  return allDocs.find((docs) => docs.properties.length > 0) || allDocs[0];
}
