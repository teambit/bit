import classNames from 'classnames';
import React, { useMemo } from 'react';
import Convert from 'ansi-to-html';
import styles from './cli-snippet.module.scss';

export type CliSnippetProps = {
  content: string;
} & React.HTMLAttributes<HTMLDivElement>;

const colors = {
  0: '#000',
  1: '#F55',
  2: '#30BD6D',
  3: '#FFC640',
  4: '#5a5afb',
  5: '#A0A',
  6: '#0AA',
  7: '#AAA',
  8: '#848586',
  9: '#F55',
  10: '#5F5',
  11: '#FFC640',
  12: '#55F',
  13: '#F5F',
  14: '#5FF',
  15: '#EDEDED',
};

export function CliSnippet({ content, className, ...rest }: CliSnippetProps) {
  const convert = new Convert({ colors });
  const snippetContent = useMemo(() => errorFormat(content), [content]);
  return (
    <div {...rest} className={classNames(styles.log, className)}>
      {snippetContent &&
        snippetContent.map((line, index) => {
          return (
            <div key={index}>
              <pre className={styles.pre}>
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
