import React, { useState } from 'react';
import { ComponentCard } from '@teambit/ui.gallery.component-card';
import { ComponentModel } from '@teambit/component';
import { PreviewPlaceholder } from '@teambit/ui.preview-placeholder';
import { LoadPreview } from '@teambit/ui.load-preview';
import styles from './workspace-component-card.module.scss';

export type WorkspaceComponentCardProps = {
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
  const componentVersion = component.version === 'new' ? undefined : component.version;
  return (
    <div {...rest} className={styles.wrapper}>
      <ComponentCard
        id={component.id.fullName}
        envIcon={component.environment?.icon}
        description={component.description}
        version={componentVersion}
        preview={<PreviewPlaceholder component={component} shouldShowPreview={shouldShowPreview} />}
      />
      {shouldPreviewButton && <LoadPreview onClick={showPreview} />}
    </div>
  );
}
