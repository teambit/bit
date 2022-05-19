import React, { HTMLAttributes, useState, useMemo } from 'react';
import classNames from 'classnames';
import { H4 } from '@teambit/documenter.ui.heading';
import { DiffEditor, DiffEditorProps } from '@monaco-editor/react';
import { ComponentModel } from '@teambit/component';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';

import styles from './component-compare-code-view.module.scss';

export type ComponentCompareCodeViewProps = {
  base?: ComponentModel;
  compare?: ComponentModel;
  fileName: string;
} & HTMLAttributes<HTMLDivElement>;

// a translation list of specific monaco languages that are not the same as their file ending.
const languages = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mdx: 'markdown',
  md: 'markdown',
};

export function ComponentCompareCodeView({ className, base, compare, fileName }: ComponentCompareCodeViewProps) {
  const { fileContent: originalFileContent, loading: originalLoading } = useFileContent(base?.id, fileName);
  const { fileContent: modifiedFileContent, loading: modifiedLoading } = useFileContent(compare?.id, fileName);
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
  };

  return (
    <div className={classNames(styles.codeDiffView, className)}>
      <div className={styles.fileName}>
        <H4 size="xs" className={styles.fileName}>
          <span>{title}</span>
        </H4>
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
