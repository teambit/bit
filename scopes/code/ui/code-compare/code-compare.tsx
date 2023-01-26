import React, { HTMLAttributes, useState } from 'react';
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

  const { base, compare, state: compareState, hooks: compareHooks } = componentCompareContext || {};
  const state = compareState?.code;
  const hook = compareHooks?.code;

  const [isSidebarOpen, setSidebarOpenness] = useState(false);

  const { fileTree: baseFileTree = [], mainFile } = useCode(base?.model.id);
  const { fileTree: compareFileTree = [] } = useCode(compare?.model.id);

  const fileTree = uniq(baseFileTree.concat(compareFileTree));

  const selectedFileFromParams = useCompareQueryParam('file');

  const selectedFile = state?.id || selectedFileFromParams || mainFile || DEFAULT_FILE;

  const _useUpdatedUrlFromQuery =
    hook?.useUpdatedUrlFromQuery || (state?.controlled && (() => useUpdatedUrlFromQuery({}))) || useUpdatedUrlFromQuery;

  const getHref = (node) => _useUpdatedUrlFromQuery({ file: node.id });
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
