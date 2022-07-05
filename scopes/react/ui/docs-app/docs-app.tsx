import React from 'react';
import { isFunction } from 'lodash';
import { Properties } from '@teambit/react.ui.properties';
import { RenderingContext } from '@teambit/preview';
import { CompositionsSummary } from '@teambit/react.ui.compositions-summary';
import { DocsContent } from '@teambit/react.ui.docs-content';
import { ApplyProviders } from '@teambit/react.ui.apply-providers';

import { DocsTheme } from './docs-theme';
import { ExamplesOverview } from './examples-overview';
import type { DocsFile } from './examples-overview';
import styles from './docs-app.module.scss';

export type ReactDocsAppParams = {
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
  }: ReactDocsAppParams
) {

  // Next 2 lines are to support legacy code (ExamplesOverview)
  const { examples = [] } = docs;
  const Content: any = isFunction(docs.default) ? docs.default : () => null;

  return (
    <DocsTheme>
      <ApplyProviders renderingContext={context}>
        <DocsContent docs={docs} className={styles.mdx}/>

        <CompositionsSummary
          compositions={compositions}
          className={styles.compositionSection}
          compositionCardClass={styles.compositionCard}
        />
        <Properties componentId={componentId} />
        <ExamplesOverview examples={Content.examples || examples} />
      </ApplyProviders>
    </DocsTheme>
  );
}
