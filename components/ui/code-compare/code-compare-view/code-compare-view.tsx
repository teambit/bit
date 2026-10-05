import type { HTMLAttributes, ComponentType } from 'react';
import React, { useMemo, useState } from 'react';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import type { FileIconSlot } from '@teambit/code';
import flatten from 'lodash.flatten';
import classNames from 'classnames';
import type { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { langFromFileName } from '@teambit/code.ui.diff-viewer';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import type { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { CodeCompareEditor } from '../code-compare-editor';
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
  const { baseId, compareId, modifiedFileContent, originalFileContent, modifiedPath, originalPath, loading } =
    useCodeCompare({ fileName });

  const componentCompareContext = useComponentCompare();
  const fileCompareDataByName = componentCompareContext?.fileCompareDataByName;
  const fileStatus = fileCompareDataByName?.get(fileName)?.status;
  const baseIdString = baseId?.toString();
  const compareIdString = compareId?.toString();

  let defaultView: EditorViewMode = 'split';
  if (
    !baseId ||
    (compareId && baseId.isEqual(compareId)) ||
    !originalFileContent ||
    !modifiedFileContent ||
    fileStatus === 'UNCHANGED'
  ) {
    defaultView = 'inline';
  }

  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [view, setView] = useState<EditorViewMode>(defaultView);
  const [wrap, setWrap] = useState(true);
  const [diffOnly, setDiffOnly] = useState(true);

  React.useEffect(() => {
    setView(defaultView);
  }, [defaultView, fileName, baseIdString, compareIdString, originalFileContent, modifiedFileContent, fileStatus]);

  const codeNavFiles = useMemo(() => {
    return files.filter((file) => {
      if (file === fileName) return true;
      const status = fileCompareDataByName?.get(file)?.status;
      if (componentCompareContext?.compare && !componentCompareContext.base && !status) return true;
      return Boolean(status && status !== 'UNCHANGED');
    });
  }, [files, fileName, fileCompareDataByName, componentCompareContext?.compare, componentCompareContext?.base]);

  const isFullScreen = Boolean(componentCompareContext?.isFullScreen);

  return (
    <div
      key={`component-compare-code-view-${fileName}`}
      className={classNames(styles.componentCompareCodeViewContainer, className, isFullScreen && styles.isFullScreen)}
    >
      {files.length > 0 && (
        <CodeCompareNavigation
          files={codeNavFiles}
          selectedFile={fileName}
          fileIconMatchers={fileIconMatchers}
          onTabClicked={onTabClicked}
          getHref={getHref}
          widgets={widgets}
          Menu={
            <CodeCompareEditorSettings
              wordWrap={wrap}
              diffOnly={diffOnly}
              onDiffOnlyChanged={setDiffOnly}
              ignoreWhitespace={ignoreWhitespace}
              editorViewMode={view}
              onViewModeChanged={setView}
              onWordWrapChanged={setWrap}
              onIgnoreWhitespaceChanged={setIgnoreWhitespace}
            />
          }
        />
      )}
      <div
        className={classNames(
          styles.componentCompareCodeDiffEditorContainer,
          loading && styles.loading,
          isFullScreen && styles.isFullScreen
        )}
      >
        {loading ? (
          <CodeCompareViewLoader className={classNames(isFullScreen && styles.isFullScreen, styles.fullHeight)} />
        ) : (
          <CodeCompareEditor
            language={langFromFileName(fileName)}
            modifiedPath={modifiedPath}
            originalPath={originalPath}
            originalFileContent={originalFileContent}
            modifiedFileContent={modifiedFileContent}
            ignoreWhitespace={ignoreWhitespace}
            editorViewMode={view}
            wordWrap={wrap}
            // A file with no changes has nothing to collapse *toward*: diff-only would hide 100% of
            // it and leave a pane containing only an "Expand N unchanged lines" button, which reads
            // as a broken view. The file tree only surfaces an UNCHANGED file when it is explicitly
            // selected, so that is exactly when the reader wants to see it.
            diffOnly={diffOnly && fileStatus !== 'UNCHANGED'}
            Loader={<CodeCompareViewLoader />}
            fullScreen={isFullScreen}
          />
        )}
      </div>
    </div>
  );
}
