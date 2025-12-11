import type { HTMLAttributes, ComponentType } from 'react';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import type { DiffOnMount, Monaco } from '@monaco-editor/react';
import type { FileIconSlot } from '@teambit/code';
import flatten from 'lodash.flatten';
import classNames from 'classnames';
import type { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import type { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { CodeCompareEditor, useCodeCompareEditor } from '../code-compare-editor';
import type { EditorViewMode } from '../code-compare-editor-settings';
import { CodeCompareEditorSettings } from '../code-compare-editor-settings';
import { CodeCompareNavigation } from '../code-compare-navigation';
import { useCodeCompare } from '../use-code-compare';

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
const languageOverrides: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mdx: 'markdown',
  md: 'markdown',
  vue: 'html',
};

export function CodeCompareViewLoader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <LineSkeleton {...rest} className={classNames(styles.loader, className)} count={50} />;
}

export function CodeCompareView({
  className,
  fileName,
  files,
  onTabClicked,
  getHref,
  fileIconSlot,
  widgets,
}: CodeCompareViewProps) {
  const monacoRef = useRef<{
    editor?: any;
    monaco?: Monaco;
  }>();
  const {
    baseId,
    compareId,
    modifiedFileContent,
    originalFileContent,
    modifiedPath,
    originalPath,
    loading: loadingData,
  } = useCodeCompare({
    fileName,
  });

  const componentCompareContext = useComponentCompare();
  const DiffEditor = useCodeCompareEditor();
  const [loading, setLoading] = useState<boolean>(Boolean(loadingData));
  const [isDiffComputed, setIsDiffComputed] = useState<boolean>(false);

  useEffect(() => {
    if (loading !== loadingData) {
      setLoading(Boolean(loadingData));
    }
    if (isDiffComputed && loadingData) setIsDiffComputed(false);
  }, [loadingData]);

  const getDefaultView: () => EditorViewMode = () => {
    if (!baseId) return 'inline';
    if (baseId && compareId && baseId.isEqual(compareId)) return 'inline';
    if (!originalFileContent || !modifiedFileContent) return 'inline';
    if (componentCompareContext?.fileCompareDataByName?.get(fileName)?.status === 'UNCHANGED') return 'inline';
    return 'split';
  };

  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);

  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(false);
  const [view, setView] = useState<EditorViewMode>(getDefaultView());
  const [wrap, setWrap] = useState<boolean>(true);
  const [diffOnly, setDiffOnly] = useState<boolean>(true);

  const language = useMemo(() => {
    if (!fileName) return languageOverrides.ts;
    const fileEnding = fileName?.split('.').pop() ?? '';
    return languageOverrides[fileEnding] || fileEnding;
  }, [fileName]);
  const containerRef = useRef(null);
  const isFullScreen = !!componentCompareContext?.isFullScreen;

  useEffect(() => {
    const updatedView = getDefaultView();
    if (view !== updatedView) setView(updatedView);
  }, [
    baseId?.toString(),
    originalFileContent,
    modifiedFileContent,
    componentCompareContext?.fileCompareDataByName?.size,
    compareId?.toString(),
  ]);

  const [containerHeight, setContainerHeight] = useState<string | undefined>(isFullScreen ? '100%' : undefined);

  const getEditorHeight = (editorInstance: any) => {
    if (!monacoRef.current?.monaco) return 0;

    const model = editorInstance.getModel();

    if (!model) return 0;

    const lineHeight = editorInstance.getOption(monacoRef.current.monaco.editor.EditorOption.lineHeight);
    const lineCount = editorInstance.getModel()?.getLineCount() || 1;
    const height = editorInstance.getTopForLineNumber(lineCount + 1) + lineHeight;

    return height;
  };

  const updateEditorHeight = () => {
    if (isFullScreen) return;
    if (!monacoRef.current?.monaco) return;

    const originalEditor = monacoRef.current.editor.getOriginalEditor();
    const modifiedEditor = monacoRef.current.editor.getModifiedEditor();

    const originalModel = originalEditor.getModel();
    const modifiedModel = modifiedEditor.getModel();

    if (!originalModel || !modifiedModel) {
      return;
    }

    const diffResult = monacoRef.current.editor.getLineChanges() ?? [];

    const originalContentHeight = getEditorHeight(originalEditor);
    const modifiedContentHeight = getEditorHeight(modifiedEditor);

    if (!originalContentHeight && !modifiedContentHeight) return;

    const maxHeight =
      Math.max(Math.max(originalContentHeight, modifiedContentHeight), 250) + (diffResult.length > 0 ? 24 : 0);

    const originalDomNode = originalEditor.getDomNode()?.parentElement;
    const modifiedDomNode = modifiedEditor.getDomNode()?.parentElement;

    if (!originalDomNode || !modifiedDomNode) {
      return;
    }

    modifiedDomNode.style.height = `${maxHeight}px`;
    monacoRef.current.editor.layout();
    setContainerHeight(() => `${maxHeight}px`);
  };

  useEffect(() => {
    if (!monacoRef.current?.editor) return;
    const modifiedEditor = monacoRef.current?.editor.getModifiedEditor();

    if (!modifiedEditor) return;

    const modifiedDomNode = modifiedEditor.getDomNode()?.parentElement;

    if (!modifiedDomNode) return;

    const modifiedDomNodeHeight = modifiedDomNode?.style.height;

    if (modifiedDomNodeHeight !== containerHeight) {
      modifiedDomNode.style.height = containerHeight;
      monacoRef.current?.editor.layout();
    }
  }, [containerHeight]);

  useEffect(() => {
    if (containerHeight !== '100%' && isFullScreen) {
      setContainerHeight('100%');
    }
    if (!isFullScreen && containerHeight === '100%') {
      updateEditorHeight();
    }
  }, [isFullScreen, componentCompareContext]);

  const handleEditorDidMount: DiffOnMount = React.useCallback(
    (editor, monaco) => {
      /**
       * disable syntax check
       * ts cant validate all types because imported files aren't available to the editor
       */
      monacoRef.current = { monaco, editor };
      if (monacoRef.current) {
        monacoRef.current?.monaco?.languages?.typescript?.typescriptDefaults?.setDiagnosticsOptions({
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

      if (!originalFileContent || !modifiedFileContent) {
        setIsDiffComputed(() => {
          updateEditorHeight();
          return true;
        });
      }

      editor.onDidUpdateDiff(() => {
        setIsDiffComputed(() => {
          updateEditorHeight();
          return true;
        });
      });

      editor.getModifiedEditor().onDidContentSizeChange(() => {
        const originalFileIsEmpty = editor.getOriginalEditor().getModel()?.getLineCount() === 1;
        const modifiedFileIsEmpty = editor.getModifiedEditor().getModel()?.getLineCount() === 1;
        const hasDiff = (monacoRef.current?.editor.getLineChanges() ?? []).length > 0;

        if (originalFileIsEmpty || modifiedFileIsEmpty) {
          updateEditorHeight();
        }

        if (isDiffComputed) {
          updateEditorHeight();
        }

        if (!isDiffComputed && hasDiff) {
          setTimeout(() => {
            setIsDiffComputed(() => {
              updateEditorHeight();
              return true;
            });
          }, 150);
        }
      });
    },
    [fileName, view, compareId?.toString(), componentCompareContext?.hidden, loading, files.length]
  );

  const diffEditor = useMemo(
    () => (
      <CodeCompareEditor
        DiffEditor={DiffEditor}
        language={language}
        modifiedPath={`${modifiedPath}${componentCompareContext?.compare?.hasLocalChanges ? '-local' : ''}`}
        originalPath={originalPath}
        originalFileContent={originalFileContent}
        modifiedFileContent={modifiedFileContent}
        handleEditorDidMount={handleEditorDidMount}
        ignoreWhitespace={ignoreWhitespace}
        editorViewMode={view}
        wordWrap={wrap}
        diffOnly={diffOnly}
        Loader={<CodeCompareViewLoader />}
      />
    ),
    [
      modifiedFileContent,
      originalFileContent,
      ignoreWhitespace,
      view,
      wrap,
      fileName,
      loading,
      files.length,
      modifiedPath,
      originalPath,
      language,
      compareId?.toString(),
      baseId?.toString(),
      DiffEditor,
      diffOnly,
    ]
  );

  const containerHeightStyle = isFullScreen
    ? '100%'
    : (!!containerHeight && `calc(${containerHeight} + 30px)`) || '250px';

  const codeContainerHeightStyle = isFullScreen ? 'calc(100% - 30px)' : (containerHeight ?? '220px');
  const fileCompareDataByName = componentCompareContext?.fileCompareDataByName;
  const codeNavFiles = React.useMemo(() => {
    return files.filter((file) => {
      if (file === fileName) return true;
      const codeCompareDataForFile = fileCompareDataByName?.get(file) ?? null;
      const status = codeCompareDataForFile?.status;
      if (componentCompareContext?.compare && !componentCompareContext.base && !status) return true;
      if (status && status !== 'UNCHANGED') return true;
      return false;
    });
  }, [files.length, fileName, fileCompareDataByName?.size]);

  const hideLoader = !loading && files.length > 0 && !!containerHeight && isDiffComputed;

  return (
    <div
      ref={containerRef}
      key={`component-compare-code-view-${fileName}`}
      style={{
        minHeight: containerHeightStyle,
        maxHeight: containerHeightStyle,
        height: containerHeightStyle,
      }}
      className={classNames(styles.componentCompareCodeViewContainer, className, isFullScreen && styles.isFullScreen)}
    >
      {files.length > 0 && (
        <CodeCompareNavigation
          files={codeNavFiles}
          selectedFile={fileName}
          fileIconMatchers={fileIconMatchers}
          onTabClicked={(id, event) => {
            if (id !== fileName) setIsDiffComputed(false);
            onTabClicked?.(id, event);
          }}
          getHref={getHref}
          widgets={widgets}
          Menu={
            <CodeCompareEditorSettings
              wordWrap={wrap}
              diffOnly={diffOnly}
              onDiffOnlyChanged={(value) => setDiffOnly(value)}
              ignoreWhitespace={ignoreWhitespace}
              editorViewMode={view}
              onViewModeChanged={(value) => setView(value)}
              onWordWrapChanged={(value) => setWrap(value)}
              onIgnoreWhitespaceChanged={(value) => setIgnoreWhitespace(value)}
            />
          }
        />
      )}
      <div
        style={{
          minHeight: codeContainerHeightStyle,
          maxHeight: codeContainerHeightStyle,
          height: codeContainerHeightStyle,
        }}
        className={classNames(
          styles.componentCompareCodeDiffEditorContainer,
          !hideLoader && styles.loading,
          isFullScreen && styles.isFullScreen
        )}
      >
        <CodeCompareViewLoader
          className={classNames(
            hideLoader && styles.hideLoader,
            isFullScreen && styles.isFullScreen,
            styles.fullHeight
          )}
        />
        {loading ? null : diffEditor}
      </div>
    </div>
  );
}
