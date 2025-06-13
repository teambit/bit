/* eslint-disable no-console */

import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

function useMeta(apiNode: any) {
  return (apiNode.api as any).schemaObj.meta;
}

function TestMeta(meta: any) {
  return <pre>{JSON.stringify(meta, null, 2)}</pre>;
}

function TempComponent({ apiNode }: APINodeRenderProps) {
  const meta = useMeta(apiNode);
  return <TestMeta {...meta} />;
}

function TempOverviewComponent({ apiNode }: APINodeRenderProps) {
  const meta = useMeta(apiNode);
  return <TestMeta {...meta} />;
}

function predicate(node: any): boolean {
  return (
    node.__schema === 'VueSchema' || (node.__schema === 'UnknownSchema' && node.schemaObj.__schema === 'VueSchema')
  );
}

export const tempRenderer: APINodeRenderer = {
  predicate,
  Component: TempComponent,
  OverviewComponent: TempOverviewComponent,
  nodeType: 'Vue',
  icon: { name: 'Vue', url: 'https://static.bit.dev/extensions-icons/vue.svg' },
  default: true,
};
