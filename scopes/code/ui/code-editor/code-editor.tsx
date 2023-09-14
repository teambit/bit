import React from 'react';
import classnames from 'classnames';
import Editor, { OnMount, BeforeMount, OnChange } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';

export type CodeEditorProps = {
  filePath?: string;
  fileContent?: string;
  language?: string;
  height?: string;
  className?: string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  beforeMount?: BeforeMount;
  onMount?: OnMount;
  onChange?: OnChange;
  Loader?: React.ReactNode;
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
  padding: { top: 8, bottom: 8 },
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
  beforeMount,
  onMount,
  onChange,
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
      onMount={onMount}
      beforeMount={beforeMount}
      onChange={onChange}
      className={classnames(darkMode, className)}
      theme={'vs-dark'}
      options={options || DEFAULT_EDITOR_OPTIONS}
      loading={Loader}
    />
  );
}
