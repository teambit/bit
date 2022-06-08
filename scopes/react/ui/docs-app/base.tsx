import React, { HTMLAttributes } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import classNames from 'classnames';
import { docsFile } from '@teambit/documenter.types.docs-file';
import { isFunction } from 'lodash';
import { Composer } from '@teambit/base-ui.utils.composer';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';
import { RenderingContext } from '@teambit/preview';
import { ReactAspect } from '@teambit/react';
import { useFetchDocs } from '@teambit/component.ui.hooks.use-fetch-docs';
import styles from './base.module.scss';
import { CompositionsSummary } from './compositions-summary/compositions-summary';
import { ExamplesOverview } from './examples-overview';
import { Properties } from './properties/properties';

export type DocsSectionProps = {
  docs?: docsFile;
  compositions: React.ComponentType[];
  componentId: string;
  renderingContext: RenderingContext;
} & HTMLAttributes<HTMLDivElement>;

const defaultDocs = {
  examples: [],
  labels: [],
  abstract: '',
};

/**
 * base template for react component documentation
 */
export function Base({ docs = defaultDocs, componentId, compositions, renderingContext, ...rest }: DocsSectionProps) {
  const { loading, error, data } = useFetchDocs(componentId);

  const { providers = [] } = renderingContext.get(ReactAspect.id) || {};

  if (!data || loading) return null;
  if (loading) return null;
  if (error) throw error;

  const { docs: docsModel } = data;

  const { properties } = docsModel;
  const { examples = [] } = docs;
  const Content: any = isFunction(docs.default) ? docs.default : () => null;

  return (
    <div className={classNames(styles.docsMainBlock)} {...rest}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Composer components={providers}>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            {Content.isMDXComponent ? (
              <MDXLayout className={styles.mdx}>
                <Content />
              </MDXLayout>
            ) : (
              <Content />
            )}
          </ErrorBoundary>

          <CompositionsSummary
            compositions={compositions}
            className={styles.compositionSection}
            compositionCardClass={styles.compositionCard}
          />

          <ExamplesOverview examples={Content.examples || examples} />

          <Properties properties={properties} />
        </Composer>
      </ErrorBoundary>
    </div>
  );
}
