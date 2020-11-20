import { ComponentCard } from '@teambit/ui.gallery.component-card';
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
        description={component.description}
        preview={<PreviewPlaceholder component={component} shouldShowPreview={shouldShowPreview} />}
      />
      {shouldPreviewButton && <LoadPreview onClick={showPreview} />}
    </div>
  );
}

type LoadPreviewProps = {} & React.HTMLAttributes<HTMLDivElement>;

function LoadPreview({ onClick }: LoadPreviewProps) {
  return (
    <div className={classNames(styles.loadPreview)} onClick={onClick}>
      <Icon of="fat-arrow-down" className={styles.icon} />
      <span>Live preview</span>
    </div>
  );
}
