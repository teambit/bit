import React from 'react';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';
import { useAPI } from '@teambit/api-reference.hooks.use-api';
import { useAPIRefRenderers } from '@teambit/api-reference.hooks.use-api-renderers';
import { APIReferenceTableOfContents } from '@teambit/api-reference.overview.api-reference-table-of-contents';
import styles from './tagged-exports.module.scss';

export type TaggedExportsProps = {
  componentId: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function TaggedExports({ componentId, ...rest }: TaggedExportsProps) {
  const renderers = useAPIRefRenderers();
  const api = useAPI(componentId, renderers.nodeRenderers, renderers.overviewRenderers, { skipInternals: true });
  const showTableOfContents = true || api.apiModel?.taggedAPINodes.length === 0;
  // const taggedAPIs = api.apiModel?.taggedAPINodes;
  return (
    <Section {...rest} className={styles.section}>
      <LinkedHeading>API</LinkedHeading>
      {showTableOfContents && api.apiModel && <APIReferenceTableOfContents apiModel={api.apiModel} />}
      {/* <PropTable rows={properties} /> */}
    </Section>
  );
}
