import React, { HTMLAttributes, useState } from 'react';
import classNames from 'classnames';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { useComponentPipelineContext } from '@teambit/component.ui.component-pipeline';

import styles from './artifacts-panel.module.scss';

export type ArtifactsPanelProps = {} & HTMLAttributes<HTMLDivElement>;

export function ArtifactPanel({ className }: ArtifactsPanelProps) {
  const [drawerOpen, onToggleDrawer] = useState(true);
  const componentPipelineContext = useComponentPipelineContext();

  if (!componentPipelineContext) return null;

  const { pipeline, selectedPipelineId } = componentPipelineContext;
  const { name, files } = pipeline.find((task) => task.id === selectedPipelineId)?.artifact || {};
  const artifactFiles = files?.map((file) => file.name) || [];

  return (
    <div className={classNames(styles.artifactsPanel, className)}>
      <DrawerUI
        isOpen={drawerOpen}
        onToggle={() => onToggleDrawer((open) => !open)}
        name={name?.toUpperCase()}
        contentClass={styles.artifactsPanelCodeDrawerContent}
        className={classNames(styles.artifactsPanelCodeTabDrawer)}
      >
        <FileTree
          getHref={(node) => {
            return files?.find((a) => a.name === node.id)?.downloadUrl || '';
          }}
          files={artifactFiles}
        />
      </DrawerUI>
    </div>
  );
}
