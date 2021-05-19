import classNames from 'classnames';
import React from 'react';
import { CliSnippet } from '@teambit/design.ui.cli-snippet';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import styles from './test-row.module.scss';

export type TestRowProps = {
  content?: string;
  rowClass?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function TestRow({ children, content, className, rowClass }: TestRowProps) {
  return (
    <ThemeContext>
      <div className={classNames(styles.testBlock, className)}>
        <div className={classNames(styles.row, rowClass)}>{children}</div>
        {content && <CliSnippet content={content} className={styles.snippet} />}
      </div>
    </ThemeContext>
  );
}
