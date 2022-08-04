import React, { HTMLAttributes, useState, useMemo } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import flatten from 'lodash.flatten';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { useComponentPipelineContext, ArtifactFile } from '@teambit/component.ui.component-pipeline';
import { useLocation } from '@teambit/base-react.navigation.link';
import { getFileIcon, FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import type { FileIconSlot } from '@teambit/code';
import { TreeNode } from '@teambit/design.ui.tree';

import styles from './artifacts-panel.module.scss';

export type ArtifactsPanelProps = {
  fileIconSlot?: FileIconSlot;
} & HTMLAttributes<HTMLDivElement>;

export function ArtifactPanel({ className, fileIconSlot }: ArtifactsPanelProps) {
  const [drawerOpen, onToggleDrawer] = useState(true);
  const componentPipelineContext = useComponentPipelineContext();
  const location = useLocation();
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);

  if (!componentPipelineContext) return null;

  const { pipeline, selectedPipelineId } = componentPipelineContext;
  const { artifact, name: taskName } = pipeline.find((task) => task.id === selectedPipelineId) || {};
  const { name, files } = artifact || {};
  const artifactFiles = files?.map((file) => file.name) || [];
  const currentHref = location?.pathname || '';

  return (
    <div className={classNames(styles.artifactsPanel, className)}>
      <DrawerUI
        isOpen={drawerOpen}
        onToggle={() => onToggleDrawer((open) => !open)}
        name={`${taskName} / ${name}`}
        contentClass={styles.artifactsPanelCodeDrawerContent}
        className={classNames(styles.artifactsPanelCodeTabDrawer)}
      >
        <FileTree
          className={styles.artifactsPanelTree}
          getIcon={useMemo(() => generateIcon(fileIconMatchers), fileIconMatchers)}
          getHref={() => currentHref}
          files={artifactFiles}
          widgets={useMemo(() => [generateWidget(files || [])], [files])}
        />
      </DrawerUI>
    </div>
  );
}

function generateIcon(fileIconMatchers: FileIconMatch[]) {
  return function GetIcon({ id }: TreeNode) {
    return getFileIcon(fileIconMatchers, id);
  };
}

const fileNodeClicked = (files, opts: 'download' | 'new tab') => (_, node) => {
  const { id } = node;
  const artifactFile = files?.find((file) => file.name === id);

  if (artifactFile?.downloadUrl) {
    fetch(artifactFile.downloadUrl, { method: 'GET' })
      .then((res) => res.blob())
      .then((blob) => {
        // create blob link to download
        const url = window.URL.createObjectURL(new Blob([blob]));
        const link = document.createElement('a');
        link.href = url;
        if (opts === 'download') link.setAttribute('download', artifactFile.path);
        if (opts === 'new tab') link.setAttribute('target', '_blank');
        // append to html page
        document.body.appendChild(link);
        // force download
        link.click();
        // clean up and remove the link
        link.parentNode?.removeChild(link);
      })
      .catch(() => {});
  }
};

function generateWidget(files: ArtifactFile[]) {
  return function Widget({ node }: WidgetProps<any>) {
    const fileName = node?.id;
    const artifactFile = files.find((file) => file.name === fileName);
    if (artifactFile) {
      return (
        <div className={styles.artiactWidgets}>
          <Icon className={styles.icon} of="open-tab" onClick={(e) => fileNodeClicked(files, 'new tab')(e, node)} />
          <Icon className={styles.icon} of="download" onClick={(e) => fileNodeClicked(files, 'download')(e, node)} />
        </div>
      );
    }
    return null;
  };
}
