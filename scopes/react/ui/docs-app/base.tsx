import React, { HTMLAttributes } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useComponentDescriptor } from '@teambit/component';
import classNames from 'classnames';
import { docsFile } from '@teambit/documenter.types.docs-file';
import { isFunction } from 'ramda-adjunct';
import { Composer } from '@teambit/base-ui.utils.composer';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';
import { RenderingContext } from '@teambit/preview';
import { ComponentOverview } from '@teambit/component.ui.component-meta';
import { ReactAspect } from '@teambit/react';
import { useFetchDocs } from '@teambit/component.ui.hooks.use-fetch-docs';
import styles from './base.module.scss';
import { CompositionsSummary } from './compositions-summary/compositions-summary';
import { ExamplesOverview } from './examples-overview';
import { Properties } from './properties/properties';

const ENV_LIST_WITH_DOCS_TEMPLATE = ['react', 'env', 'aspect', 'lit', 'html'];

const ENV_ASPECT_NAME = 'teambit.envs/envs';

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
  const componentDescriptor = useComponentDescriptor();
  const { loading, error, data } = useFetchDocs(componentId);

  const { providers = [] } = renderingContext.get(ReactAspect.id) || {};

  if (!data || loading) return null;
  if (loading) return null;
  if (error) throw error;

  const { component, docs: docsModel } = data;

  const { examples = [], labels = [], abstract = docsModel.abstract } = docs;
  const { displayName, version, packageName, description, elementsUrl } = component;
  const Content: any = isFunction(docs.default) ? docs.default : () => null;

  const envType: string = componentDescriptor?.get<any>(ENV_ASPECT_NAME)?.type;
  const showHeaderOutsideIframe = component?.preview?.includesEnvTemplate === false || !ENV_LIST_WITH_DOCS_TEMPLATE.includes(envType);

  return (
    <div className={classNames(styles.docsMainBlock)} {...rest}>
      {showHeaderOutsideIframe ? (
        <></>
      ) : (
        <ComponentOverview
          displayName={Content.displayName || displayName}
          version={version}
          abstract={description || Content.abstract || abstract}
          labels={component.labels || Content.labels || labels}
          packageName={packageName}
          elementsUrl={elementsUrl}
        />
      )}
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

          <Properties properties={docsModel.properties} />
        </Composer>
      </ErrorBoundary>
    </div>
  );
}
