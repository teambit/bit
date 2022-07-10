import React from 'react';
import { isFunction } from 'lodash';
import { RenderingContext } from '@teambit/preview';
import { PropertiesTable } from '@teambit/react.ui.docs.properties-table';
import { CompositionsCarousel } from '@teambit/react.ui.docs.compositions-carousel';
import { DocsContent } from '@teambit/react.ui.docs.docs-content';
import { ApplyProviders } from '@teambit/react.ui.docs.apply-providers';

import { DocsTheme } from './docs-theme';
import { ExamplesOverview } from './examples-overview';
import type { DocsFile } from './examples-overview';
import styles from './docs-app.module.scss';

export type ReactDocsAppProps = {
  componentId: string,
  docs: DocsFile | undefined,
  compositions: any,
  context: RenderingContext
};

export const defaultDocs = {
  examples: [],
  labels: [],
  abstract: '',
};

export function DocsApp({
    componentId,
    docs = defaultDocs,
    compositions,
    context
  }: ReactDocsAppProps
) {

  // Next 2 lines are to support legacy code (ExamplesOverview)
  const { examples = [] } = docs;
  const Content: any = isFunction(docs.default) ? docs.default : () => null;

  return (
    <DocsTheme>
      <ApplyProviders renderingContext={context}>
        <DocsContent docs={docs} className={styles.mdx}/>

        <CompositionsCarousel
          compositions={compositions}
          className={styles.compositionSection}
          compositionCardClass={styles.compositionCard}
        />
        <PropertiesTable componentId={componentId} />
        <ExamplesOverview examples={Content.examples || examples} />
      </ApplyProviders>
    </DocsTheme>
  );
}
