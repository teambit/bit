import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { HTMLAttributes, useMemo, useState } from 'react';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import { ComponentID } from '@teambit/component';
import { DiffEditor, DiffEditorProps } from '@monaco-editor/react';
import styles from './code-diff-view.module.scss';

// a translation list of specific monaco languages that are not the same as their file ending.
const languages = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mdx: 'markdown',
  md: 'markdown',
};

export type CodeDiffViewProps = {
  from: ComponentID;
  to: ComponentID;
  currentFile: string;
} & HTMLAttributes<HTMLDivElement>;

export function CodeDiffView({ className, from, currentFile, to }: CodeDiffViewProps) {
  const { fileContent: originalFileContent, loading: originalLoading } = useFileContent(from, currentFile);
  const { fileContent: modifiedFileContent, loading: modifiedLoading } = useFileContent(to, currentFile);
  const [selected] = useState(currentFile);
  const title = useMemo(() => currentFile?.split('/').pop(), [currentFile]);
  const language = useMemo(() => {
    if (!selected) return languages.ts;
    const fileEnding = selected?.split('.').pop();
    return languages[fileEnding || ''] || fileEnding;
  }, [currentFile]);

  if (originalLoading || modifiedLoading) return null;

  const diffEditorProps: DiffEditorProps = {
    modified: modifiedFileContent || undefined,
    original: originalFileContent,
    language,
    height: '90vh',
    onMount: handleEditorDidMount,
    className: styles.diffEditor,
  };

  return (
    <div className={classNames(styles.codeDiffView, className)}>
      <div className={styles.fileName}>
        <H1 size="sm" className={styles.fileName}>
          <span>{title}</span>
        </H1>
      </div>
      <div>
        <DiffEditor {...diffEditorProps} />
      </div>
    </div>
  );
}
// this disables ts errors in editor
function handleEditorDidMount(editor, monaco) {
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
}
