import React from 'react';
import { H5 } from '@teambit/evangelist-temp.elements.heading';
import { Paragraph } from '@teambit/base-ui-temp.text.paragraph';
import { PossibleSizes } from '@teambit/base-ui-temp.theme.sizes';
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
