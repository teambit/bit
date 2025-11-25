import React from 'react';
import type { DiffEditorProps, DiffOnMount } from '@monaco-editor/react';
import { loader } from '@monaco-editor/react';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import type { EditorSettingsState } from '../code-compare-editor-settings';

loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.48.0/min/vs' } });

export type CodeCompareEditorProps = {
  language: string;
  handleEditorDidMount: DiffOnMount;
  Loader: React.ReactNode;
  modifiedFileContent?: string;
  originalFileContent?: string;
  originalPath: string;
  modifiedPath: string;
  DiffEditor: React.FC<DiffEditorProps>;
  fullScreen?: boolean;
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
  diffOnly,
  editorViewMode,
  Loader,
  DiffEditor,
  fullScreen,
}: CodeCompareEditorProps) {
  return (
    <React.Suspense fallback={Loader ?? <></>}>
      <DiffEditor
        // need to force re-render when the editor view mode changes
        key={`${originalPath}-${modifiedPath}-${editorViewMode}`}
        modified={modifiedFileContent || undefined}
        original={originalFileContent || undefined}
        language={language}
        originalModelPath={originalPath}
        modifiedModelPath={modifiedPath}
        onMount={handleEditorDidMount}
        className={darkMode}
        theme="vs-dark"
        options={
          {
            ignoreTrimWhitespace: ignoreWhitespace,
            useInlineViewWhenSpaceIsLimited: false,
            readOnly: true,
            renderSideBySide: editorViewMode === 'split',
            minimap: { enabled: false },
            scrollbar: {
              alwaysConsumeMouseWheel: !wordWrap,
              vertical: fullScreen ? 'auto' : 'hidden',
              horizontal: 'hidden',
            },
            hideUnchangedRegions: {
              enabled: diffOnly,
              revealLineCount: 20,
              contextLineCount: 2,
              minimumLineCount: 5,
            },
            renderOverviewRuler: fullScreen,
            scrollBeyondLastLine: false,
            folding: false,
            overviewRulerLanes: 0,
            automaticLayout: true,
            overviewRulerBorder: false,
            diffWordWrap: (wordWrap && 'on') || 'off',
            wordWrap: (wordWrap && 'on') || 'off',
            wrappingStrategy: (wordWrap && 'advanced') || undefined,
            fixedOverflowWidgets: true,
            renderLineHighlight: 'none',
            lineHeight: 20,
            padding: { top: 8 },
            hover: { enabled: false },
            cursorBlinking: 'smooth',
          } as any
        }
        loading={Loader}
      />
    </React.Suspense>
  );
}
