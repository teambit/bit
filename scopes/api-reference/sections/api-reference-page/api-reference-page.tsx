import React, { useContext } from 'react';
import { ComponentContext } from '@teambit/component';
import flatten from 'lodash.flatten';
import { useSchema } from '@teambit/api-reference.hooks.use-schema';
import { APINodeRendererSlot } from '@teambit/api-reference';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';

export type APIRefPageProps = {
  host: string;
  rendererSlot: APINodeRendererSlot;
};

export function APIRefPage({ host, rendererSlot }: APIRefPageProps) {
  const component = useContext(ComponentContext);
  const renderers = flatten(rendererSlot.values());
  const { api, loading } = useSchema(host, component.id.toString());

  // TODO: add loading screen
  if (loading) {
    return <>loading</>;
  }

  // TODO: dont think this will be a valid state - see if we need a blank state
  if (!api) {
    return <>missing schema</>;
  }

  const { exports: schemaNodes } = api.module;

  /*
   * group schema nodes by schema type
   * TODO: move this to APISchemaVM
   */
  const schemaNodesByType = schemaNodes.reduce((accum, next) => {
    const existing = accum.get(next.__schema) || [];
    accum.set(next.__schema, existing.concat(next));
    return accum;
  }, new Map<string, SchemaNode[]>());

  console.log('🚀 ~ file: api-reference-page.tsx ~ line 39 ~ schemaNodesByType ~ schemaNodesByType', schemaNodesByType);

  return <div>Schema Page</div>;
}
