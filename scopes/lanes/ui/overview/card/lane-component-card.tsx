import React, { useState } from 'react';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { ComponentModel } from '@teambit/component';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { LoadPreview } from '@teambit/workspace.ui.load-preview';
import styles from './lane-component-card.module.scss';

export type LaneComponentCardProps = {
  component: ComponentModel;
} & React.HTMLAttributes<HTMLDivElement>;

export function LaneComponentCard({ component, ...rest }: LaneComponentCardProps) {
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
        overrideInternalLink={`/${component.id.fullName}?version=${component.id.version}`}
        envIcon={component.environment?.icon}
        description={component.description}
        version={componentVersion}
        preview={<PreviewPlaceholder component={component} shouldShowPreview={shouldShowPreview} />}
      />
      {shouldPreviewButton && <LoadPreview onClick={showPreview} />}
    </div>
  );
}
