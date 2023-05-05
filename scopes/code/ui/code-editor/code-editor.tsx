import React from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';

export type CodeEditorProps = {
  language: string;
  handleEditorDidMount: OnMount;
  Loader: React.ReactNode;
  fileContent?: string;
  originalFileContent?: string;
  filePath?: string;
};

export function CodeEditor({ fileContent, filePath, language, handleEditorDidMount, Loader }: CodeEditorProps) {
  return (
    <Editor
      path={filePath}
      value={fileContent || undefined}
      language={language}
      height={'100%'}
      onMount={handleEditorDidMount}
      className={darkMode}
      theme={'vs-dark'}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        scrollbar: { alwaysConsumeMouseWheel: true, vertical: 'auto' },
        scrollBeyondLastLine: false,
        folding: false,
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
        wordWrap: 'off',
        wrappingStrategy: 'undefined',
        fixedOverflowWidgets: true,
        renderLineHighlight: 'none',
        lineHeight: 20,
        padding: { top: 8 },
        hover: { enabled: false },
        cursorBlinking: 'smooth',
      }}
      loading={Loader}
    />
  );
}
