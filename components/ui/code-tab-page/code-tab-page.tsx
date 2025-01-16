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

/**
 * Resolves a requested file path against a file tree, handling extension mappings and index files.
 * Maintains priority: exact match -> extension variants -> index files -> main file
 */
export function resolveFilePath(
  requestedPath: string | undefined,
  fileTree: string[],
  mainFile: string,
  loadingCode: boolean
): string | undefined {
  if (loadingCode) return undefined;
  if (!requestedPath) return mainFile;

  // Normalize path and remove leading ./
  const normalized = path.normalize(requestedPath).replace(/^\.\//, '');

  // First priority: exact match
  if (fileTree.includes(normalized)) return normalized;

  const requestedExt = path.extname(normalized);
  const basePathWithoutExt = requestedExt ? normalized.slice(0, -requestedExt.length) : normalized;

  // Handle JS family to TS family mappings including .tsx
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

  // Get possible extensions in priority order
  const possibleExtensions = requestedExt
    ? [requestedExt, ...getTypeScriptVariants(requestedExt)]
    : ['.ts', '.tsx', '.js'];

  // Create all possible paths while maintaining priority
  const possiblePaths = [
    normalized,
    // Try exact path with different extensions
    ...possibleExtensions.map((ext) => `${basePathWithoutExt}${ext}`),
    // Try index files with the same extension priority
    ...possibleExtensions.map((ext) => path.join(normalized, `index${ext}`)),
    // Try directory index with extensions
    ...possibleExtensions.map((ext) => path.join(basePathWithoutExt, `index${ext}`)),
  ];

  // Find all matching files
  const matchingFiles = fileTree.filter((file) => possiblePaths.includes(file));

  if (matchingFiles.length > 0) {
    // If exact match exists, return it
    if (matchingFiles.includes(normalized)) {
      return normalized;
    }

    // Order by priority
    const ordered = matchingFiles.sort((a, b) => {
      const extA = path.extname(a);
      const extB = path.extname(b);

      // 1. Exact extension match gets highest priority
      if (extA === requestedExt && extB !== requestedExt) return -1;
      if (extB === requestedExt && extA !== requestedExt) return 1;

      // 2. TypeScript variants (.ts/.tsx) over JavaScript
      const isTypeScriptA = ['.ts', '.tsx'].includes(extA);
      const isTypeScriptB = ['.ts', '.tsx'].includes(extB);
      if (isTypeScriptA && !isTypeScriptB) return -1;
      if (isTypeScriptB && !isTypeScriptA) return 1;

      // 3. Between TypeScript variants, prefer .ts over .tsx
      if (extA === '.ts' && extB === '.tsx') return -1;
      if (extA === '.tsx' && extB === '.ts') return 1;

      // 4. Shorter paths (more direct matches) get priority
      return a.length - b.length;
    });

    return ordered[0];
  }

  return mainFile;
}

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
