import React from 'react';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';
import { useAPI } from '@teambit/api-reference.hooks.use-api';
import { BlockSkeleton, WordSkeleton, CircleSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { useAPIRefRenderers } from '@teambit/api-reference.hooks.use-api-renderers';
import { APIReferenceTableOfContents } from '@teambit/api-reference.overview.api-reference-table-of-contents';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';

import styles from './tagged-exports.module.scss';

export type TaggedExportsProps = {
  componentId: string;
  showBanner?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function TaggedExports({ componentId, showBanner, ...rest }: TaggedExportsProps) {
  const renderers = useAPIRefRenderers();
  const api = useAPI(componentId, renderers.nodeRenderers);
  const showTableOfContents = api.apiModel?.taggedAPINodes.length === 0;

  const taggedAPIs = api.apiModel?.taggedAPINodes;
  const loading = !!api.loading;

  if (loading) {
    return (
      <Section {...rest} className={styles.section}>
        <div className={styles.loader}>
          <div className={styles.loaderTitle}>
            <CircleSkeleton size={1.5} />
            <WordSkeleton length={5} />
          </div>

          <BlockSkeleton lines={8} />
          <BlockSkeleton lines={4} />
        </div>
      </Section>
    );
  }

  if (!api.apiModel || !api.apiModel.apiNodes.length) return null;

  return (
    <Section {...rest} className={styles.section}>
      <LinkedHeading className={styles.heading} size={'sm'}>
        <div className={styles.title}>
          <img style={{ width: 24 }} src="https://static.bit.dev/bit-icons/api-ref.svg" />
          <span>API</span>
        </div>
      </LinkedHeading>
      {showTableOfContents && (
        <div className={styles.content}>
          <APIReferenceTableOfContents apiModel={api.apiModel} />
        </div>
      )}
      {
        <div className={styles.taggedAPIs}>
          {taggedAPIs?.map((taggedAPI, index) => {
            const OverviewComponent = taggedAPI.renderer.OverviewComponent;
            // @todo - change this to be non nullable
            if (!OverviewComponent) return null;
            return (
              <OverviewComponent
                apiNode={taggedAPI}
                key={`${taggedAPI.api.name}-${index}`}
                apiRefModel={api.apiModel as APIReferenceModel}
                renderers={renderers.nodeRenderers}
              />
            );
          })}
        </div>
      }
      {showBanner && (
        <div className={styles.banner}>
          <img style={{ width: 16 }} src="https://static.bit.dev/bit-icons/lightbulb-thinking.svg" />
          <span>
            Use the
            <span className={styles.highlighted}>@exports</span>
            jsdoc tag to only show relevant APIs with details for your users
          </span>
        </div>
      )}
    </Section>
  );
}
