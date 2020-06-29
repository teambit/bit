import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { H1 } from '@bit/bit.evangelist.elements.heading';
// import { Avatar } from '../../../workspace-components/avatar';
import { PossibleSizes } from '@bit/bit.base-ui.theme.sizes';
import { Paragraph } from '@bit/bit.base-ui.text.paragraph';
import { mutedText } from '@bit/bit.base-ui.text.muted-text';
import { LabelList } from '../../stage-components/workspace-components/label';
import { Separator } from '../../stage-components/workspace-components/separator';
import { VersionTag } from '../../stage-components/workspace-components/version-tag';
import styles from './base.module.scss';
// import { InstallMethods, InstallMethodsData } from '../../stage-components/workspace-components/install-methods';
// import { Docs } from '../../docs/docs';

export type DocsSectionProps = {
  docs: any;
} & HTMLAttributes<HTMLDivElement>;

/**
 * base template for react component documentation.
 */
export function Base({ docs, ...rest }: DocsSectionProps) {
  const Content = docs.default;
  const labels = docs.labels;
  const abstract = docs.abstract;

  return (
    <div className={classNames(styles.docsMainBlock)} {...rest}>
      <div className={styles.topRow}>
        <H1 className={classNames(styles.maxWidth, styles.marginRight)}>{'title'}</H1>
        <VersionTag className={styles.marginRight}>Latest</VersionTag>
      </div>
      <Subtitle className={styles.marginBottom}>{abstract}</Subtitle>
      <LabelList className={styles.marginBottom}>{labels}</LabelList>
      <Separator className={styles.marginBottom} />
      {/* <InstallMethods data={installMethods} className={classNames(styles.maxWidth, styles.marginBottom)} /> */}
      <Content />
      {/* <Paragraph>
        You can set the type of the choice to be either a radio or a checkbox. Using radio type allows you to use Choice
        component inside Google’s Choice Group.
      </Paragraph> */}
      {/* <CreateMarkup text=" `RadioGroup` is a helpful wrapper used to group `radio` components that provides an easier API, and proper keyboard accessibility to the group." /> */}
      {/* <PropertyTable data={data} /> */}
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
