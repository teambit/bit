import 'reset-css';

import React, { HTMLAttributes } from 'react';
import { useQuery } from '@apollo/react-hooks';
import { ComponentModel } from '@teambit/component';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { docsFile } from '@teambit/documenter.types.docs-file';
import { docsFields } from '@teambit/ui.queries.get-docs';
import { gql } from 'apollo-boost';
import classNames from 'classnames';
import { isFunction } from 'ramda-adjunct';
import { MDXLayout } from '@teambit/ui.mdx-layout';

import styles from './base.module.scss';
import { ComponentOverview } from './component-overview';
import { CompositionsSummary } from './compositions-summary/compositions-summary';
import { ExamplesOverview } from './examples-overview';
import { Properties } from './properties/properties';

export type DocsSectionProps = {
  docs?: docsFile;
  compositions: React.ComponentType[];
  componentId: string;
} & HTMLAttributes<HTMLDivElement>;

const GET_COMPONENT = gql`
  query($id: String!) {
    getHost {
      get(id: $id) {
        id {
          name
          version
          scope
        }
        displayName
        packageName
        compositions {
          identifier
        }
      }
      getDocs(id: $id) {
        ...docsFields
      }
    }
  }
  ${docsFields}
`;

const defaultDocs = {
  examples: [],
  labels: [],
  abstract: '',
};

/**
 * base template for react component documentation.
 */
export function Base({ docs = defaultDocs, componentId, compositions, ...rest }: DocsSectionProps) {
  const { loading, error, data } = useQuery(GET_COMPONENT, {
    variables: { id: componentId },
  });
  // :TODO @uri please add a proper loader with amir
  if (loading) return <div></div>;
  if (error) throw error;

  const component = ComponentModel.from(data.getHost.get);
  const docsModel = data.getHost.getDocs;

  const { examples = [], labels = [], abstract = docsModel.abstract } = docs;
  const { displayName, version, packageName } = component;

  const Content: any = isFunction(docs.default) ? docs.default : () => null;

  return (
    <ThemeContext>
      <div className={classNames(styles.docsMainBlock)} {...rest}>
        <ComponentOverview
          displayName={Content.displayName || displayName}
          version={version}
          abstract={Content.abstract || abstract}
          labels={Content.labels || labels}
          packageName={packageName}
        />

        {Content.isMDXComponent ? (
          <MDXLayout>
            <Content />
          </MDXLayout>
        ) : (
          <Content />
        )}

        <CompositionsSummary compositions={compositions} />

        <ExamplesOverview examples={Content.examples || examples} />

        <Properties properties={docsModel.properties} />
      </div>
    </ThemeContext>
  );
}
