import React from 'react';
import { DiffViewer } from '@teambit/code.ui.diff-viewer';
import type { EditorSettingsState } from '../code-compare-editor-settings';

export type CodeCompareEditorProps = {
  language: string;
  handleEditorDidMount?: (...args: any[]) => void;
  Loader: React.ReactNode;
  modifiedFileContent?: string;
  originalFileContent?: string;
  originalPath: string;
  modifiedPath: string;
  DiffEditor?: React.ComponentType<any> | null;
  fullScreen?: boolean;
} & EditorSettingsState;

export function CodeCompareEditor({
  modifiedFileContent,
  originalFileContent,
  originalPath,
  modifiedPath,
  language,
  ignoreWhitespace,
  wordWrap,
  diffOnly,
  editorViewMode,
  fullScreen,
}: CodeCompareEditorProps) {
  const normalizeWhitespace = (content = '') =>
    ignoreWhitespace
      ? content
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n')
      : content;

  return (
    <DiffViewer
      key={`${originalPath}-${modifiedPath}-${editorViewMode}`}
      fileName={modifiedPath || originalPath}
      oldContent={normalizeWhitespace(originalFileContent)}
      newContent={normalizeWhitespace(modifiedFileContent)}
      language={language}
      view={editorViewMode === 'inline' ? 'unified' : 'split'}
      contextLines={diffOnly ? 3 : Number.MAX_SAFE_INTEGER}
      maxHeight={fullScreen ? 2000 : 640}
      showHeader={false}
      showViewToggle={false}
      collapsible={false}
      wrap={wordWrap}
    />
  );
}
