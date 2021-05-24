import 'reset-css';
import React, { HTMLAttributes } from 'react';
import { docsFile } from '@teambit/documenter.types.docs-file';
import classNames from 'classnames';
import { isFunction } from 'ramda-adjunct';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { RenderingContext } from '@teambit/preview';
import { withProviders } from '../mount';
import { ReactAspect } from '../react.aspect';
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

  if (!data || loading) return null;
  if (loading) return null;
  if (error) throw error;

  const { component, docs: docsModel } = data;

  const { examples = [], labels = [], abstract = docsModel.abstract } = docs;
  const { displayName, version, packageName, description } = component;
  const Content: any = isFunction(docs.default) ? docs.default : () => null;
  const reactContext = renderingContext.get(ReactAspect.id);
  const Provider = withProviders(reactContext?.providers);

  return (
    <div className={classNames(styles.docsMainBlock)} {...rest}>
      <ComponentOverview
        displayName={Content.displayName || displayName}
        version={version}
        abstract={description || Content.abstract || abstract}
        labels={component.labels || Content.labels || labels}
        packageName={packageName}
      />

      <Provider>
        {Content.isMDXComponent ? (
          <MDXLayout>
            <div className={styles.mdx}>
              <Content />
            </div>
          </MDXLayout>
        ) : (
          <Content />
        )}

        <CompositionsSummary compositions={compositions} className={styles.compositionSection} />

        <ExamplesOverview examples={Content.examples || examples} />

        <Properties properties={docsModel.properties} />
      </Provider>
    </div>
  );
}
