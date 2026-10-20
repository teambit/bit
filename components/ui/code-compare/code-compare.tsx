import type { HTMLAttributes } from 'react';
import React, { useState, useMemo } from 'react';
import { uniq } from 'lodash';
import classNames from 'classnames';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import type { FileIconSlot } from '@teambit/code';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import {
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
import { useLocation } from '@teambit/base-react.navigation.link';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { CodeCompareTree } from './code-compare-tree';
import type { CodeCompareViewProps } from './code-compare-view';
import { CodeCompareView, CodeCompareViewLoader } from './code-compare-view';
import { Widget } from './code-compare.widgets';

import styles from './code-compare.module.scss';

const DEFAULT_FILE = 'index.ts';

export type CodeCompareProps = {
  fileIconSlot?: FileIconSlot;
  CodeView?: React.ComponentType<CodeCompareViewProps>;
} & HTMLAttributes<HTMLDivElement>;

export function CodeCompare({ fileIconSlot, className, CodeView = CodeCompareView }: CodeCompareProps) {
  const componentCompareContext = useComponentCompare();

  const query = useQuery();
  const location = useLocation() || { pathname: '/' };

  // todo - look into this loading flag where it needs to be used
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { base, compare, state: compareState, hooks: compareHooks, hidden, loading } = componentCompareContext || {};

  const state = compareState?.code;
  const hook = compareHooks?.code;

  const [isSidebarOpen, setSidebarOpenness] = useState(false);
  const baseHost = 'teambit.scope/scope';
  const compareHost = compare?.hasLocalChanges ? 'teambit.workspace/workspace' : 'teambit.scope/scope';
  const {
    fileTree: baseFileTree,
    mainFile: baseMainFile,
    loading: baseTreeLoading,
  } = useCode(hidden ? undefined : base?.model.id, baseHost);
  const {
    fileTree: compareFileTree,
    mainFile: compareMainFile,
    loading: compareTreeLoading,
  } = useCode(hidden ? undefined : compare?.model.id, compareHost);
  // a new component has no base, so its main file comes from the compare side.
  const mainFile = baseMainFile || compareMainFile;

  const fileCompareDataByName = componentCompareContext?.fileCompareDataByName;
  // `undefined` while the compare data loads; `null` when there is none. The diff waits for the same.
  const compareDataLoading = !!componentCompareContext && fileCompareDataByName === undefined;
  const listLoading = baseTreeLoading || compareTreeLoading || compareDataLoading;

  // Build the list only when both file trees and the compare data have landed. Building it earlier
  // reshuffled the file tabs and the tree on first load: the two trees resolve in either order, and
  // the changed files moved to the top only when the compare data arrived.
  const { fileTree, firstChangedFile } = useMemo(() => {
    if (listLoading) return { fileTree: [] as string[] };
    const allFiles = uniq<string>((baseFileTree || []).concat(compareFileTree || []));
    if (!fileCompareDataByName) return { fileTree: allFiles };
    const isChanged = (file: string) => {
      const status = fileCompareDataByName.get(file)?.status;
      return !!status && status !== 'UNCHANGED';
    };
    // changed files first. the sort is stable, so each group keeps the order of the file trees.
    const sorted = [...allFiles].sort((a, b) => Number(isChanged(b)) - Number(isChanged(a)));
    // open the main file when it changed. that includes a new component, where every file is NEW.
    // otherwise open the first changed file.
    const firstChanged = mainFile && isChanged(mainFile) ? mainFile : sorted.find(isChanged);
    return { fileTree: sorted, firstChangedFile: firstChanged };
  }, [
    listLoading,
    baseFileTree,
    compareFileTree,
    fileCompareDataByName,
    mainFile,
  ]);

  const selectedFileFromParams = useCompareQueryParam('file');

  const selectedFile = React.useMemo(
    () =>
      state?.id || selectedFileFromParams || firstChangedFile || mainFile || DEFAULT_FILE,
    [state?.id, selectedFileFromParams, firstChangedFile, mainFile]
  );
  // Without an explicit file, the file to open depends on the list. Opening a fallback before the list
  // lands would load and show that file, then switch to the first changed file.
  const waitForList = !state?.id && !selectedFileFromParams && listLoading;

  const controlledHref = useUpdatedUrlFromQuery({});
  const useHref = (node: any) => {
    const hrefFromHook =
      hook?.useUpdatedUrlFromQuery?.(
        { file: node.id },
        () => query,
        () => location
      ) ?? null;
    const defaultHref = useUpdatedUrlFromQuery(
      { file: node.id },
      () => query,
      () => location
    );
    return hrefFromHook || state?.controlled ? controlledHref : defaultHref;
  };

  const sidebarIconUrl = isSidebarOpen
    ? 'https://static.bit.dev/design-system-assets/Icons/sidebar-close.svg'
    : 'https://static.bit.dev/design-system-assets/Icons/sidebar-open.svg';
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;

  return (
    // No theme override here: the diff must inherit the page's theme.
    //
    // This used to be `<ThemeSwitcher themes={[DarkTheme]}>`, from when Monaco rendered the diff and
    // its editor was always dark. The shiki viewer paints every token with a sentinel that resolves
    // to a Bit design-system CSS variable (`--syntax-*-color`), and both the base and dark themes
    // define those — so forcing DarkTheme here pinned the diff dark on a light page and made it the
    // only surface that ignored the user's theme.
    <div className={classNames(styles.themeContainer, className)}>
      <SplitPane
        layout={sidebarOpenness}
        size={200}
        className={classNames(
          styles.componentCompareCodeContainer,
          className,
          componentCompareContext?.hidden && styles.hidden
        )}
      >
        <Pane className={classNames(styles.left, !isSidebarOpen && styles.collapsed)}>
          <div
            className={styles.codeCompareTreeCollapse}
            onClick={() => setSidebarOpenness((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Space') {
                setSidebarOpenness((value) => !value);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={isSidebarOpen ? 'Collapse file tree' : 'Expand file tree'}
            // the icon is a remote SVG; passing it as a mask lets CSS paint it with a theme color
            style={{ ['--code-compare-sidebar-icon' as string]: `url(${sidebarIconUrl})` } as React.CSSProperties}
          >
            <span className={styles.sidebarIcon} aria-hidden="true" />
          </div>
          <CodeCompareTree
            className={styles.codeCompareTree}
            fileIconSlot={fileIconSlot}
            fileTree={fileTree}
            currentFile={selectedFile}
            drawerName="FILES"
            widgets={[Widget]}
            getHref={useHref}
            onTreeNodeSelected={hook?.onClick}
            open={isSidebarOpen}
          />
        </Pane>
        <HoverSplitter className={styles.splitter} />
        <Pane className={classNames(styles.right, styles.dark, !isSidebarOpen && styles.collapsed)}>
          {waitForList ? (
            // the loader is absolutely positioned (it overlays the diff area while a file loads), so it
            // needs its own positioned box here. Without one it covers every drawer on the page.
            <div className={styles.listLoader}>
              <CodeCompareViewLoader className={styles.listLoaderSkeleton} />
            </div>
          ) : (
            <CodeView
              widgets={[Widget]}
              fileName={selectedFile}
              files={fileTree}
              getHref={useHref}
              onTabClicked={hook?.onClick}
              fileIconSlot={fileIconSlot}
            />
          )}
        </Pane>
      </SplitPane>
    </div>
  );
}
