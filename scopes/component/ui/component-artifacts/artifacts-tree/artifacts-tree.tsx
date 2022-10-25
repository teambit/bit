import React, { HTMLAttributes, useMemo, useState, useContext } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { WidgetProps, TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree, useFileTreeContext } from '@teambit/ui-foundation.ui.tree.file-tree';
import { useLocation } from '@teambit/base-react.navigation.link';
import {
  Artifact,
  ArtifactFile,
  getArtifactFileDetailsFromUrl,
} from '@teambit/component.ui.artifacts.models.component-artifacts-model';
import { TreeNode, TreeNodeProps } from '@teambit/design.ui.tree';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { ComponentTreeLoader } from '@teambit/design.ui.skeletons.sidebar-loader';
import isBinaryPath from 'is-binary-path';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';
import { useCodeParams } from '@teambit/code.ui.hooks.use-code-params';
import { affix } from '@teambit/base-ui.utils.string.affix';
import { fileNodeClicked } from './artifact-file-node-clicked';

import styles from './artifacts-tree.module.scss';

export type ArtifactsTreeProps = {
  getIcon?: (node: TreeNode) => string | undefined;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  host: string;
  drawerName: string;
  fileTree: string[];
  artifacts: Array<Artifact>;
  artifactFiles: Array<ArtifactFile & { id: string }>;
  loading?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function ArtifactsTree({
  getIcon,
  host,
  drawerName,
  drawerOpen,
  onToggleDrawer,
  fileTree,
  artifacts,
  artifactFiles,
  loading,
}: ArtifactsTreeProps) {
  const urlParams = useCodeParams();
  const location = useLocation();
  const hasArtifacts = artifacts.length > 0;
  const artifactDetailsFromUrl = getArtifactFileDetailsFromUrl(artifacts, urlParams.file);
  const selected =
    artifactDetailsFromUrl &&
    `${artifactDetailsFromUrl.taskName}/${artifactDetailsFromUrl.artifactName}/${artifactDetailsFromUrl.artifactFile.path}`;

  const payloadMap =
    (hasArtifacts &&
      artifacts.reduce((accum, next) => {
        if (!accum.has(next.taskName)) accum.set(`${next.taskName}/`, { open: false });
        return accum;
      }, new Map<string, { open?: boolean }>())) ||
    new Map<string, { open?: boolean }>();

  if (artifactDetailsFromUrl) {
    payloadMap.set(`${artifactDetailsFromUrl.taskName}/`, { open: true });
    payloadMap.set(`${artifactDetailsFromUrl.taskName}/${artifactDetailsFromUrl.artifactName}/`, { open: true });
    payloadMap.set(
      `${artifactDetailsFromUrl.taskName}/${artifactDetailsFromUrl.artifactName}/${artifactDetailsFromUrl.artifactFile.path}`,
      { open: true }
    );
  }

  const currentHref = location?.pathname || '';

  const getHref = useMemo(
    () => (node) => {
      const path = getPathFromNode(node.id);
      const isBinary = isBinaryPath(path);
      if (isBinary) return currentHref;
      return `~artifact/${node.id}${affix('?version=', urlParams.version)}`;
    },
    [urlParams.version]
  );

  const widgets = useMemo(() => [generateWidget(artifactFiles || [])], [artifactFiles]);

  if (!hasArtifacts) return null;

  return (
    <DrawerUI
      isOpen={drawerOpen}
      onToggle={onToggleDrawer}
      name={drawerName}
      contentClass={styles.artifactsPanelCodeDrawerContent}
      className={classNames(styles.artifactsPanelCodeTabDrawer, drawerOpen && styles.openDrawer)}
    >
      {loading && <ComponentTreeLoader />}
      {loading || (
        <FileTree
          getIcon={getIcon}
          getHref={getHref}
          files={fileTree}
          widgets={widgets}
          payloadMap={payloadMap}
          TreeNode={FileTreeNode}
          selected={selected}
          onTreeNodeSelected={(id: string, e) => {
            const path = getPathFromNode(id);
            if (isBinaryPath(path)) fileNodeClicked(artifactFiles, 'download')(e, { id });
          }}
        />
      )}
    </DrawerUI>
  );
}

function getPathFromNode(node: string) {
  const lastIndex = node.lastIndexOf('/');
  return node.slice(lastIndex + 1);
}

function generateWidget(files: (ArtifactFile & { id: string })[]) {
  return function Widget({ node }: WidgetProps<any>) {
    const id = node.id;
    const artifactFile = files.find((file) => file.id === id);
    const path = getPathFromNode(id);
    const isBinary = isBinaryPath(path);

    if (artifactFile) {
      return (
        <div className={styles.artifactWidgets}>
          {!isBinary && (
            <Icon className={styles.icon} of="open-tab" onClick={(e) => fileNodeClicked(files, 'new tab')(e, node)} />
          )}
          <Icon
            className={styles.icon}
            of="download"
            onClick={(e) => {
              fileNodeClicked(files, 'download')(e, node);
            }}
          />
        </div>
      );
    }
    return null;
  };
}

function FileTreeNode(props: TreeNodeProps<any>) {
  const { node } = props;
  const { id } = node;
  const fileTreeContext = useFileTreeContext();
  const { selected, onSelect } = useContext(TreeContext);

  const href = fileTreeContext?.getHref?.(node);
  const widgets = fileTreeContext?.widgets;
  const icon = fileTreeContext?.getIcon?.(node);
  const path = getPathFromNode(id);
  const isBinary = isBinaryPath(path);

  if (!node?.children) {
    return (
      <Node
        {...props}
        className={isBinary && styles.link}
        onClick={onSelect && ((e) => onSelect(node.id, e))}
        href={href}
        isActive={node?.id === selected}
        icon={icon}
        widgets={widgets}
      />
    );
  }
  return <FolderTreeNode {...props} />;
}
