import classNames from 'classnames';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import React, { useMemo } from 'react';
import Convert from 'ansi-to-html';
import styles from './cli-snippet.module.scss';

export type CliSnippetProps = {
  content: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function CliSnippet({ content, className, ...rest }: CliSnippetProps) {
  const convert = new Convert();
  const res = useMemo(() => errorFormat(content), [content]);
  return (
    <div {...rest} className={classNames(styles.log, className)}>
      {res &&
        res.map((r) => {
          return (
            <ThemeContext>
              <pre>
                <div className={styles.block}>
                  <span className={styles.line} dangerouslySetInnerHTML={{ __html: convert.toHtml(r) }} />
                </div>
              </pre>
            </ThemeContext>
          );
        })}
    </div>
  );
}

function errorFormat(content: string) {
  if (!content) return;
  return content.split('\n');
}
