import { ComponentComposition } from '@teambit/compositions';
import ReactTooltip from 'react-tooltip';
import { ComponentCard } from '@teambit/explorer.ui.component-card';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import React, { useState } from 'react';
import styles from './workspace-component-card.module.scss';
import { ComponentModel } from '@teambit/component';

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

function PreviewPlaceholder({
  component,
  shouldShowPreview,
}: {
  component: ComponentModel;
  shouldShowPreview: boolean;
}) {
  if (shouldShowPreview) {
    return <ComponentComposition component={component} hotReload={false} />;
  }
  const name = component.id.toString();
  return (
    <div className={styles.previewPlaceholder} data-tip="" data-for={name}>
      <Icon of="img" />
      <div>No preview available</div>
      <ReactTooltip className={styles.tooltip} place="bottom" id={name} effect="solid">
        Preview is generated from compositions during CI
      </ReactTooltip>
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
