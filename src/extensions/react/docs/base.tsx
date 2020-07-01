import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { H1 } from '@bit/bit.evangelist.elements.heading';
import 'reset-css';

import { Theme } from '@bit/bit.base-ui.theme.theme-provider';
import { PossibleSizes } from '@bit/bit.base-ui.theme.sizes';
import { Paragraph } from '@bit/bit.base-ui.text.paragraph';
import { mutedText } from '@bit/bit.base-ui.text.muted-text';
import { LabelList } from '../../stage-components/workspace-components/label';
import { Separator } from '../../stage-components/workspace-components/separator';
import { VersionTag } from '../../stage-components/workspace-components/version-tag';
import styles from './base.module.scss';
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
export function Base({ docs, query, ...rest }: DocsSectionProps) {
  const Content = docs.default;
  const labels = docs.labels;
  const abstract = docs.abstract;

  return (
    <ClientContext>
      <div className={classNames(styles.docsMainBlock)} {...rest}>
        {/* <div className={styles.topRow}>
          <H1 className={classNames(styles.maxWidth, styles.marginRight)}>{'title'}</H1>
          <VersionTag className={styles.marginRight}>Latest</VersionTag>
        </div>
        <div></div>
        <Subtitle className={styles.marginBottom}>{abstract}</Subtitle>
        <LabelList className={styles.marginBottom}>{labels}</LabelList>
        <Separator className={styles.marginBottom} /> */}
        <Content />
      </div>
    </ClientContext>
  );
}

// type SubtitleProps = {} & React.HTMLAttributes<HTMLParagraphElement>;

// function Subtitle({ children, className, ...rest }: SubtitleProps) {
//   return (
//     <Paragraph className={classNames(mutedText, styles.maxWidth, className)} size={PossibleSizes.xxl} {...rest}>
//       {children}
//     </Paragraph>
//   );
// }

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
