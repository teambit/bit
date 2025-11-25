import React from 'react';
import classnames from 'classnames';
import type { OnMount, BeforeMount, OnChange, EditorProps } from '@monaco-editor/react';
import { loader } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';

loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.48.0/min/vs' } });

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
  Editor?: React.FC<EditorProps> | null;
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
  Editor,
}: CodeEditorProps) {
  const defaultLang = React.useMemo(() => {
    if (!filePath) return languageOverrides.ts;
    const fileEnding = filePath?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [filePath]);

  if (!Editor) {
    return <>{Loader ?? null}</>;
  }

  return (
    <React.Suspense fallback={Loader ?? <></>}>
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
    </React.Suspense>
  );
}
