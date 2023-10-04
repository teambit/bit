import React from 'react';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';
import { useAPI } from '@teambit/api-reference.hooks.use-api';
import { useAPIRefRenderers } from '@teambit/api-reference.hooks.use-api-renderers';

export type TaggedExportsProps = {
  componentId: string;
} & React.HtmlHTMLAttributes<HTMLDivElement>;

export function TaggedExports({ componentId, ...rest }: TaggedExportsProps) {
  const renderers = useAPIRefRenderers();
  console.log('🚀 ~ file: tagged-exports.tsx:13 ~ TaggedExports ~ renderers:', renderers);
  const api = useAPI(componentId, renderers.nodeRenderers, renderers.overviewRenderers, { skipInternals: true });
  console.log('🚀 ~ file: tagged-exports.tsx:12 ~ TaggedExports ~ api:', api);
  return (
    <Section {...rest}>
      <LinkedHeading>Properties</LinkedHeading>
      {/* <PropTable rows={properties} /> */}
    </Section>
  );
}
