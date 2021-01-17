import 'reset-css';

import React, { HTMLAttributes } from 'react';
import { ComponentModel } from '@teambit/component';
import { docsFile } from '@teambit/documenter.types.docs-file';
import classNames from 'classnames';
import { isFunction } from 'ramda-adjunct';
import { MDXLayout } from '@teambit/ui.mdx-layout';

import styles from './base.module.scss';
import { ComponentOverview } from './component-overview';
import { CompositionsSummary } from './compositions-summary/compositions-summary';
import { ExamplesOverview } from './examples-overview';
import { Properties } from './properties/properties';
import { useComponentDocs } from './use-component-docs';

export type DocsSectionProps = {
  docs?: docsFile;
  compositions: React.ComponentType[];
  componentId: string;
} & HTMLAttributes<HTMLDivElement>;

const defaultDocs = {
  examples: [],
  labels: [],
  abstract: '',
};

/**
 * base template for react component documentation.
 */
export function Base({ docs = defaultDocs, componentId, compositions, ...rest }: DocsSectionProps) {
  const { loading, error, data } = useComponentDocs(componentId);

  // :TODO @uri please add a proper loader with amir
  if (loading) return null;
  if (error) throw error;

  const component = ComponentModel.from(data.getHost.get);
  const docsModel = data.getHost.getDocs;

  const { examples = [], labels = [], abstract = docsModel.abstract } = docs;
  const { displayName, version, packageName } = component;

  const Content: any = isFunction(docs.default) ? docs.default : () => null;

  return (
    <div className={classNames(styles.docsMainBlock)} {...rest}>
      <ComponentOverview
        displayName={Content.displayName || displayName}
        version={version}
        abstract={component.description || Content.abstract || abstract}
        labels={component.labels || Content.labels || labels}
        packageName={packageName}
      />

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
    </div>
  );
}
