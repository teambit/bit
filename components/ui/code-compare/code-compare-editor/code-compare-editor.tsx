import React from 'react';
import { DiffEditorProps, DiffOnMount } from '@monaco-editor/react';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import { EditorSettingsState } from '../code-compare-editor-settings';

export type CodeCompareEditorProps = {
  language: string;
  handleEditorDidMount: DiffOnMount;
  Loader: React.ReactNode;
  modifiedFileContent?: string;
  originalFileContent?: string;
  originalPath: string;
  modifiedPath: string;
  DiffEditor: React.FC<DiffEditorProps>;
} & EditorSettingsState;

export function CodeCompareEditor({
  modifiedFileContent,
  originalFileContent,
  originalPath,
  modifiedPath,
  language,
  handleEditorDidMount,
  ignoreWhitespace,
  wordWrap,
  editorViewMode,
  Loader,
  DiffEditor,
}: CodeCompareEditorProps) {
  return (
    <React.Suspense fallback={Loader ?? <></>}>
      <DiffEditor
        modified={modifiedFileContent || undefined}
        original={originalFileContent || undefined}
        language={language}
        originalModelPath={originalPath}
        modifiedModelPath={modifiedPath}
        height="100%"
        onMount={handleEditorDidMount}
        className={darkMode}
        theme="vs-dark"
        options={{
          ignoreTrimWhitespace: ignoreWhitespace,
          readOnly: true,
          renderSideBySide: editorViewMode === 'split',
          minimap: { enabled: false },
          scrollbar: { alwaysConsumeMouseWheel: !wordWrap, vertical: 'auto' },
          scrollBeyondLastLine: false,
          folding: false,
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          wordWrap: (wordWrap && 'on') || 'off',
          wrappingStrategy: (wordWrap && 'advanced') || undefined,
          fixedOverflowWidgets: true,
          renderLineHighlight: 'none',
          lineHeight: 20,
          padding: { top: 8 },
          hover: { enabled: false },
          cursorBlinking: 'smooth',
        }}
        loading={Loader}
      />
    </React.Suspense>
  );
}
