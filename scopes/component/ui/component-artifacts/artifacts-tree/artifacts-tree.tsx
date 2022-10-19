import React, { HTMLAttributes, useMemo, useState, useContext } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { WidgetProps, TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree, useFileTreeContext } from '@teambit/ui-foundation.ui.tree.file-tree';
import { useComponentArtifacts } from '@teambit/component.ui.artifacts.queries.use-component-artifacts';
import { useLocation } from '@teambit/base-react.navigation.link';
import { ArtifactFile } from '@teambit/component.ui.artifacts.models.component-artifacts-model';
import { TreeNode, TreeNodeProps } from '@teambit/design.ui.tree';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { ComponentTreeLoader } from '@teambit/design.ui.skeletons.sidebar-loader';
import { ComponentID } from '@teambit/component-id';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';
import { fileNodeClicked } from './artifact-file-node-clicked';

import styles from './artifacts-tree.module.scss';

export type ArtifactsTreeProps = {
  getIcon?: (node: TreeNode) => string | undefined;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  host: string;
  componentId: ComponentID;
  drawerName: string;
} & HTMLAttributes<HTMLDivElement>;

export function ArtifactsTree({
  getIcon,
  host,
  componentId,
  drawerName,
  drawerOpen,
  onToggleDrawer,
}: ArtifactsTreeProps) {
  const [selected, setSelected] = useState<string | undefined>();
  const location = useLocation();
  const { data: artifacts = [], loading } = useComponentArtifacts(host, componentId.toString());
  const hasArtifacts = artifacts.length > 0;

  const [files, artifactFilesTree] = useMemo(() => {
    const _files =
      (hasArtifacts &&
        artifacts.flatMap((artifact) =>
          artifact.files.map((file) => ({ ...file, id: `${artifact.taskName}/${artifact.name}/${file.path}` }))
        )) ||
      [];

    const _artifactFilesTree = _files.map((file) => file.id);
    return [_files, _artifactFilesTree];
  }, [artifacts]);

  const payloadMap =
    (hasArtifacts &&
      artifacts.reduce((accum, next) => {
        if (!accum.has(next.taskName)) accum.set(`${next.taskName}/`, { open: false });
        return accum;
      }, new Map<string, { open?: false }>())) ||
    new Map<string, { open?: false }>();

  const currentHref = location?.pathname || '';
  const getHref = () => currentHref;
  const widgets = useMemo(() => [generateWidget(files || [])], [files]);

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
          files={artifactFilesTree}
          widgets={widgets}
          payloadMap={payloadMap}
          TreeNode={FileTreeNode}
          selected={selected}
          onTreeNodeSelected={(id: string, e) => {
            setSelected(id);
            fileNodeClicked(files, 'new tab')(e, { id });
          }}
        />
      )}
    </DrawerUI>
  );
}

function generateWidget(files: (ArtifactFile & { id: string })[]) {
  return function Widget({ node }: WidgetProps<any>) {
    const id = node?.id;
    const artifactFile = files.find((file) => file.id === id);
    if (artifactFile) {
      return (
        <div className={styles.artifactWidgets}>
          {/* <Icon className={styles.icon} of="open-tab" onClick={(e) => fileNodeClicked(files, 'new tab')(e, node)} /> */}
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
  const fileTreeContext = useFileTreeContext();
  const { selected, onSelect } = useContext(TreeContext);

  const href = fileTreeContext?.getHref?.(node);
  const widgets = fileTreeContext?.widgets;
  const icon = fileTreeContext?.getIcon?.(node);

  if (!node?.children) {
    return (
      <Node
        {...props}
        className={styles.link}
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
