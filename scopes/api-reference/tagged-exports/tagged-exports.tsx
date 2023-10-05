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
      <LinkedHeading className={styles.heading} size={'xs'}>
        <div className={styles.title}>
          <img style={{ width: 18 }} src="https://static.bit.dev/bit-icons/api-ref.svg" />
          <span>API</span>
        </div>
      </LinkedHeading>
      <div className={styles.content}>
        {showTableOfContents && api.apiModel && <APIReferenceTableOfContents apiModel={api.apiModel} />}
      </div>
      <div className={styles.banner}>
        <img style={{ width: 16 }} src="https://static.bit.dev/bit-icons/lightbulb-thinking.svg" />
        <span>
          Use the
          <span className={styles.highlighted}>@exports</span>
          jsdoc tag to only show relevant APIs with details for your users
        </span>
      </div>
      {/* <PropTable rows={properties} /> */}
    </Section>
  );
}
