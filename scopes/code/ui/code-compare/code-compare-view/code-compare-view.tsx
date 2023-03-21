import React, { HTMLAttributes, useMemo, useRef, useState, ComponentType, useEffect } from 'react';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { DiffOnMount } from '@monaco-editor/react';
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
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
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

  const getDefaultView: () => EditorViewMode = () => {
    if (!baseId) return 'inline';
    if (baseId && compareId && baseId.isEqual(compareId)) return 'inline';
    if (!originalFileContent || !modifiedFileContent) return 'inline';
    return 'split';
  };

  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(false);
  const [view, setView] = useState<EditorViewMode>(getDefaultView());
  const [wrap, setWrap] = useState<boolean>(false);
  const language = useMemo(() => {
    if (!fileName) return languageOverrides.ts;
    const fileEnding = fileName?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [fileName]);

  useEffect(() => {
    const updatedView = getDefaultView();
    if (view !== updatedView) setView(updatedView);
  }, [baseId?.toString(), originalFileContent, modifiedFileContent]);

  const monacoRef = useRef<any>();

  const handleEditorDidMount: DiffOnMount = (_, monaco) => {
    /**
     * disable syntax check
     * ts cant validate all types because imported files aren't available to the editor
     */
    monacoRef.current = monaco;
    if (monacoRef.current) {
      monacoRef.current.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
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
      },
    });
    monaco.editor.setTheme('bit');
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

  return (
    <div
      key={`component-compare-code-view-${fileName}`}
      className={classNames(styles.componentCompareCodeViewContainer, className, loading && styles.loading)}
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
      <div className={classNames(styles.componentCompareCodeDiffEditorContainer, loading && styles.loading)}>
        {loading ? <CodeCompareViewLoader /> : diffEditor}
      </div>
    </div>
  );
}

export function CodeCompareViewLoader() {
  return <LineSkeleton className={styles.loader} count={50} />;
}
