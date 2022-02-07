import React, { useState } from 'react';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { LoadPreview } from '@teambit/workspace.ui.load-preview';
import { LaneComponentModel } from '@teambit/lanes.lanes.ui';
import styles from './lane-component-card.module.scss';

export type LaneComponentCardProps = {
  component: LaneComponentModel;
} & React.HTMLAttributes<HTMLDivElement>;

export function LaneComponentCard({ component, ...rest }: LaneComponentCardProps) {
  const [shouldShowPreview, togglePreview] = useState(false);
  const showPreview = () => {
    if (!shouldShowPreview) {
      togglePreview(true);
    }
  };
  const componentModel = component.model;
  const shouldPreviewButton = !shouldShowPreview && componentModel.compositions.length > 0;
  const componentVersion = componentModel.version === 'new' ? undefined : componentModel.version;
  return (
    <div {...rest} className={styles.wrapper}>
      <ComponentCard
        id={componentModel.id.fullName}
        overrideInternalLink={component.url}
        envIcon={componentModel.environment?.icon}
        description={componentModel.description}
        version={componentVersion}
        preview={<PreviewPlaceholder component={componentModel} shouldShowPreview={shouldShowPreview} />}
      />
      {shouldPreviewButton && <LoadPreview onClick={showPreview} />}
    </div>
  );
}
