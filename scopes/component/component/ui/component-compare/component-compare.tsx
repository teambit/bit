import { ComponentContext, ComponentID } from '@teambit/component';
import classNames from 'classnames';
import flatten from 'lodash.flatten';
import React, { useContext, useState, HTMLAttributes, useCallback, useMemo } from 'react';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import type { FileIconSlot } from '@teambit/code';
import { CodeCompareView } from '@teambit/code.ui.code-compare-view';
import { CodeTabTree } from '@teambit/code.ui.code-tab-tree';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { LanesModel, useLanesContext } from '@teambit/lanes.ui.lanes';
import { getFileIcon, FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';

import styles from './component-compare.module.scss';

export type ComponentCompareProps = {
  fileIconSlot?: FileIconSlot;
} & HTMLAttributes<HTMLDivElement>;

/*
  Component Aspect registers the Component Compare Page 
   * version: it is the currently viewed version. if not present, default to latest
   * to: version to compare to, if present auto select it in the dropdown
   * selected: selected defaults to the first composition of the component, the user 
   *           can change selection between the following drawers; 
   *           compositions, files, aspects, dependencies. (~file/, ~composition/, ~aspects/, ~dependencies/)
   * clicking on the compare button computes the compare between the selected versions
   *    note: highlight the compare button when the selection changes
 */
export function ComponentCompare({ fileIconSlot, className }: ComponentCompareProps) {
  const { toVersion, fromVersion, file: currentFile } = useCodeCompareParams();
  const component = useContext(ComponentContext);
  const [showCodeCompare] = useState<boolean>(true);

  const fromComponentId = (fromVersion && component.id.changeVersion(fromVersion)) || component.id;
  const lastVersion = (component.logs && component.logs.length > 1 && component.logs[1].hash) || undefined;
  const toComponentId =
    (toVersion && component.id.changeVersion(toVersion)) ||
    (lastVersion && component.id.changeVersion(lastVersion)) ||
    fromComponentId;

  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={classNames(styles.codePage, className)}>
      <Pane className={styles.left}>
        {showCodeCompare && <CodeCompareView to={toComponentId} fileName={currentFile} from={fromComponentId} />}
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
        <CodeCompareTabTree
          currentFile={currentFile}
          toComponentId={toComponentId}
          fromComponentId={fromComponentId}
          fileIconSlot={fileIconSlot}
        />
      </Pane>
    </SplitPane>
  );
}

export type CodeCompareTabTreeProps = {
  currentFile?: string;
  fileIconSlot?: FileIconSlot;
  fromComponentId: ComponentID;
  toComponentId: ComponentID;
} & HTMLAttributes<HTMLDivElement>;

function CodeCompareTabTree({ currentFile, fromComponentId, toComponentId, fileIconSlot }: CodeCompareTabTreeProps) {
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const icon = getFileIcon(fileIconMatchers, currentFile);
  const { mainFile: fromMainFile, fileTree: fromFileTree = [], devFiles: fromDevFiles = [] } = useCode(fromComponentId);
  const { fileTree: toFileTree = [], devFiles: toDevFiles = [] } = useCode(toComponentId);
  const fileTree = fromFileTree.concat(toFileTree);
  const devFiles = fromDevFiles?.concat(toDevFiles);

  const treeNodeRenderer = useCallback(
    function TreeNode(props: any) {
      const children = props.node.children;
      const { selected } = useContext(TreeContext);
      const lanesContext = useLanesContext();
      const { componentId } = useCodeCompareParams();

      const currentLaneUrl = lanesContext?.viewedLane
        ? `${LanesModel.getLaneUrl(lanesContext?.viewedLane.id)}${LanesModel.baseLaneComponentRoute}`
        : '';
      const toVersionUrl = `${(toComponentId?.version && '&to='.concat(toComponentId.version)) || ''}`;
      const fromVersionUrl = `from=${fromComponentId.version}`;
      const href = `${currentLaneUrl}/${componentId}/~compare/${props.node.id}/?${fromVersionUrl}${toVersionUrl}`;

      if (!children) {
        return <Node href={href} {...props} isActive={props.node.id === selected} icon={icon} />;
      }
      return <FolderTreeNode {...props} />;
    },
    [fileIconMatchers, devFiles]
  );

  return (
    <CodeTabTree currentFile={currentFile || fromMainFile} fileTree={fileTree} treeNodeRenderer={treeNodeRenderer} />
  );
}
