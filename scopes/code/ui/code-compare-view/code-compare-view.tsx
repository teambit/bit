import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { HTMLAttributes, useMemo, useState } from 'react';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import { ComponentID } from '@teambit/component';
import { DiffEditor, DiffEditorProps } from '@monaco-editor/react';
import styles from './code-compare-view.module.scss';

// a translation list of specific monaco languages that are not the same as their file ending.
const languages = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mdx: 'markdown',
  md: 'markdown',
};

export type CodeCompareViewProps = {
  from: ComponentID;
  to: ComponentID;
  fileName?: string;
} & HTMLAttributes<HTMLDivElement>;

export function CodeCompareView({ className, from, fileName, to }: CodeCompareViewProps) {
  // const { mainFile: fromMainFile, fileTree: fromFileTree = [] } = useCode(fromComponentId);
  // const { fileTree: toFileTree = [] } = useCode(toComponentId);

  // const currentFile = file || (fromMainFile as string);
  const { fileContent: originalFileContent, loading: originalLoading } = useFileContent(from, fileName);
  const { fileContent: modifiedFileContent, loading: modifiedLoading } = useFileContent(to, fileName);
  const [selected] = useState(fileName);
  const title = useMemo(() => fileName?.split('/').pop(), [fileName]);
  const language = useMemo(() => {
    if (!selected) return languages.ts;
    const fileEnding = selected?.split('.').pop();
    return languages[fileEnding || ''] || fileEnding;
  }, [fileName]);

  if (originalLoading || modifiedLoading) return null;

  const diffEditorProps: DiffEditorProps = {
    modified: modifiedFileContent || undefined,
    original: originalFileContent,
    language,
    height: '90vh',
    onMount: handleEditorDidMount,
    className: styles.diffEditor,
    theme: 'dark',
  };

  return (
    <div className={classNames(styles.codeDiffFileView, className)}>
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
