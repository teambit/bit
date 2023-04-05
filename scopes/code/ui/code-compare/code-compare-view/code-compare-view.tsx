import React, { HTMLAttributes, useMemo, useRef, useState, ComponentType, useEffect } from 'react';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { DiffOnMount, Monaco } from '@monaco-editor/react';
import { FileIconSlot } from '@teambit/code';
import flatten from 'lodash.flatten';
import classNames from 'classnames';
import { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import {
  CodeCompareEditor,
  CodeCompareEditorSettings,
  CodeCompareNavigation,
  useCodeCompare,
  EditorViewMode,
} from '@teambit/code.ui.code-compare';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { useLaneCompareDrawer } from '@teambit/lanes.ui.compare.lane-compare-drawer';

import styles from './code-compare-view.module.scss';

export type CodeCompareViewProps = {
  fileName: string;
  files: string[];
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
  getHref: (node: { id: string }) => string;
  fileIconSlot?: FileIconSlot;
  widgets?: ComponentType<WidgetProps<any>>[];
} & HTMLAttributes<HTMLDivElement>;

// a translation list of specific monaco languages that are not the same as their file ending.
const languageOverrides = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mdx: 'markdown',
  md: 'markdown',
};

export function CodeCompareView({
  className,
  fileName,
  files,
  onTabClicked,
  getHref,
  fileIconSlot,
  widgets,
}: CodeCompareViewProps) {
  const { baseId, compareId, modifiedFileContent, originalFileContent, modifiedPath, originalPath, loading } =
    useCodeCompare({
      fileName,
    });
  const componentCompareContext = useComponentCompare();

  const getDefaultView: () => EditorViewMode = () => {
    if (!baseId) return 'inline';
    if (baseId && compareId && baseId.isEqual(compareId)) return 'inline';
    if (!originalFileContent || !modifiedFileContent) return 'inline';
    if (
      !componentCompareContext?.fileCompareDataByName?.get(fileName)?.status ||
      componentCompareContext?.fileCompareDataByName?.get(fileName)?.status === 'UNCHANGED'
    )
      return 'inline';

    return 'split';
  };

  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(false);
  const [view, setView] = useState<EditorViewMode>(getDefaultView());
  const [wrap, setWrap] = useState<boolean>(true);
  const language = useMemo(() => {
    if (!fileName) return languageOverrides.ts;
    const fileEnding = fileName?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [fileName]);
  const containerRef = useRef(null);
  const laneCompareDrawerContext = useLaneCompareDrawer();
  const isFullScreen = laneCompareDrawerContext.isFullScreen;

  useEffect(() => {
    const updatedView = getDefaultView();
    if (view !== updatedView) setView(updatedView);
  }, [baseId?.toString(), originalFileContent, modifiedFileContent]);

  const [containerHeight, setContainerHeight] = useState<string | undefined>(isFullScreen ? '100%' : undefined);

  const monacoRef = useRef<{
    editor: any;
    monaco: Monaco;
  }>();
  const changedLinesRef = useRef(0);

  const getDisplayedLineCount = (editorInstance, containerWidth) => {
    if (!monacoRef.current?.monaco) return 0;

    const model = editorInstance.getModel();

    if (!model) {
      return 0;
    }

    const lineCount = model.getLineCount();

    let displayedLines = view === 'inline' ? 0 : changedLinesRef.current * 1;

    const lineWidth = editorInstance.getOption(monacoRef.current.monaco.editor.EditorOption.wordWrapColumn);
    const fontWidthApproximation = 8;

    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
      const line = model.getLineContent(lineNumber);
      const length = line.length || 1;
      const lineFitsContainer = length * fontWidthApproximation <= containerWidth;
      const wrappedLineCount = (lineFitsContainer ? 1 : Math.ceil(length / lineWidth)) || 1;
      displayedLines += wrappedLineCount;
    }

    return displayedLines;
  };
  const updateAddedLines = () => {
    if (!monacoRef.current) return;

    const modifiedEditor = monacoRef.current.editor.getModifiedEditor();
    const modifiedModel = modifiedEditor.getModel();
    const modifiedValue = modifiedModel.getValue();

    if (!modifiedValue) {
      changedLinesRef.current = 0;
      return;
    }

    const diffResult = monacoRef.current.editor.getLineChanges() ?? [];

    let addedLines = 0;
    diffResult.forEach((change) => {
      if (change.modifiedEndLineNumber !== 0) {
        addedLines += change.modifiedEndLineNumber - change.modifiedStartLineNumber;
      }
    });

    changedLinesRef.current = addedLines * 2;
  };

  const updateEditorHeight = () => {
    if (isFullScreen) return `100%`;
    if (!monacoRef.current?.monaco) return undefined;

    const originalEditor = monacoRef.current.editor.getOriginalEditor();
    const modifiedEditor = monacoRef.current.editor.getModifiedEditor();

    const lineHeight = originalEditor.getOption(monacoRef.current.monaco.editor.EditorOption.lineHeight);

    const originalModel = originalEditor.getModel();
    const modifiedModel = modifiedEditor.getModel();

    if (!originalModel || !modifiedModel) {
      return undefined;
    }

    updateAddedLines();

    const paddingTop = originalEditor.getOption(monacoRef.current.monaco.editor.EditorOption.padding)?.top || 0;
    const paddingBottom = originalEditor.getOption(monacoRef.current.monaco.editor.EditorOption.padding)?.bottom || 0;
    const glyphMargin = originalEditor.getOption(monacoRef.current.monaco.editor.EditorOption.glyphMargin);
    const lineNumbers = originalEditor.getOption(monacoRef.current.monaco.editor.EditorOption.lineNumbers);

    const glyphMarginHeight = glyphMargin ? lineHeight : 0;
    const lineNumbersHeight = lineNumbers.renderType !== 0 ? lineHeight : 0;

    const originalContainerWidth = originalEditor.getLayoutInfo().contentWidth;
    const modifiedContainerWidth = modifiedEditor.getLayoutInfo().contentWidth;

    const originalDisplayedLines = getDisplayedLineCount(originalEditor, originalContainerWidth);
    const modifiedDisplayedLines = getDisplayedLineCount(modifiedEditor, modifiedContainerWidth);

    const originalContentHeight =
      originalDisplayedLines * lineHeight + paddingTop + paddingBottom + glyphMarginHeight + lineNumbersHeight;
    const modifiedContentHeight =
      modifiedDisplayedLines * lineHeight + paddingTop + paddingBottom + glyphMarginHeight + lineNumbersHeight;

    const maxHeight = Math.max(Math.max(originalContentHeight, modifiedContentHeight), 250);

    const originalDomNode = originalEditor.getDomNode()?.parentElement;
    const modifiedDomNode = modifiedEditor.getDomNode()?.parentElement;

    if (!originalDomNode || !modifiedDomNode) {
      return undefined;
    }

    modifiedDomNode.style.height = `${maxHeight}px`;
    monacoRef.current.editor.layout();
    setContainerHeight(() => `${maxHeight}px`);
    return undefined;
  };

  useEffect(() => {
    if (containerHeight !== '100%' && isFullScreen) {
      setContainerHeight('100%');
    }
    if (!isFullScreen && containerHeight === '100%') {
      updateEditorHeight();
    }
  }, [isFullScreen, laneCompareDrawerContext]);

  const handleEditorDidMount: DiffOnMount = (editor, monaco) => {
    /**
     * disable syntax check
     * ts cant validate all types because imported files aren't available to the editor
     */
    monacoRef.current = { monaco, editor };
    if (monacoRef.current) {
      monacoRef.current.monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
    }

    monaco.editor.defineTheme('bit', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'scrollbar.shadow': '#222222',
        'diffEditor.insertedTextBackground': '#1C4D2D',
        'diffEditor.removedTextBackground': '#761E24',
        'editor.selectionBackground': '#5A5A5A',
        'editor.overviewRulerBorder': '#6a57fd',
        'editor.lineHighlightBorder': '#6a57fd',
      },
    });
    monaco.editor.setTheme('bit');
    editor.getOriginalEditor().onDidChangeModelDecorations(updateEditorHeight);
    editor.getModifiedEditor().onDidChangeModelDecorations(updateEditorHeight);
    const containerElement = containerRef.current;
    let resizeObserver: ResizeObserver | undefined;

    if (containerElement) {
      resizeObserver = new ResizeObserver(() => {
        updateEditorHeight();
      });
      resizeObserver.observe(containerElement);
    }

    return () => containerElement && resizeObserver?.unobserve(containerElement);
  };

  const diffEditor = useMemo(
    () => (
      <CodeCompareEditor
        language={language}
        modifiedPath={modifiedPath}
        originalPath={originalPath}
        originalFileContent={originalFileContent}
        modifiedFileContent={modifiedFileContent}
        handleEditorDidMount={handleEditorDidMount}
        ignoreWhitespace={ignoreWhitespace}
        editorViewMode={view}
        wordWrap={wrap}
        Loader={<CodeCompareViewLoader />}
      />
    ),
    [modifiedFileContent, originalFileContent, ignoreWhitespace, view, wrap]
  );

  const containerHeightStyle = isFullScreen
    ? '100%'
    : (!!containerHeight && `calc(${containerHeight} + 30px)`) || '250px';

  const codeContainerHeightStyle = isFullScreen ? 'calc(100% - 30px)' : containerHeight ?? '220px';

  return (
    <div
      ref={containerRef}
      key={`component-compare-code-view-${fileName}`}
      style={{
        minHeight: containerHeightStyle,
        maxHeight: containerHeightStyle,
        height: containerHeightStyle,
      }}
      className={classNames(
        styles.componentCompareCodeViewContainer,
        className,
        loading && styles.loading,
        isFullScreen && styles.isFullScreen
      )}
    >
      <CodeCompareNavigation
        files={files}
        selectedFile={fileName}
        fileIconMatchers={fileIconMatchers}
        onTabClicked={onTabClicked}
        getHref={getHref}
        widgets={widgets}
        Menu={
          <CodeCompareEditorSettings
            wordWrap={wrap}
            ignoreWhitespace={ignoreWhitespace}
            editorViewMode={view}
            onViewModeChanged={(value) => setView(value)}
            onWordWrapChanged={(value) => setWrap(value)}
            onIgnoreWhitespaceChanged={(value) => setIgnoreWhitespace(value)}
          />
        }
      />
      <div
        style={{
          minHeight: codeContainerHeightStyle,
          maxHeight: codeContainerHeightStyle,
          height: codeContainerHeightStyle,
        }}
        className={classNames(
          styles.componentCompareCodeDiffEditorContainer,
          loading && styles.loading,
          isFullScreen && styles.isFullScreen
        )}
      >
        <CodeCompareViewLoader
          className={classNames(!loading && styles.hideLoader, isFullScreen && styles.isFullScreen)}
        />
        {loading ? null : diffEditor}
      </div>
    </div>
  );
}

export function CodeCompareViewLoader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <LineSkeleton {...rest} className={classNames(styles.loader, className)} count={50} />;
}
