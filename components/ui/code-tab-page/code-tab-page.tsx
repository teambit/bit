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

const extractNameAndExtension = (filename: string) => {
  const match = filename.match(/^(.*?)(\.[^.]+)?$/);
  return [match?.[1] || '', match?.[2] || ''];
};

const resolveFilePath = (
  urlParams: { file?: string },
  fileTree: string[],
  mainFile: string,
  fileParam: { current?: string; prev?: string },
  loadingCode: boolean
) => {
  if (loadingCode) return undefined;
  if (!urlParams.file) return mainFile;
  if (fileTree.includes(urlParams.file)) return urlParams.file;

  const [currentBase] = extractNameAndExtension(fileParam.current || '');
  const mainFileExt = extractNameAndExtension(mainFile)[1];
  const [, prevExt] = fileParam.prev ? extractNameAndExtension(fileParam.prev) : [null, null];

  const matchingFiles = fileTree.filter((file) => {
    const [fileBase] = extractNameAndExtension(file);
    return fileBase === currentBase || fileBase === fileParam.current;
  });

  if (matchingFiles.length) return matchingFiles[0];

  const preferredExt = prevExt || mainFileExt;
  if (preferredExt) {
    const exactExtensionMatch = matchingFiles.find((file) => {
      const [, fileExt] = extractNameAndExtension(file);
      return fileExt === preferredExt;
    });
    if (exactExtensionMatch) return exactExtensionMatch;
  }

  const indexFiles = fileTree.filter((file) => {
    const normalizedPath = path.normalize(urlParams.file || '');
    return file.startsWith(`${normalizedPath}/index.`);
  });

  if (indexFiles.length > 0) {
    if (preferredExt) {
      const indexWithPreferredExt = indexFiles.find((file) => {
        const [, fileExt] = extractNameAndExtension(file);
        return fileExt === preferredExt;
      });
      if (indexWithPreferredExt) return indexWithPreferredExt;
    }
    return indexFiles[0];
  }

  if (urlParams.file && (urlParams.file.startsWith('./') || urlParams.file.startsWith('../'))) {
    const current = fileTree.find((file) => file.endsWith(urlParams.file || ''));
    if (current) return current;

    const matchWithExt = fileTree.find(
      (file) =>
        file.endsWith(`${urlParams.file}.ts`) ||
        file.endsWith(`${urlParams.file}.js`) ||
        file.endsWith(`${urlParams.file}/index.ts`) ||
        file.endsWith(`${urlParams.file}/index.js`)
    );
    if (matchWithExt) return matchWithExt;
  }

  return mainFile;
};

export function CodePage({ className, fileIconSlot, host, codeViewClassName }: CodePageProps) {
  const urlParams = useCodeParams();
  const [searchParams] = useSearchParams();
  const scopeFromQueryParams = searchParams.get('scope');
  const component = useContext(ComponentContext);
  const [fileParam, setFileParam] = useState<{
    current?: string;
    prev?: string;
  }>({ current: urlParams.file });

  React.useEffect(() => {
    if (urlParams.file !== fileParam.current) {
      setFileParam((prev) => ({ current: urlParams.file, prev: prev.current }));
    }
  }, [urlParams.file, fileParam.current]);

  const { mainFile, fileTree = [], dependencies, devFiles, loading: loadingCode } = useCode(component.id);
  const { data: artifacts = [] } = useComponentArtifacts(host, component.id.toString());

  const currentFile = resolveFilePath(urlParams, fileTree, mainFile, fileParam, loadingCode);

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
