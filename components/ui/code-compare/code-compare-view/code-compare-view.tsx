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

  // The status alone is not enough: it is missing when the compare data is not there, e.g. when a
  // version is compared with itself and Bit skips the compare query. Identical contents on both
  // sides mean the same thing.
  const isUnchanged =
    fileStatus === 'UNCHANGED' || (originalFileContent !== undefined && originalFileContent === modifiedFileContent);

  let defaultView: EditorViewMode = 'split';
  if (
    !baseId ||
    (compareId && baseId.isEqual(compareId)) ||
    !originalFileContent ||
    !modifiedFileContent ||
    isUnchanged
  ) {
    defaultView = 'inline';
  }

  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [diffOnly, setDiffOnly] = useState(true);

  // The view follows `defaultView` until the reader picks one, and that pick holds only for the file
  // and versions it was made on. It is derived on render: copying `defaultView` into state from an
  // effect painted one frame in the loading-time view (unified) before switching to split.
  const viewKey = `${fileName}|${baseIdString}|${compareIdString}`;
  const [chosenView, setChosenView] = useState<{ key: string; view: EditorViewMode }>();
  const view = chosenView?.key === viewKey ? chosenView.view : defaultView;
  const setView = (next: EditorViewMode) => setChosenView({ key: viewKey, view: next });

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
    // No key on fileName here: it remounted the file tabs on every file switch, so they re-measured and
    // reloaded their icons and the whole bar flashed. Only the editor below is keyed per file.
    <div
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
            // a new file starts with fresh expand and scroll state
            key={`${originalPath}|${modifiedPath}`}
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
            // as a broken view. The file tree only surfaces an unchanged file when it is explicitly
            // selected, so that is exactly when the reader wants to see it.
            diffOnly={diffOnly && !isUnchanged}
            Loader={<CodeCompareViewLoader />}
            fullScreen={isFullScreen}
          />
        )}
      </div>
    </div>
  );
}
