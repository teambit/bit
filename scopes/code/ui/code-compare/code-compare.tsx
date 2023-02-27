import React, { HTMLAttributes, useState, useMemo, useRef } from 'react';
import { uniq } from 'lodash';
import classNames from 'classnames';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { FileIconSlot } from '@teambit/code';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import {
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
import { ThemeSwitcher } from '@teambit/design.themes.theme-toggler';
import { DarkTheme } from '@teambit/design.themes.dark-theme';
import { useLocation } from '@teambit/base-react.navigation.link';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { CodeCompareTree } from './code-compare-tree';
import { CodeCompareView, CodeCompareViewProps } from './code-compare-view';
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

  const { base, compare, state: compareState, hooks: compareHooks } = componentCompareContext || {};
  const state = compareState?.code;
  const hook = compareHooks?.code;

  const [isSidebarOpen, setSidebarOpenness] = useState(false);

  const { fileTree: baseFileTree = [], mainFile } = useCode(base?.model.id);
  const { fileTree: compareFileTree = [] } = useCode(compare?.model.id);
  const fileCompareDataByName = componentCompareContext?.fileCompareDataByName;

  const anyFileHasDiffStatus = useRef<boolean>(false);

  const fileTree = useMemo(() => {
    const allFiles = uniq(baseFileTree.concat(compareFileTree));
    anyFileHasDiffStatus.current = false;
    // sort by diff status
    return !fileCompareDataByName
      ? allFiles
      : allFiles.sort((a, b) => {
          const aCompareResult = fileCompareDataByName.get(a);
          const bCompareResult = fileCompareDataByName.get(b);
          const noStatus = (status) => !status || status === 'UNCHANGED';
          const aStatus = aCompareResult?.status;
          const bStatus = bCompareResult?.status;
          if (!noStatus(aStatus) && !noStatus(bStatus)) return 0;
          if (!noStatus(aStatus)) return -1;
          if (!noStatus(bStatus)) return 1;
          if (!anyFileHasDiffStatus.current) anyFileHasDiffStatus.current = true;
          if (aStatus?.toLowerCase() === 'new') return -1;
          if (bStatus?.toLowerCase() === 'new') return 1;
          return 0;
        });
  }, [
    fileCompareDataByName,
    baseFileTree.length,
    compareFileTree.length,
    base?.model.id.toString(),
    compare?.model.id.toString(),
  ]);

  const selectedFileFromParams = useCompareQueryParam('file');

  const selectedFile =
    state?.id || selectedFileFromParams || (anyFileHasDiffStatus.current ? fileTree[0] : mainFile || DEFAULT_FILE);

  const controlledHref = useUpdatedUrlFromQuery({});
  const getHref = (node) => {
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

  return (
    <ThemeSwitcher themes={[DarkTheme]} className={classNames(styles.themeContainer, className)}>
      <SplitPane
        layout={Layout.row}
        size={isSidebarOpen ? 200 : 32}
        className={classNames(styles.componentCompareCodeContainer, className)}
      >
        <Pane className={classNames(styles.left, !isSidebarOpen && styles.collapsed)}>
          <div className={styles.codeCompareTreeCollapse} onClick={() => setSidebarOpenness((value) => !value)}>
            <img src={sidebarIconUrl} />
          </div>
          {isSidebarOpen && (
            <CodeCompareTree
              className={styles.codeCompareTree}
              fileIconSlot={fileIconSlot}
              fileTree={fileTree}
              currentFile={selectedFile}
              drawerName={'FILES'}
              widgets={[Widget]}
              getHref={getHref}
              onTreeNodeSelected={hook?.onClick}
            />
          )}
        </Pane>
        <HoverSplitter className={styles.splitter}></HoverSplitter>
        <Pane className={classNames(styles.right, styles.dark, !isSidebarOpen && styles.collapsed)}>
          <CodeView
            widgets={[Widget]}
            fileName={selectedFile}
            files={fileTree}
            getHref={getHref}
            onTabClicked={hook?.onClick}
          />
        </Pane>
      </SplitPane>
    </ThemeSwitcher>
  );
}
