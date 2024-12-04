import { ComponentContext } from '@teambit/component';
import classNames from 'classnames';
import React, { useContext, useState, HTMLAttributes, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { flatten } from 'lodash';
import { Label } from '@teambit/documenter.ui.label';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
import type { FileIconSlot } from '@teambit/code';
import { CodeView } from '@teambit/code.ui.code-view';
import { CodeTabTree } from '@teambit/code.ui.code-tab-tree';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { getFileIcon, FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { useCodeParams } from '@teambit/code.ui.hooks.use-code-params';
import path from 'path-browserify';
import { TreeNode } from '@teambit/design.ui.tree';
import {
  useComponentArtifactFileContent,
  useComponentArtifacts,
} from '@teambit/component.ui.artifacts.queries.use-component-artifacts';
import {
  ArtifactFile,
  getArtifactFileDetailsFromUrl,
} from '@teambit/component.ui.artifacts.models.component-artifacts-model';
import isBinaryPath from 'is-binary-path';
import { FILE_SIZE_THRESHOLD } from '@teambit/component.ui.artifacts.artifacts-tree';

import styles from './code-tab-page.module.scss';

export type CodePageProps = {
  fileIconSlot?: FileIconSlot;
  host: string;
  codeViewClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

const resolveFilePath = (
  requestedPath: string | undefined,
  fileTree: string[],
  mainFile: string,
  loadingCode: boolean
) => {
  if (loadingCode) return undefined;
  if (!requestedPath) return mainFile;

  const normalized = path.normalize(requestedPath);

  if (fileTree.includes(normalized)) return normalized;

  const possiblePaths = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.js`,
    path.join(normalized, 'index.ts'),
    path.join(normalized, 'index.js'),
  ];

  const match = fileTree.find((file) => possiblePaths.includes(file));
  return match || mainFile;
};

export function CodePage({ className, fileIconSlot, host, codeViewClassName }: CodePageProps) {
  const urlParams = useCodeParams();
  const [searchParams] = useSearchParams();
  const scopeFromQueryParams = searchParams.get('scope');
  const component = useContext(ComponentContext);

  const { mainFile, fileTree = [], dependencies, devFiles, loading: loadingCode } = useCode(component.id);
  const { data: artifacts = [] } = useComponentArtifacts(host, component.id.toString());

  const currentFile = resolveFilePath(urlParams.file, fileTree, mainFile, loadingCode);

  const currentArtifact = getArtifactFileDetailsFromUrl(artifacts, currentFile);
  const currentArtifactFile = currentArtifact?.artifactFile;
  const { data: currentArtifactFileData, loading: loadingArtifact } = useComponentArtifactFileContent(
    host,
    {
      componentId: component.id.toString(),
      taskId: currentArtifact?.taskId,
      filePath: currentArtifactFile?.path,
    },
    !currentArtifact
  );

  const currentArtifactFileContent = getArtifactFileContent(
    (currentArtifactFileData && currentArtifactFileData[0]?.files?.[0]) || undefined
  );
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const icon = getFileIcon(fileIconMatchers, currentFile);
  const loadingArtifactFileContent =
    loadingArtifact !== undefined ? loadingArtifact : !!currentFile && !currentArtifact;
  const getHref = React.useCallback(
    (node) => {
      const queryParams = new URLSearchParams();

      if (urlParams.version) {
        queryParams.set('version', urlParams.version);
      }

      if (scopeFromQueryParams) {
        queryParams.set('scope', scopeFromQueryParams);
      }

      return `${node.id}?${queryParams.toString()}`;
    },
    [urlParams.version, scopeFromQueryParams]
  );

  const sortedDeps = useMemo(() => {
    // need to create a new instance of dependencies because we cant mutate the original array
    return [...(dependencies ?? [])].sort((a, b) => {
      return (a.packageName || a.id).localeCompare(b.packageName || b.id);
    });
  }, [dependencies?.length]);

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={classNames(styles.codePage, className)}>
      <Pane className={styles.left}>
        <CodeView
          componentId={component.id}
          currentFile={currentFile}
          icon={icon}
          currentFileContent={currentArtifactFileContent}
          loading={loadingArtifactFileContent || loadingCode}
          codeSnippetClassName={codeViewClassName}
          dependencies={dependencies}
        />
      </Pane>
      <HoverSplitter className={styles.splitter}>
        <Collapser
          placement="left"
          isOpen={isSidebarOpen}
          onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
          onClick={() => setSidebarOpenness((x) => !x)}
          tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} file tree`}
          className={styles.collapser}
        />
      </HoverSplitter>
      <Pane className={styles.right}>
        <CodeTabTree
          host={host}
          currentFile={currentFile}
          dependencies={sortedDeps}
          fileTree={fileTree}
          widgets={useMemo(() => [generateWidget(mainFile, devFiles)], [mainFile, devFiles])}
          getHref={getHref}
          getIcon={useMemo(() => generateIcon(fileIconMatchers), fileIconMatchers)}
        />
      </Pane>
    </SplitPane>
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

function getArtifactFileContent(file?: ArtifactFile | undefined): string | undefined {
  if (!file) return undefined;
  if (isBinaryPath(file.path) || (file.size ?? 0) > FILE_SIZE_THRESHOLD) return undefined;
  return file.content;
}
