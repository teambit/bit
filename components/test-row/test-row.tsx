import classNames from 'classnames';
import React from 'react';
import { CliSnippet } from '@teambit/staged-components.cli-snippet';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import styles from './test-row.module.scss';

export type TestRowProps = {
  content?: string;
  rowClass?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function TestRow({ children, content, className, rowClass }: TestRowProps) {
  // const [isOpen, setIsOpen] = useState(true);

  return (
    <ThemeContext>
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
    </ThemeContext>
  );
}
