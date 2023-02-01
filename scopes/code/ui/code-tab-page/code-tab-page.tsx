import { ComponentContext } from '@teambit/component';
import classNames from 'classnames';
import React, { useContext, useState, HTMLAttributes, useMemo } from 'react';
import { flatten } from 'lodash';
import { Label } from '@teambit/documenter.ui.label';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
import type { FileIconSlot } from '@teambit/code';
import { CodeView } from '@teambit/code.ui.code-view';
import { CodeTabTree } from '@teambit/code.ui.code-tab-tree';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { getFileIcon, FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { useCodeParams } from '@teambit/code.ui.hooks.use-code-params';
import { TreeNode } from '@teambit/design.ui.tree';
import { affix } from '@teambit/base-ui.utils.string.affix';
import { useComponentArtifacts } from '@teambit/component.ui.artifacts.queries.use-component-artifacts';
import {
  ArtifactFile,
  getArtifactFileDetailsFromUrl,
} from '@teambit/component.ui.artifacts.models.component-artifacts-model';
import isBinaryPath from 'is-binary-path';
import { FILE_SIZE_THRESHOLD } from '@teambit/component.ui.artifacts.artifacts-tree';
import { ThemeSwitcher } from '@teambit/design.themes.theme-toggler';
import { DarkTheme } from '@teambit/design.themes.dark-theme';

import styles from './code-tab-page.module.scss';

const DEFAULT_FILE = 'index.ts';
type CodePageProps = {
  fileIconSlot?: FileIconSlot;
  host: string;
} & HTMLAttributes<HTMLDivElement>;

export function CodePage({ className, fileIconSlot, host }: CodePageProps) {
  const urlParams = useCodeParams();
  const component = useContext(ComponentContext);
  const { mainFile, fileTree = [], dependencies, devFiles } = useCode(component.id);
  const { data: artifacts = [] } = useComponentArtifacts(host, component.id.toString());
  const [isSidebarOpen, setSidebarOpenness] = useState(false);
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const currentFile = urlParams.file || mainFile || DEFAULT_FILE;
  const currentArtifactFile = getArtifactFileDetailsFromUrl(artifacts, currentFile)?.artifactFile;
  const currentArtifactFileContent = getCurrentArtifactFileContent(currentArtifactFile);

  const sidebarIconUrl = isSidebarOpen
    ? 'https://static.bit.dev/design-system-assets/Icons/sidebar-close.svg'
    : 'https://static.bit.dev/design-system-assets/Icons/sidebar-open.svg';

  const widgets = useMemo(() => [generateWidget(mainFile, devFiles)], [mainFile, devFiles]);
  const getHref = useMemo(() => (node) => `${node.id}${affix('?version=', urlParams.version)}`, [urlParams.version]);
  const getIcon = useMemo(() => generateIcon(fileIconMatchers), fileIconMatchers);

  return (
    <ThemeSwitcher themes={[DarkTheme]} className={classNames(styles.themeContainer, className)}>
      <SplitPane layout={Layout.row} size={isSidebarOpen ? 200 : 32} className={classNames(styles.codePage, className)}>
        <Pane className={classNames(styles.left, !isSidebarOpen && styles.collapsed)}>
          <div className={styles.codeTreeCollapse} onClick={() => setSidebarOpenness((value) => !value)}>
            <img src={sidebarIconUrl} />
          </div>
          {isSidebarOpen && (
            <CodeTabTree
              className={styles.codeTree}
              host={host}
              currentFile={currentFile}
              dependencies={dependencies}
              fileTree={fileTree}
              widgets={widgets}
              getHref={getHref}
              getIcon={getIcon}
            />
          )}
        </Pane>
        <HoverSplitter className={styles.splitter}></HoverSplitter>
        <Pane className={styles.right}>
          <CodeView
            componentId={component.id}
            currentFile={currentFile}
            files={fileTree}
            fileIconMatchers={fileIconMatchers}
            currentFileContent={currentArtifactFileContent}
            getHref={useMemo(() => (node) => `${node.id}${affix('?version=', urlParams.version)}`, [urlParams.version])}
          />
        </Pane>
      </SplitPane>
    </ThemeSwitcher>
  );
}

function generateWidget(mainFile?: string, devFiles?: string[]) {
  return function Widget({ node }: WidgetProps<any>) {
    const fileName = node?.id;
    if (fileName === mainFile) {
      return <Label className={styles.label}>main</Label>;
    }
    if (devFiles?.includes(fileName)) {
      return <Label className={styles.label}>dev</Label>;
    }
    return null;
  };
}

export function generateIcon(fileIconMatchers: FileIconMatch[]) {
  return function Icon({ id }: TreeNode) {
    return getFileIcon(fileIconMatchers, id);
  };
}

function getCurrentArtifactFileContent(file?: ArtifactFile | undefined): string | undefined {
  if (!file) return undefined;
  if (isBinaryPath(file.path) || (file.size ?? 0) > FILE_SIZE_THRESHOLD) return undefined;
  return file.content;
}
