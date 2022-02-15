import React, { useState } from 'react';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { ComponentModel } from '@teambit/component';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { LoadPreview } from '@teambit/workspace.ui.load-preview';
import styles from './workspace-component-card.module.scss';

export type WorkspaceComponentCardProps = {
  component: ComponentModel;
  componentUrl?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function WorkspaceComponentCard({ component, componentUrl, ...rest }: WorkspaceComponentCardProps) {
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
        href={componentUrl}
        envIcon={component.environment?.icon}
        description={component.description}
        version={componentVersion}
        preview={<PreviewPlaceholder component={component} shouldShowPreview={shouldShowPreview} />}
      />
      {shouldPreviewButton && <LoadPreview onClick={showPreview} />}
    </div>
  );
}
