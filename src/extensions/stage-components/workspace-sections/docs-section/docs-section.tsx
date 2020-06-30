import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { H1 } from '@bit/bit.evangelist.elements.heading';
// import { Avatar } from '../../../workspace-components/avatar';
import { PossibleSizes } from '@bit/bit.base-ui.theme.sizes';
import { Paragraph } from '@bit/bit.base-ui.text.paragraph';
import { mutedText } from '@bit/bit.base-ui.text.muted-text';
import { LabelList } from '../../workspace-components/label';
import { Separator } from '../../workspace-components/separator';
import { VersionTag } from '../../workspace-components/version-tag';
import styles from './docs-section.module.scss';
import { InstallMethods, InstallMethodsData } from '../../workspace-components/install-methods';

function getText(text: Bla) {
  // var text = 'Hello `@James P. Pauli`, How r `you`.';

  const markupText = text.text.replace(/`(.*?)`/g, '<code>$1</code>');
  return markupText;
}

type Bla = {
  text: string;
};

function CreateMarkup(text: Bla): JSX.Element {
  const formattedText = getText(text);
  return <div className={styles.enhancedText} dangerouslySetInnerHTML={{ __html: formattedText }} />;
}

// const data = [
//   {
//     name: 'as',
//     type: 'elementType',
//     defaultValue: '20 minutes',
//     description: 'An element type to render as (string or function).'
//   },
//   {
//     name: 'className',
//     type: 'string',
//     defaultValue: 'false',
//     description: 'Additional classes.'
//   }
// ];

export type DocsSectionProps = {
  // version?: Version;
  title: string;
  subTitle: string;
  labels?: string[];
  installMethods: InstallMethodsData[];
} & HTMLAttributes<HTMLDivElement>;
/**
 * change log section
 * @name DocsSection
 */
export function DocsSection({ title, subTitle, labels, installMethods, className, ...rest }: DocsSectionProps) {
  return (
    <div className={classNames(styles.docsMainBlock, className)} {...rest}>
      <div className={styles.topRow}>
        <H1 className={classNames(styles.maxWidth, styles.marginRight)}>{title}</H1>
        <VersionTag className={styles.marginRight}>Latest</VersionTag>
      </div>
      <Subtitle className={styles.marginBottom}>{subTitle}</Subtitle>
      <LabelList className={styles.marginBottom}>{labels}</LabelList>
      <Separator className={styles.marginBottom} />
      <InstallMethods data={installMethods} className={classNames(styles.maxWidth, styles.marginBottom)} />
      {/* <Paragraph>
        You can set the type of the choice to be either a radio or a checkbox. Using radio type allows you to use Choice
        component inside Google’s Choice Group.
      </Paragraph> */}
      <CreateMarkup text=" `RadioGroup` is a helpful wrapper used to group `radio` components that provides an easier API, and proper keyboard accessibility to the group." />
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
