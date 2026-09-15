import React, { useEffect, useState } from 'react';
import { DiffViewer } from '@teambit/code.ui.diff-viewer';
import type { EditorSettingsState } from '../code-compare-editor-settings';
import { normalizeWhitespace } from './normalize-whitespace';

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

const REGULAR_DIFF_HEIGHT = 640;
const FULLSCREEN_CHROME_HEIGHT = 160;
const MIN_FULLSCREEN_DIFF_HEIGHT = 220;

function useDiffHeight(fullScreen?: boolean) {
  const [height, setHeight] = useState(REGULAR_DIFF_HEIGHT);

  useEffect(() => {
    if (!fullScreen) {
      setHeight(REGULAR_DIFF_HEIGHT);
      return undefined;
    }

    const updateHeight = () =>
      setHeight(Math.max(MIN_FULLSCREEN_DIFF_HEIGHT, window.innerHeight - FULLSCREEN_CHROME_HEIGHT));
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [fullScreen]);

  return height;
}

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
  const maxHeight = useDiffHeight(fullScreen);
  return (
    <DiffViewer
      key={`${originalPath}-${modifiedPath}-${editorViewMode}`}
      fileName={modifiedPath || originalPath}
      oldContent={normalizeWhitespace(originalFileContent, ignoreWhitespace)}
      newContent={normalizeWhitespace(modifiedFileContent, ignoreWhitespace)}
      language={language}
      view={editorViewMode === 'inline' ? 'unified' : 'split'}
      contextLines={diffOnly ? 3 : Number.MAX_SAFE_INTEGER}
      maxHeight={maxHeight}
      showHeader={false}
      showViewToggle={false}
      collapsible={false}
      wrap={wordWrap}
    />
  );
}
