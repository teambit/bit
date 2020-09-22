import classNames from 'classnames';
import React, { ReactNode } from 'react';
import { CliSnippet } from '@teambit/staged-components.cli-snippet';

import styles from './test-row.module.scss';

export type TestRowProps = {
  content?: string;
  rowClass?: string;
  snippetTitle?: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function TestRow({ children, content, className, rowClass, snippetTitle }: TestRowProps) {
  // const [isOpen, setIsOpen] = useState(true);

  return (
    <div className={classNames(styles.testBlock, className)}>
      <div
        className={classNames(
          styles.row,
          rowClass
          // , content && styles.hover
        )}
        // onClick={() => {
        //   if (!content) return;
        //   setIsOpen(!isOpen);
        // }}
      >
        {children}
      </div>
      {content && <CliSnippet content={content} className={styles.snippet} />}
    </div>
  );
}
