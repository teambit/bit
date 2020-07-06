import React, { HTMLAttributes } from 'react';
import { useQuery } from '@apollo/react-hooks';
import classNames from 'classnames';
import { H1 } from '@bit/bit.evangelist.elements.heading';
import { isFunction } from 'ramda-adjunct';
import 'reset-css';
import { Theme } from '@bit/bit.base-ui.theme.theme-provider';
import { PossibleSizes } from '@bit/bit.base-ui.theme.sizes';
import { Paragraph } from '@bit/bit.base-ui.text.paragraph';
import { mutedText } from '@bit/bit.base-ui.text.muted-text';
import { ConsumableLinks } from '@bit/bit.test-scope.ui.consumable-links';
import { PropTable } from '@bit/bit.test-scope.ui.property-table';
import { gql } from 'apollo-boost';
import { ComponentModel } from '../../component/ui';
import { LabelList } from '../../stage-components/workspace-components/label';

import { Separator } from '../../stage-components/workspace-components/separator';
import { VersionTag } from '../../stage-components/workspace-components/version-tag';
import styles from './base.module.scss';
// import { InstallMethods, InstallMethodsData } from '../../stage-components/workspace-components/install-methods';
// import { Docs } from '../../docs/docs';

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
  // const examples = docs.examples || [];
  const abstract = docs.abstract || docsModel.abstract || '';
  const overviewCompositions = docs.compositions || compositions;

  return (
    <ClientContext>
      <div className={classNames(styles.docsMainBlock)} {...rest}>
        <div className={styles.topRow}>
          <H1 className={classNames(styles.maxWidth, styles.marginRight)}>{component.displayName}</H1>
          <VersionTag className={styles.marginRight}>{component.version}</VersionTag>
        </div>
        <div></div>
        <Subtitle className={styles.marginBottom}>{abstract}</Subtitle>
        <LabelList className={styles.marginBottom}>{labels}</LabelList>
        <Separator className={styles.marginBottom} />
        <ConsumableLinks data={[{ title: 'Package name', link: component.packageName }]}></ConsumableLinks>
        <Content />
        {docsModel.properties.length !== 0 && (
          <PropTable headings={['name', 'type', 'defaultValue', 'description']} rows={docsModel.properties} />
        )}
        {/* Playground:
        <Playground code={examples[0].code} scope={[examples[0].scope]} /> */}
        Compositions:
        {compositions &&
          Object.keys(overviewCompositions).map(key => {
            return (
              <div key={key}>
                {key}
                {compositions[key]()}
              </div>
            );
          })}
      </div>
    </ClientContext>
  );
}

type SubtitleProps = {} & React.HTMLAttributes<HTMLParagraphElement>;

function Subtitle({ children, className, ...rest }: SubtitleProps) {
  return (
    <Paragraph className={classNames(mutedText, styles.maxWidth, className)} size={PossibleSizes.xxl} {...rest}>
      {children}
    </Paragraph>
  );
}

type ClientContextProps = {
  children: JSX.Element;
};

function ClientContext({ children }: ClientContextProps) {
  return (
    <Theme>
      {/* // dev link for icons */}
      <link rel="stylesheet" href="https://i.icomoon.io/public/9dc81da9ad/Bit/style.css"></link>
      {children}
    </Theme>
  );
}
