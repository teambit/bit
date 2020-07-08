import React, { HTMLAttributes } from 'react';
import { useQuery } from '@apollo/react-hooks';
import classNames from 'classnames';
import { isFunction } from 'ramda-adjunct';
import 'reset-css';
import { Section } from '@bit/bit.test-scope.ui.section';
import { LinkedHeading } from '@bit/bit.test-scope.ui.linked-heading';
import { gql } from 'apollo-boost';
import { ComponentModel } from '../../component/ui';
import { Playground } from './playground';
import { CompositionsSummary } from './compositions-summary/compositions-summary';
import { Properties } from './properties/properties';
import { ThemeContext } from './theme-context';
import { ComponentDetails } from './component-details';
import styles from './base.module.scss';
import spacing from './docs-spacer.module.scss';

export type DocsSectionProps = {
  docs: any;
  compositions: React.ComponentType[];
  componentId: string;
} & HTMLAttributes<HTMLDivElement>;

const GET_COMPONENT = gql`
  query($id: String!) {
    workspace {
      getComponent(id: $id) {
        id
        displayName
        version
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
    variables: { id: componentId }
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
      <div className={classNames(styles.docsMainBlock, spacing.docsStyles)} {...rest}>
        <ComponentDetails
          displayName={component.displayName}
          version={component.version}
          abstract={abstract}
          labels={labels}
          packageName={component.packageName}
        />

        <Content />

        <CompositionsSummary compositions={overviewCompositions} />

        <Section>
          {examples.length > 0 && (
            <LinkedHeading link="/~compositions" className={spacing.secondaryTitleMargin}>
              Examples
            </LinkedHeading>
          )}
          {examples.length > 0 && <Playground code={examples[0].code} scope={[examples[0].scope]} />}
        </Section>
        <Properties properties={docsModel.properties} />
      </div>
    </ThemeContext>
  );
}
