import classNames from 'classnames';
import React, { useMemo } from 'react';
import Convert from 'ansi-to-html';
import styles from './cli-snippet.module.scss';

export type CliSnippetProps = {
  content: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function CliSnippet({ content, className, ...rest }: CliSnippetProps) {
  const convert = new Convert();
  const snippetContent = useMemo(() => errorFormat(content), [content]);
  return (
    <div {...rest} className={classNames(styles.log, className)}>
      {snippetContent &&
        snippetContent.map((line, index) => {
          return (
            <div key={index}>
              <pre>
                <div className={styles.block}>
                  <span className={styles.line} dangerouslySetInnerHTML={{ __html: convert.toHtml(line) }} />
                </div>
              </pre>
            </div>
          );
        })}
    </div>
  );
}

function errorFormat(content: string) {
  if (!content) return null;
  return content.split('\n');
}
