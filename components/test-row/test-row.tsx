import classNames from 'classnames';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import React, { useState, ReactNode } from 'react';

import styles from './test-row.module.scss';

export type TestRowProps = {
  content?: string;
  rowClass?: string;
  snippetTitle?: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function TestRow({ children, content, className, rowClass, snippetTitle }: TestRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={classNames(styles.testBlock, className, isOpen && styles.open, content && styles.hover)}>
      <div
        className={classNames(styles.row, rowClass)}
        onClick={() => {
          if (!content) return;
          setIsOpen(!isOpen);
        }}
      >
        {children}
      </div>
      {content && (
        <div className={classNames(styles.log, isOpen && styles.open)}>
          {snippetTitle}
          <ThemeContext>
            <CodeSnippet className={styles.snippet}>{content}</CodeSnippet>
          </ThemeContext>
        </div>
      )}
    </div>
  );
}
