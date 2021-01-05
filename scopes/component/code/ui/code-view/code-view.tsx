import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { HTMLAttributes, useMemo } from 'react';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { useFileContent } from '@teambit/ui.queries.get-file-content';
import { ComponentID } from '@teambit/component';
import styles from './code-view.module.scss';

export type CodeViewProps = {
  componentId: ComponentID;
  currentFile?: string;
  icon?: string;
} & HTMLAttributes<HTMLDivElement>;

export function CodeView({ className, componentId, currentFile, icon }: CodeViewProps) {
  const { fileContent, loading } = useFileContent(componentId, currentFile);
  const title = useMemo(() => currentFile?.split('/').pop(), [currentFile]);
  const lang = useMemo(() => {
    const langFromFileEnding = currentFile?.split('.').pop();

    // for some reason, SyntaxHighlighter doesnt support scss or sass highlighting, only css. I need to check how to fix this properly
    if (langFromFileEnding === 'scss' || langFromFileEnding === 'sass') return 'css';
    return langFromFileEnding;
  }, [fileContent]);

  if (!fileContent) return null; // is there a state where the is no file content? what should be presented then?
  return (
    <div className={classNames(styles.codeView, className)}>
      <H1 size="sm" className={styles.fileName}>
        {currentFile && <img className={styles.img} src={icon} />}
        <span>{title}</span>
      </H1>
      <CodeSnippet
        className={styles.codeSnippetWrapper}
        frameClass={styles.codeSnippet}
        showLineNumbers
        language={lang}
      >
        {fileContent || ''}
      </CodeSnippet>
    </div>
  );
}
