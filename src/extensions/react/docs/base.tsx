import React, { HTMLAttributes, isValidElement } from 'react';
import classNames from 'classnames';
import { useQuery } from '@apollo/react-hooks';
import { H1 } from '@bit/bit.evangelist.elements.heading';
import { isFunction } from 'ramda-adjunct';
import 'reset-css';

import { PossibleSizes } from '@bit/bit.base-ui.theme.sizes';
import { Paragraph } from '@bit/bit.base-ui.text.paragraph';
import { mutedText } from '@bit/bit.base-ui.text.muted-text';
import { LabelList } from '../../stage-components/workspace-components/label';
import { Separator } from '../../stage-components/workspace-components/separator';
import { VersionTag } from '../../stage-components/workspace-components/version-tag';
import { GET_COMPONENT } from './queries/component';
import styles from './base.module.scss';
import { ComponentModel } from '../../component/ui';
import { getCurrentComponentId } from './navigation';
// import { InstallMethods, InstallMethodsData } from '../../stage-components/workspace-components/install-methods';
// import { Docs } from '../../docs/docs';

type QueryProps = {};

export type DocsSectionProps = {
  docs: any;
  query: QueryProps;
} & HTMLAttributes<HTMLDivElement>;

/**
 * base template for react component documentation.
 */
export function Base({ docs = {}, ...rest }: DocsSectionProps) {
  const Content = isFunction(docs.default) ? docs.default : () => <div></div>;
  const labels = docs.labels || [];
  const abstract = docs.abstract || '';

  const compId = getCurrentComponentId();

  const { loading, error, data } = useQuery(GET_COMPONENT, {
    variables: { id: compId }
  });

  // :TODO @uri please add a proper loader with amir
  if (loading) return <div>loading</div>;
  if (error) throw error;
  const component = ComponentModel.from(data.workspace.getComponent);
  console.log('vars', component);

  return (
    <div className={classNames(styles.docsMainBlock)} {...rest}>
      <div>{component.id}</div>
      <div className={styles.topRow}>
        <H1 className={classNames(styles.maxWidth, styles.marginRight)}>{component.displayName}</H1>
        <VersionTag className={styles.marginRight}>Latest</VersionTag>
      </div>
      <div></div>
      <Subtitle className={styles.marginBottom}>{abstract}</Subtitle>
      <LabelList className={styles.marginBottom}>{labels}</LabelList>
      <Separator className={styles.marginBottom} />
      <Content />
    </div>
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
