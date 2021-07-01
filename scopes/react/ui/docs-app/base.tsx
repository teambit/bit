import React, { HTMLAttributes, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import classNames from 'classnames';
import flatten from 'lodash.flatten';
import { docsFile } from '@teambit/documenter.types.docs-file';
import { isFunction } from 'ramda-adjunct';
import { Composer } from '@teambit/base-ui.utils.composer';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';
import { RenderingContext } from '@teambit/preview';
import { ReactAspect } from '@teambit/react';
import styles from './base.module.scss';
import { ComponentOverview } from './component-overview';
import { CompositionsSummary } from './compositions-summary/compositions-summary';
import { ExamplesOverview } from './examples-overview';
import { Properties } from './properties/properties';
import { useFetchDocs } from './use-fetch-docs';

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
 * base template for react component documentation.
 */
export function Base({ docs = defaultDocs, componentId, compositions, renderingContext, ...rest }: DocsSectionProps) {
  const { loading, error, data } = useFetchDocs(componentId);

  const rawProviders = renderingContext.get(ReactAspect.id);
  const reactContext = useMemo(() => flatten(Object.values(rawProviders || {})), [rawProviders]);

  if (!data || loading) return null;
  if (loading) return null;
  if (error) throw error;

  const { component, docs: docsModel } = data;

  const { examples = [], labels = [], abstract = docsModel.abstract } = docs;
  const { displayName, version, packageName, description } = component;
  const Content: any = isFunction(docs.default) ? docs.default : () => null;

  return (
    <div className={classNames(styles.docsMainBlock)} {...rest}>
      <ComponentOverview
        displayName={Content.displayName || displayName}
        version={version}
        abstract={description || Content.abstract || abstract}
        labels={component.labels || Content.labels || labels}
        packageName={packageName}
      />

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Composer components={reactContext}>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            {Content.isMDXComponent ? (
              <MDXLayout>
                <div className={styles.mdx}>
                  <Content />
                </div>
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

          <Properties properties={docsModel.properties} />
        </Composer>
      </ErrorBoundary>
    </div>
  );
}
