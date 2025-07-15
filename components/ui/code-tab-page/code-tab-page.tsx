import { ComponentContext, ComponentID } from '@teambit/component';
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
import { useViewedLaneFromUrl } from '@teambit/lanes.hooks.use-viewed-lane-from-url';

import styles from './code-tab-page.module.scss';

export type CodePageProps = {
  fileIconSlot?: FileIconSlot;
  host: string;
  codeViewClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

/**
 * Resolves a requested file path against a file tree, handling extension mappings,
 * parent directory traversal, and index files.
 *
 * @param requestedPath The path to resolve (can include ./, ../, etc)
 * @param fileTree Array of available files
 * @param mainFile Default file to return if no match is found
 * @param loadingCode Whether code is currently loading
 * @returns Resolved file path or undefined if loading
 */
export function resolveFilePath(
  requestedPath: string | undefined,
  fileTree: string[],
  mainFile: string,
  loadingCode: boolean
): string | undefined {
  if (loadingCode) return undefined;
  if (!requestedPath) return mainFile;

  const normalized = path.resolve(requestedPath);

  if (fileTree.includes(normalized)) return normalized;

  const extension = path.extname(normalized);
  const requestedExt = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(extension) ? extension : '';
  const basePathWithoutExt = requestedExt ? normalized.slice(0, -requestedExt.length) : normalized;

  const getTypeScriptVariants = (ext: string): string[] => {
    switch (ext) {
      case '.js':
        return ['.ts', '.tsx'];
      case '.jsx':
        return ['.tsx'];
      case '.mjs':
        return ['.mts'];
      case '.cjs':
        return ['.cts'];
      default:
        return [];
    }
  };

  const possibleExtensions = requestedExt
    ? [requestedExt, ...getTypeScriptVariants(requestedExt)]
    : ['.ts', '.tsx', '.js'];

  const possiblePaths = [
    normalized,
    ...possibleExtensions.map((ext) => `${basePathWithoutExt}${ext}`),
    ...possibleExtensions.map((ext) => path.join(normalized, `index${ext}`)),
    ...possibleExtensions.map((ext) => path.join(basePathWithoutExt, `index${ext}`)),
  ].map((p) => path.resolve(p));

  const matchingFiles = fileTree.filter((file) => possiblePaths.includes(path.resolve(file)));

  if (matchingFiles.length > 0) {
    if (matchingFiles.includes(normalized)) {
      return normalized;
    }

    const ordered = matchingFiles.sort((a, b) => {
      const extA = path.extname(a);
      const extB = path.extname(b);

      if (extA === requestedExt && extB !== requestedExt) return -1;
      if (extB === requestedExt && extA !== requestedExt) return 1;

      const isTypeScriptA = ['.ts', '.tsx'].includes(extA);
      const isTypeScriptB = ['.ts', '.tsx'].includes(extB);
      if (isTypeScriptA && !isTypeScriptB) return -1;
      if (isTypeScriptB && !isTypeScriptA) return 1;

      if (extA === '.ts' && extB === '.tsx') return -1;
      if (extA === '.tsx' && extB === '.ts') return 1;

      return a.length - b.length;
    });

    return ordered[0];
  }

  return mainFile;
}

export function CodePage({ className, fileIconSlot, host: hostFromProps, codeViewClassName }: CodePageProps) {
  const urlParams = useCodeParams();
  const laneFromUrl = useViewedLaneFromUrl();
  const [searchParams] = useSearchParams();
  const scopeFromQueryParams = searchParams.get('scope');
  const component = useContext(ComponentContext);
  const host = useMemo(
    () => (urlParams.version ? 'teambit.scope/scope' : hostFromProps),
    [urlParams.version, hostFromProps]
  );

  const { mainFile, fileTree = [], dependencies, devFiles, loading: loadingCode } = useCode(component.id, host);
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

  const componentId =
    laneFromUrl || urlParams.version ? component.id : ComponentID.fromString(component.id.toStringWithoutVersion());

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={classNames(styles.codePage, className)}>
      <Pane className={styles.left}>
        <CodeView
          componentId={componentId}
          currentFile={currentFile}
          icon={icon}
          currentFileContent={currentArtifactFileContent}
          loading={loadingArtifactFileContent || loadingCode}
          codeSnippetClassName={codeViewClassName}
          dependencies={dependencies}
          host={host}
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
