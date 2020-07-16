import React from 'react';
import { H5 } from '@bit/bit.evangelist.elements.heading';
import { Paragraph } from '@bit/bit.base-ui.text.paragraph';
import { PossibleSizes } from '@bit/bit.base-ui.theme.sizes';
import styles from './commit-details.module.scss';

type CommitDetailsProps = {
  /**
   * gets commit title and commit message
   */
  commitTitle: string;
  commitMessage: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function CommitDetails({ commitTitle, commitMessage, className, ...rest }: CommitDetailsProps) {
  return (
    <div {...rest} className={className}>
      <H5 size={PossibleSizes.xxs} className={styles.commitTitle}>
        {commitTitle}
      </H5>
      <Paragraph>{commitMessage}</Paragraph>
    </div>
  );
}
