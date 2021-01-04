import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { HTMLAttributes } from 'react';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';

import styles from './code-view.module.scss';

export type CodeViewProps = {
  fileContent?: string;
  currentFile?: string;
  icon: string;
} & HTMLAttributes<HTMLDivElement>;

export function CodeView({ className, fileContent, currentFile, icon }: CodeViewProps) {
  return (
    <div className={classNames(styles.codeView, className)}>
      <H1 size="sm" className={styles.fileName}>
        {currentFile && <img className={styles.img} src={icon} />}
        <span>{currentFile?.split('/').pop()}</span>
      </H1>
      <CodeSnippet
        className={styles.codeSnippetWrapper}
        frameClass={styles.codeSnippet}
        showLineNumbers
        language={currentFile?.split('.').pop()}
      >
        {fileContent || ''}
      </CodeSnippet>
    </div>
  );
}
