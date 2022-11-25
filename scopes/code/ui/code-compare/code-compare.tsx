import React, { HTMLAttributes, useState } from 'react';
import classNames from 'classnames';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { FileIconSlot } from '@teambit/code';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import {
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { useComponentCompareQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare';
import {
  ComponentCompareQueryResponse,
  FileCompareResult,
} from '@teambit/component.ui.component-compare.models.component-compare-model';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
// import { useComponentArtifacts } from '@teambit/component.ui.artifacts.queries.use-component-artifacts';
import { CodeCompareTree } from './code-compare-tree';
import { CodeCompareView } from './code-compare-view';
import { Widget } from './code-compare.widgets';
import { CodeCompareContext, CodeCompareModel } from './code-compare-context';

import styles from './code-compare.module.scss';

const DEFAULT_FILE = 'index.ts';

export type CodeCompareProps = {
  fileIconSlot?: FileIconSlot;
} & HTMLAttributes<HTMLDivElement>;

export function CodeCompare({ fileIconSlot, className }: CodeCompareProps) {
  const componentCompareContext = useComponentCompare();
  const { base, compare, state: compareState, hooks: compareHooks } = componentCompareContext || {};

  const state = compareState && compareState.code;
  const hook = compareHooks && compareHooks.code;

  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const { fileTree: baseFileTree = [], mainFile, dependencies: baseDependencies } = useCode(base?.model.id);
  const { fileTree: compareFileTree = [], dependencies: compareDependencies } = useCode(compare?.model.id);

  const compCompareQueryResult = useComponentCompareQuery(base?.model.id.toString(), compare?.model.id.toString());

  const fileTree = baseFileTree.concat(compareFileTree);

  const selectedFileFromParams = useCompareQueryParam('file');

  const selectedFile = state?.id || selectedFileFromParams || mainFile || DEFAULT_FILE;
  const codeCompareContextData = mapToCodeCompareData(compCompareQueryResult);

  // const { data: artifacts = [] } = useComponentArtifacts(host, component.id.toString(), );
  // const currentFile = urlParams.file || mainFile;
  // const currentArtifactFile = getArtifactFileDetailsFromUrl(artifacts, currentFile)?.artifactFile;
  // const currentArtifactFileContent = getCurrentArtifactFileContent(currentArtifactFile);
  // const getHref = (!state?.id && ((node) => useUpdatedUrlFromQuery({ file: node.id }))) || (() => currentHref)

  const _useUpdatedUrlFromQuery = hook?.useUpdatedUrlFromQuery || useUpdatedUrlFromQuery;

  const getHref = (node) => _useUpdatedUrlFromQuery({ file: node.id });

  return (
    <CodeCompareContext.Provider value={codeCompareContextData}>
      <SplitPane
        layout={sidebarOpenness}
        size="85%"
        className={classNames(styles.componentCompareCodeContainer, className)}
      >
        <Pane className={styles.left}>
          <CodeCompareView fileName={selectedFile} />
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
        <Pane className={classNames(styles.right, styles.dark)}>
          <CodeCompareTree
            fileIconSlot={fileIconSlot}
            fileTree={fileTree}
            currentFile={selectedFile}
            drawerName={'FILES'}
            widgets={[Widget]}
            getHref={getHref}
            onTreeNodeSelected={hook?.onClick}
          />
        </Pane>
      </SplitPane>
    </CodeCompareContext.Provider>
  );
}

function mapToCodeCompareData({
  loading,
  componentCompareData,
}: {
  loading?: boolean;
  componentCompareData?: ComponentCompareQueryResponse;
}): CodeCompareModel {
  const fileCompareDataByName = new Map<string, FileCompareResult>();
  if (loading || !componentCompareData) return { loading, fileCompareDataByName };
  componentCompareData.code.forEach((codeCompareData) => {
    fileCompareDataByName.set(codeCompareData.fileName, codeCompareData);
  });
  return { loading, fileCompareDataByName };
}
