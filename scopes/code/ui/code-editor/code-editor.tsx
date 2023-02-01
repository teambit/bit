import React from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';

export type CodeEditorProps = {
  language: string;
  handleEditorDidMount?: OnMount;
  Loader: React.ReactNode;
  fileContent?: string;
  path: string;
  wordWrap?: boolean;
};

export function CodeEditor({ language, fileContent, path, handleEditorDidMount, wordWrap, Loader }: CodeEditorProps) {
  return (
    <Editor
      path={path}
      value={fileContent}
      language={language}
      height={'100%'}
      onMount={handleEditorDidMount}
      className={darkMode}
      theme={'vs-dark'}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        scrollbar: { alwaysConsumeMouseWheel: false },
        scrollBeyondLastLine: false,
        folding: false,
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
        wordWrap: (wordWrap && 'on') || 'off',
        wrappingStrategy: (wordWrap && 'advanced') || undefined,
        fixedOverflowWidgets: true,
        renderLineHighlight: 'none',
        lineHeight: 18,
        padding: { top: 8 },
      }}
      loading={Loader}
    />
  );
}
