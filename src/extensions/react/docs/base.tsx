import React, { HTMLAttributes } from 'react';
import { useQuery } from '@apollo/react-hooks';
import classNames from 'classnames';
import { isFunction } from 'ramda-adjunct';
import 'reset-css';
import { gql } from 'apollo-boost';
import { ClientContext as ThemeContext } from '@bit/bit.test-scope.theme.client-context';
import { ComponentModel } from '../../component/ui';
import { CompositionsSummary } from './compositions-summary/compositions-summary';
import { Properties } from './properties/properties';
// import { ThemeContext } from './theme-context';
import { ComponentOverview } from './component-overview';
import { ExamplesOverview } from './examples-overview';
import styles from './base.module.scss';

export type DocsSectionProps = {
  docs: any;
  compositions: React.ComponentType[];
  componentId: string;
} & HTMLAttributes<HTMLDivElement>;

const GET_COMPONENT = gql`
  query($id: String!) {
    workspace {
      getComponent(id: $id) {
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

/**
 * base template for react component documentation.
 */
export function Base({ docs = {}, componentId, compositions, ...rest }: DocsSectionProps) {
  const { loading, error, data } = useQuery(GET_COMPONENT, {
    variables: { id: componentId },
  });
  // :TODO @uri please add a proper loader with amir
  if (loading) return <div></div>;
  if (error) throw error;

  const component = ComponentModel.from(data.workspace.getComponent);
  const docsModel = data.workspace.getDocs;

  // @todo uri we should pass all this as props properly to the template.
  const Content = isFunction(docs.default) ? docs.default : () => <div></div>;
  const labels = docs.labels || [];
  const examples = docs.examples || [];
  const abstract = docs.abstract || docsModel.abstract || '';
  const overviewCompositions = docs.compositions || compositions;

  return (
    <ThemeContext>
      <div className={classNames(styles.docsMainBlock)} {...rest}>
        <ComponentOverview
          displayName={component.displayName}
          version={component.version}
          abstract={abstract}
          labels={labels}
          packageName={component.packageName}
        />

        <Content />

        <CompositionsSummary compositions={overviewCompositions} />

        <ExamplesOverview examples={examples} />

        <Properties properties={docsModel.properties} />
      </div>
    </ThemeContext>
  );
}
