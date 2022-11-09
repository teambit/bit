import React, { HTMLAttributes, useMemo, useContext } from 'react';
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
import { FILE_SIZE_THRESHOLD } from '.';
import { formatBytes } from './format-bytes';

import styles from './artifacts-tree.module.scss';

export type ArtifactsTreeProps = {
  getIcon?: (node: TreeNode) => string | undefined;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  drawerName: string;
  fileTree: string[];
  artifacts: Array<Artifact>;
  artifactFiles: Array<ArtifactFile & { id: string }>;
  loading?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function ArtifactsTree({
  getIcon,
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

  const payloadMap = useMemo(() => {
    const _payloadMap =
      (hasArtifacts &&
        artifacts.reduce((accum, next) => {
          if (!accum.has(next.taskName)) accum.set(`${next.taskName}/`, { open: false });
          return accum;
        }, new Map<string, { open?: boolean }>())) ||
      new Map<string, { open?: boolean }>();
    if (artifactDetailsFromUrl) {
      _payloadMap.set(`${artifactDetailsFromUrl.taskName}/`, { open: true });
      _payloadMap.set(`${artifactDetailsFromUrl.taskName}/${artifactDetailsFromUrl.artifactName}/`, { open: true });
      _payloadMap.set(
        `${artifactDetailsFromUrl.taskName}/${artifactDetailsFromUrl.artifactName}/${artifactDetailsFromUrl.artifactFile.path}`,
        { open: true }
      );
    }
    return _payloadMap;
  }, [loading, selected]);

  const currentHref = `${location?.pathname || ''}`;

  const getHref = useMemo(
    () => (node) => {
      const fileName = getFileNameFromNode(node.id);
      const matchingArtifactFile = artifactFiles.find((artifactFile) => artifactFile.id === node.id);
      const isBinary = isBinaryPath(fileName);
      if (!fileName || isBinary || (matchingArtifactFile?.size ?? 0) > FILE_SIZE_THRESHOLD) return currentHref;
      return `~artifact/${node.id}${affix('?version=', urlParams.version)}`;
    },
    [fileTree]
  );

  const widgets = useMemo(() => [generateWidget(artifactFiles || [], selected)], [fileTree]);

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
          TreeNode={fileTreeNodeWithArtifactFiles(artifactFiles)}
          selected={selected}
          onTreeNodeSelected={(id: string, e) => {
            const matchingArtifactFile = artifactFiles.find((artifactFile) => artifactFile.id === id);
            if (!matchingArtifactFile) return;
            const fileName = getFileNameFromNode(id);
            if (isBinaryPath(fileName) || matchingArtifactFile.size > FILE_SIZE_THRESHOLD)
              fileNodeClicked(artifactFiles, 'download')(e, { id });
          }}
        />
      )}
    </DrawerUI>
  );
}

function getFileNameFromNode(node: string) {
  const lastIndex = node.lastIndexOf('/');
  return node.slice(lastIndex + 1);
}

function generateWidget(files: (ArtifactFile & { id: string })[], selected?: string) {
  return function Widget({ node }: WidgetProps<any>) {
    const id = node.id;
    const artifactFile = files.find((file) => file.id === id);
    const path = getFileNameFromNode(id);
    const isBinary = isBinaryPath(path);
    const isSelected = selected === id;

    if (artifactFile) {
      return (
        <div className={styles.artifactWidgets}>
          <div className={classNames(styles.size, isSelected && styles.selected)}>{formatBytes(artifactFile.size)}</div>
          {!isBinary && artifactFile.size <= FILE_SIZE_THRESHOLD && (
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

function fileTreeNodeWithArtifactFiles(artifactFiles: Array<ArtifactFile & { id: string }>) {
  return function FileTreeNode(props: TreeNodeProps<any>) {
    const { node } = props;
    const { id } = node;
    const fileTreeContext = useFileTreeContext();
    const { selected, onSelect } = useContext(TreeContext);

    const href = fileTreeContext?.getHref?.(node);
    const widgets = fileTreeContext?.widgets;
    const icon = fileTreeContext?.getIcon?.(node);
    const path = getFileNameFromNode(id);
    const isBinary = isBinaryPath(path);
    const matchingArtifactFile = artifactFiles.find((artifactFile) => artifactFile.id === node.id);
    const isLink = isBinary || (matchingArtifactFile?.size ?? 0) > FILE_SIZE_THRESHOLD;

    if (!node?.children) {
      return (
        <Node
          {...props}
          className={classNames(isLink && styles.link)}
          onClick={onSelect && ((e) => onSelect(node.id, e))}
          href={href}
          isActive={node?.id === selected}
          icon={icon}
          widgets={widgets}
        />
      );
    }
    return <FolderTreeNode {...props} />;
  };
}
