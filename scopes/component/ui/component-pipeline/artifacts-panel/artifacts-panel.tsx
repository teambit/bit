import React, { HTMLAttributes, useState } from 'react';
import classNames from 'classnames';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { useComponentPipelineContext } from '@teambit/component.ui.component-pipeline';
import { useLocation } from '@teambit/base-react.navigation.link';

import styles from './artifacts-panel.module.scss';

export type ArtifactsPanelProps = {} & HTMLAttributes<HTMLDivElement>;

export function ArtifactPanel({ className }: ArtifactsPanelProps) {
  const [drawerOpen, onToggleDrawer] = useState(true);
  const componentPipelineContext = useComponentPipelineContext();
  const location = useLocation();

  if (!componentPipelineContext) return null;

  const { pipeline, selectedPipelineId } = componentPipelineContext;
  const { name, files } = pipeline.find((task) => task.id === selectedPipelineId)?.artifact || {};
  const artifactFiles = files?.map((file) => file.name) || [];
  const currentHref = location?.pathname || '';
  const fileNodeClicked = (_, node) => {
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
          link.setAttribute('download', artifactFile.path);
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

  return (
    <div className={classNames(styles.artifactsPanel, className)}>
      <DrawerUI
        isOpen={drawerOpen}
        onToggle={() => onToggleDrawer((open) => !open)}
        name={name?.toUpperCase()}
        contentClass={styles.artifactsPanelCodeDrawerContent}
        className={classNames(styles.artifactsPanelCodeTabDrawer)}
      >
        <FileTree getHref={() => currentHref} onNodeClicked={fileNodeClicked} files={artifactFiles} />
      </DrawerUI>
    </div>
  );
}
