import React, { useEffect, useRef, useState } from 'react';
import { DiffViewer } from '@teambit/code.ui.diff-viewer';
import type { EditorSettingsState } from '../code-compare-editor-settings';

export type CodeCompareEditorProps = {
  language?: string;
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
/** above this many lines, an inline diff virtualizes inside a capped pane instead of growing the page. */
const LARGE_FILE_LINES = 1000;

function lineCount(content?: string): number {
  if (!content) return 0;
  let count = 1;
  for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) count++;
  return count;
}
const MIN_FULLSCREEN_DIFF_HEIGHT = 220;
/** the diff viewer's own top and bottom border. */
const DIFF_VIEWER_BORDERS = 2;

/** the content height of the container the diff fills, without its padding. */
function containerContentHeight(container: HTMLElement): number {
  const style = window.getComputedStyle(container);
  return container.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0');
}

/**
 * In fullscreen the diff fills its container, and the windowing uses this height as its viewport. So it
 * is measured, not guessed: a fixed allowance for the chrome above was wrong whenever the chrome was
 * taller, and the bottom rows of the file could not be scrolled into view.
 */
function useDiffHeight(fullScreen: boolean | undefined, anchorRef: React.RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState(REGULAR_DIFF_HEIGHT);

  useEffect(() => {
    if (!fullScreen) {
      setHeight(REGULAR_DIFF_HEIGHT);
      return undefined;
    }
    const container = anchorRef.current?.parentElement;
    if (!container) return undefined;

    const updateHeight = () =>
      setHeight(Math.max(MIN_FULLSCREEN_DIFF_HEIGHT, containerContentHeight(container) - DIFF_VIEWER_BORDERS));
    updateHeight();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHeight) : undefined;
    observer?.observe(container);
    window.addEventListener('resize', updateHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [fullScreen, anchorRef]);

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
  // a box-less anchor (`display: contents`): the diff stays a direct layout child of its container,
  // and the anchor's parent is that container, which useDiffHeight measures.
  const anchorRef = useRef<HTMLDivElement>(null);
  const maxHeight = useDiffHeight(fullScreen, anchorRef);
  const isLargeFile =
    Math.max(lineCount(originalFileContent), lineCount(modifiedFileContent)) > LARGE_FILE_LINES;
  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      <DiffViewer
        key={`${originalPath}-${modifiedPath}-${editorViewMode}`}
        fileName={modifiedPath || originalPath}
        oldContent={originalFileContent || ''}
        newContent={modifiedFileContent || ''}
        ignoreTrimWhitespace={ignoreWhitespace}
        language={language}
        view={editorViewMode === 'inline' ? 'unified' : 'split'}
        contextLines={diffOnly ? 3 : Number.MAX_SAFE_INTEGER}
        maxHeight={maxHeight}
        // Inline (in a drawer/stacked list) the file has to size to its own content and scroll with the
        // page: a fixed inner viewport gave every file the same height no matter how much it changed,
        // so a two-line diff and a thousand-line one looked identical. Fullscreen is the opposite case —
        // there the diff owns the viewport, so it keeps the capped height and scrolls (and virtualizes)
        // internally. Carried over from Monaco, which always rendered into a fixed-height editor.
        // A large file virtualizes inline too: rendering thousands of highlighted rows at once (e.g. an
        // unchanged file shown in full) is slow, and a page that long is hard to use.
        virtualize={fullScreen || isLargeFile}
        showHeader={false}
        showViewToggle={false}
        collapsible={false}
        // Soft wrap makes rows variable-height, which turns windowing off and mounts every row. A large
        // file keeps fixed-height rows (long lines scroll sideways) so only the visible rows render.
        wrap={wordWrap && !isLargeFile}
      />
    </div>
  );
}
