import { ComponentContext } from '@teambit/component';
import classNames from 'classnames';
import React, { useContext, useState, HTMLAttributes, useMemo, useCallback } from 'react';
import { flatten } from 'lodash';
import { affix } from '@teambit/base-ui.utils.string.affix';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
import { Label } from '@teambit/documenter.ui.label';
import type { FileIconSlot } from '@teambit/code';
import { CodeView } from '@teambit/code.ui.code-view';
import { CodeTabTree } from '@teambit/code.ui.code-tab-tree';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';
import { getFileIcon, FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { useCodeParams } from '@teambit/code.ui.hooks.use-code-params';
import styles from './code-tab-page.module.scss';

type CodePageProps = {
  fileIconSlot?: FileIconSlot;
} & HTMLAttributes<HTMLDivElement>;

export function CodePage({ className, fileIconSlot }: CodePageProps) {
  const urlParams = useCodeParams();
  const component = useContext(ComponentContext);
  const { mainFile, fileTree = [], dependencies, devFiles } = useCode(component.id);

  const currentFile = urlParams.file || mainFile;
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const icon = getFileIcon(fileIconMatchers, currentFile);
  const treeNodeRenderer = useCallback(
    function TreeNode(props: any) {
      const children = props.node.children;
      const { selected } = useContext(TreeContext);

      const href = `${props.node.id}${affix('?version=', urlParams.version)}`;

      const widgets = getWidgets(props.node.id, mainFile, devFiles);

      if (!children) {
        return (
          <Node
            href={href}
            {...props}
            isActive={props.node.id === selected}
            icon={getFileIcon(fileIconMatchers, props.node.id)}
            widgets={widgets}
          />
        );
      }
      return <FolderTreeNode {...props} />;
    },
    [fileIconMatchers, devFiles]
  );

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={classNames(styles.codePage, className)}>
      <Pane className={styles.left}>
        <CodeView componentId={component.id} currentFile={currentFile} icon={icon} />
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
          currentFile={currentFile}
          dependencies={dependencies}
          fileTree={fileTree}
          treeNodeRenderer={treeNodeRenderer}
        />
      </Pane>
    </SplitPane>
  );
}

function getWidgets(fileName: string, mainFile?: string, devFiles?: string[]) {
  if (fileName === mainFile) {
    return [() => createLabel('main')];
  }
  if (devFiles?.includes(fileName)) {
    return [() => createLabel('dev')];
  }
  return null;
}

function createLabel(str: string) {
  return <Label className={styles.label}>{str}</Label>;
}
