import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { HTMLAttributes, useMemo } from 'react';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import markDownSyntax from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { ComponentID } from '@teambit/component';
import styles from './code-view.module.scss';

export type CodeViewProps = {
  componentId: ComponentID;
  currentFile?: string;
  icon?: string;
} & HTMLAttributes<HTMLDivElement>;

SyntaxHighlighter.registerLanguage('md', markDownSyntax);

export function CodeView({ className, componentId, currentFile, icon }: CodeViewProps) {
  const { fileContent, loading } = useFileContent(componentId, currentFile);
  const title = useMemo(() => currentFile?.split('/').pop(), [currentFile]);
  const lang = useMemo(() => {
    const langFromFileEnding = currentFile?.split('.').pop();

    // for some reason, SyntaxHighlighter doesnt support scss or sass highlighting, only css. I need to check how to fix this properly
    if (langFromFileEnding === 'scss' || langFromFileEnding === 'sass') return 'css';
    if (langFromFileEnding === 'mdx') return 'md';
    return langFromFileEnding;
  }, [fileContent]);

  if (!fileContent && !loading && currentFile) return <EmptyCodeView />;
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

function EmptyCodeView() {
  return (
    <div className={styles.emptyCodeView}>
      <img src={`${staticStorageUrl}/harmony/empty-code-view.svg`} />
      <div>Nothing to show</div>
    </div>
  );
}
