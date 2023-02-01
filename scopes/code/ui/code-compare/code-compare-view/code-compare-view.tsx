import React, { HTMLAttributes, useMemo, useState, ComponentType } from 'react';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
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
  const { baseId, modifiedFileContent, originalFileContent, modifiedPath, originalPath, loading } = useCodeCompare({
    fileName,
  });

  const defaultView: EditorViewMode = useMemo(() => {
    if (!baseId) return 'inline';
    return 'split';
  }, [baseId?.toString()]);

  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(false);
  const [view, setView] = useState<EditorViewMode>(defaultView);
  const [wrap, setWrap] = useState<boolean>(false);
  const language = useMemo(() => {
    if (!fileName) return languageOverrides.ts;
    const fileEnding = fileName?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [fileName]);

  const diffEditor = useMemo(
    () => (
      <CodeCompareEditor
        language={language}
        modifiedPath={modifiedPath}
        originalPath={originalPath}
        originalFileContent={originalFileContent}
        modifiedFileContent={modifiedFileContent}
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
