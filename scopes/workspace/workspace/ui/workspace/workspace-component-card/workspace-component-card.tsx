import { ComponentCard } from '@teambit/explorer.ui.component-card';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import React, { useState } from 'react';
import { ComponentModel } from '@teambit/component';
import { PreviewPlaceholder } from '@teambit/ui.preview-placeholder';
import styles from './workspace-component-card.module.scss';

type WorkspaceComponentCardProps = {
  component: ComponentModel;
} & React.HTMLAttributes<HTMLDivElement>;

export function WorkspaceComponentCard({ component, ...rest }: WorkspaceComponentCardProps) {
  const [shouldShowPreview, togglePreview] = useState(false);
  const showPreview = () => {
    if (!shouldShowPreview) {
      togglePreview(true);
    }
  };
  const shouldPreviewButton = !shouldShowPreview && component.compositions.length > 0;
  return (
    <div {...rest} className={styles.wrapper}>
      <ComponentCard
        id={component.id.fullName}
        envIcon={component.environment?.icon}
        preview={<PreviewPlaceholder component={component} shouldShowPreview={shouldShowPreview} />}
      />
      {shouldPreviewButton && (
        <LoadPreview onClick={showPreview} isModified={component.status?.modifyInfo?.hasModifiedFiles} />
      )}
    </div>
  );
}

type LoadPreviewProps = {
  isModified: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

function LoadPreview({ onClick, isModified }: LoadPreviewProps) {
  return (
    <div className={classNames(styles.loadPreview, isModified && styles.modified)} onClick={onClick}>
      <Icon of="fat-arrow-down" className={styles.icon} />
      <span>Live preview</span>
    </div>
  );
}
