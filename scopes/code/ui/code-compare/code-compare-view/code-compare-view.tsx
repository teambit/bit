import { DiffEditor, DiffOnMount } from '@monaco-editor/react';
import { Toggle } from '@teambit/design.ui.input.toggle';
import { H4 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { HTMLAttributes, useMemo, useRef, useState } from 'react';
import { useCodeCompare } from '@teambit/code.ui.code-compare';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import styles from './code-compare-view.module.scss';

export type CodeCompareViewProps = {
  fileName: string;
} & HTMLAttributes<HTMLDivElement>;

// a translation list of specific monaco languages that are not the same as their file ending.
const languageOverrides = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mdx: 'markdown',
  md: 'markdown',
};

export function CodeCompareView({ className, fileName }: CodeCompareViewProps) {
  const codeCompareContext = useCodeCompare();

  const [ignoreWhitespace, setIgnoreWhitespace] = useState(true);
  const monacoRef = useRef<any>();

  const title = useMemo(() => fileName?.split('/').pop(), [fileName]);

  const language = useMemo(() => {
    if (!fileName) return languageOverrides.ts;
    const fileEnding = fileName?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [fileName]);

  const codeCompareDataForFile = codeCompareContext?.fileCompareDataByName.get(fileName);

  if (!codeCompareContext || codeCompareContext.loading || !codeCompareDataForFile) return null;

  const originalFileContent = codeCompareDataForFile.baseContent;
  const modifiedFileContent = codeCompareDataForFile.compareContent;

  const handleEditorDidMount: DiffOnMount = (_, monaco) => {
    /**
     * disable syntax check
     * ts cant validate all types because imported files arent available to the editor
     */
    monacoRef.current = monaco;
    if (monacoRef.current) {
      monacoRef.current.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
    }
  };

  const onIgnoreWhitespaceToggled = () => {
    setIgnoreWhitespace((exsitingState) => !exsitingState);
  };

  const diffEditor = (
    <DiffEditor
      modified={modifiedFileContent}
      original={originalFileContent}
      language={language}
      height={'100%'}
      onMount={handleEditorDidMount}
      className={darkMode}
      theme={'vs-dark'}
      options={{
        ignoreTrimWhitespace: ignoreWhitespace,
        readOnly: true,
      }}
      loading={
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      }
    />
  );

  return (
    <div
      key={`component-compare-code-view-${fileName}`}
      className={classNames(styles.componentCompareCodeViewContainer, className)}
    >
      <div className={styles.fileName}>
        <H4 size="xs" className={styles.fileName}>
          <span>{title}</span>
        </H4>
      </div>
      <div className={styles.ignoreWhitespaceControlContainer}>
        <div className={styles.toggleContainer}>
          <Toggle checked={ignoreWhitespace} onInputChanged={onIgnoreWhitespaceToggled} className={styles.toggle} />
          Ignore Whitespace
        </div>
      </div>
      <div className={styles.componentCompareCodeDiffEditorContainer}>{diffEditor}</div>
    </div>
  );
}
