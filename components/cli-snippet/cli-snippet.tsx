import classNames from 'classnames';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import React, { useMemo } from 'react';
import Convert from 'ansi-to-html';
import styles from './cli-snippet.module.scss';

export type CliSnippetProps = {
  content: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function CliSnippet({ content, ...rest }: CliSnippetProps) {
  const convert = new Convert();
  const res = useMemo(() => errorFormat(content), [content]);
  return (
    <div {...rest} className={classNames(styles.log)}>
      {res &&
        res.map((r) => {
          return (
            <ThemeContext>
              <div className={styles.block}>
                <span className={styles.line} dangerouslySetInnerHTML={{ __html: convert.toHtml(r) }} />
              </div>
            </ThemeContext>
          );
        })}
    </div>
  );
}

function errorFormat(content: string) {
  if (!content) return;
  const res = content.split('\n');
  return res.map((r) => r.replace('[2m', '\xa0'));
}
