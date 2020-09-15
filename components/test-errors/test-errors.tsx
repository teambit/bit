import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';

import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import styles from './test-errors.module.scss';
import { Error } from '@teambit/tester';

export function TestErrors({ errors }: { errors: Error[] }) {
  if (errors.length === 0) return null;
  return (
    <>
      {errors.map((error, index) => {
        return (
          <div className={styles.errorBlock} key={index}>
            <div>An error occurred at {error.file}</div>
            <ThemeContext>
              <CodeSnippet className={styles.codeBlock} frameClass={styles.snippet} wrapLines={true}>
                {error.failureMessage}
              </CodeSnippet>
            </ThemeContext>
          </div>
        );
      })}
    </>
  );
}
