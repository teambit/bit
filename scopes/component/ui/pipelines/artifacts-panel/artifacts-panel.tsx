import React, { HTMLAttributes, useState, useMemo } from 'react';
import classNames from 'classnames';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { Icon } from '@teambit/evangelist.elements.icon';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { useComponentPipelineContext } from '@teambit/component.ui.pipelines.component-pipeline-context';
import { ArtifactFile } from '@teambit/component.ui.pipelines.component-pipeline-model';
import { useLocation } from '@teambit/base-react.navigation.link';
import { generateIcon } from '@teambit/code.ui.code-tab-page';
import { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';

import styles from './artifacts-panel.module.scss';

export type ArtifactsPanelProps = {
  fileIconMatchers: FileIconMatch[];
} & HTMLAttributes<HTMLDivElement>;

export function ArtifactPanel({ className, fileIconMatchers }: ArtifactsPanelProps) {
  const [drawerOpen, onToggleDrawer] = useState(true);
  const componentPipelineContext = useComponentPipelineContext();
  const location = useLocation();

  if (!componentPipelineContext) return null;

  const { pipeline, selectedPipelineId } = componentPipelineContext;
  const { artifact, taskName } = pipeline.find((task) => task.id === selectedPipelineId) || {};
  const { name, files } = artifact || {};
  const artifactFiles = files?.map((file) => file.path) || [];
  const currentHref = location?.pathname || '';
  const drawerName = `${taskName} ${name ? '/ '.concat(name) : ''}`;
  const onToggle = () => onToggleDrawer((open) => !open);
  const getIcon = useMemo(() => generateIcon(fileIconMatchers), [fileIconMatchers]);
  const getHref = () => currentHref;
  const widgets = useMemo(() => [generateWidget(files || [])], [files]);

  return (
    <div className={classNames(styles.artifactsPanel, className)}>
      <DrawerUI
        isOpen={drawerOpen}
        onToggle={onToggle}
        name={drawerName}
        contentClass={styles.artifactsPanelCodeDrawerContent}
        className={classNames(styles.artifactsPanelCodeTabDrawer)}
      >
        {artifactFiles.length > 0 && (
          <FileTree
            className={styles.artifactsPanelTree}
            getIcon={getIcon}
            getHref={getHref}
            files={artifactFiles}
            widgets={widgets}
          />
        )}
        {artifactFiles.length === 0 && (
          <EmptyBox
            className={className}
            title="No Artifacts produced for this task"
            linkText="Learn more about pipelines"
            link={`https://bit.dev/docs/dev-services/builder/build-pipelines`}
          />
        )}
      </DrawerUI>
    </div>
  );
}

const fileNodeClicked = (files: ArtifactFile[], opts: 'download' | 'new tab') => (_, node) => {
  const { id } = node;
  const artifactFile = files.find((file) => file.path === id);

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
    const filePath = node?.id;
    const artifactFile = files.find((file) => file.path === filePath);
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
