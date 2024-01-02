import React from 'react';
import type { Docs } from '@teambit/docs';
import { defaultDocs } from '@teambit/docs';
import { RenderingContext } from '@teambit/preview';
import { PropertiesTable } from '@teambit/react.ui.docs.properties-table';
import { CompositionsCarousel } from '@teambit/react.ui.docs.compositions-carousel';
import { DocsContent } from '@teambit/react.ui.docs.docs-content';
import { DocsTheme } from './docs-theme';
import styles from './docs-app.module.scss';

export type ReactDocsAppProps = {
  componentId: string;
  docs: Docs | undefined;
  compositions: any;
  context: RenderingContext;
};

export function DocsApp({ componentId, docs = defaultDocs, compositions, context }: ReactDocsAppProps) {
  const withoutHash = window.location.hash.substring(1);
  const [, after] = withoutHash.split('?');
  const params = new URLSearchParams(after);
  const renderOnlyOverview = params.get('onlyOverview');

  return (
    <DocsTheme>
      <>
        <DocsContent docs={docs} className={styles.mdx} />
        {(!renderOnlyOverview || renderOnlyOverview === 'false') && (
          <CompositionsCarousel
            renderingContext={context}
            compositions={compositions}
            className={styles.compositionSection}
            compositionCardClass={styles.compositionCard}
          />
        )}
        {(!renderOnlyOverview || renderOnlyOverview === 'false') && <PropertiesTable componentId={componentId} />}
      </>
    </DocsTheme>
  );
}
