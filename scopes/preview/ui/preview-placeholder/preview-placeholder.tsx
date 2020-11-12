import React, { useMemo } from 'react';
import { ComponentComposition } from '@teambit/compositions';
import { Icon } from '@teambit/evangelist.elements.icon';
import { ComponentModel } from '@teambit/component';
import styles from './preview-placeholder.module.scss';

export function PreviewPlaceholder({
  component,
  shouldShowPreview,
}: {
  component: ComponentModel;
  shouldShowPreview: boolean;
}) {
  const selectedPreview = useMemo(() => {
    if (!shouldShowPreview) return undefined;
    return selectDefaultComposition(component);
  }, [component, shouldShowPreview]);

  if (shouldShowPreview) {
    return <ComponentComposition component={component} hotReload={false} composition={selectedPreview} />;
  }

  const name = component.id.toString();

  return (
    <div className={styles.previewPlaceholder} data-tip="" data-for={name}>
      <Icon of="img" />
      <div>No preview available</div>
    </div>
  );
}

const PREVIEW_COMPOSITION_SUFFIX = 'Preview';

function selectDefaultComposition(component: ComponentModel) {
  const { compositions } = component;

  return compositions.find((x) => x.identifier.endsWith(PREVIEW_COMPOSITION_SUFFIX));
}
