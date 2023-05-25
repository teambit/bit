import React from 'react';
import classnames from 'classnames';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';

export type CodeEditorProps = {
  filePath?: string;
  fileContent?: string;
  language?: string;
  handleEditorDidMount?: OnMount;
  handleEditorBeforeMount?: BeforeMount;
  Loader?: React.ReactNode;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  className?: string;
  height?: string;
};

export const DEFAULT_EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: false },
  scrollbar: { alwaysConsumeMouseWheel: true, vertical: 'auto' },
  scrollBeyondLastLine: false,
  folding: false,
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  wordWrap: 'off',
  wrappingStrategy: undefined,
  fixedOverflowWidgets: true,
  renderLineHighlight: 'none',
  lineHeight: 20,
  padding: { top: 8 },
  hover: { enabled: false },
  cursorBlinking: 'smooth',
};

// a translation list of specific monaco languages that are not the same as their file ending.
const languageOverrides = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mdx: 'markdown',
  md: 'markdown',
};

export function CodeEditor({
  fileContent,
  filePath,
  language,
  handleEditorBeforeMount,
  handleEditorDidMount,
  Loader,
  options,
  className,
  height,
}: CodeEditorProps) {
  const defaultLang = React.useMemo(() => {
    if (!filePath) return languageOverrides.ts;
    const fileEnding = filePath?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [filePath]);

  return (
    <Editor
      path={filePath}
      value={fileContent || undefined}
      language={language || defaultLang}
      height={height || '100%'}
      onMount={handleEditorDidMount}
      className={classnames(darkMode, className)}
      theme={'vs-dark'}
      beforeMount={handleEditorBeforeMount}
      options={options || DEFAULT_EDITOR_OPTIONS}
      loading={Loader}
    />
  );
}
