import React, { HTMLAttributes, FC } from 'react';
import { useQuery } from '@apollo/react-hooks';
import classNames from 'classnames';
import { isFunction } from 'ramda-adjunct';
import 'reset-css';
import { gql } from 'apollo-boost';
import { ThemeContext } from '@teambit/documenter-temp.theme.theme-context';
import { docsFile } from '@teambit/documenter-temp.types.docs-file';
import { ComponentModel } from '../../component/ui';
import { CompositionsSummary } from './compositions-summary/compositions-summary';
import { Properties } from './properties/properties';
import { ComponentOverview } from './component-overview';
import { ExamplesOverview } from './examples-overview';
import styles from './base.module.scss';

export type DocsSectionProps = {
  docs: docsFile;
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
        abstract
        properties {
          name
          description
          required
          type
          defaultValue {
            value
            computed
          }
        }
      }
    }
  }
`;

// TODO - update docs type to have these as optional
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

  const Content = isFunction(docs.default) ? docs.default : () => null;

  return (
    <ThemeContext>
      <div className={classNames(styles.docsMainBlock)} {...rest}>
        <ComponentOverview
          displayName={displayName}
          version={version}
          abstract={abstract}
          labels={labels}
          packageName={packageName}
        />

        <Content />

        <CompositionsSummary compositions={compositions} />

        <ExamplesOverview examples={examples} />

        <Properties properties={docsModel.properties} />
      </div>
    </ThemeContext>
  );
}
