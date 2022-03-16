import React, { useMemo } from 'react';
import { ComponentComposition } from '@teambit/compositions';
import { ComponentModel } from '@teambit/component';
import { Icon } from '@teambit/design.elements.icon';
import { EnvIcon } from '@teambit/envs.ui.env-icon';

import styles from './preview-placeholder.module.scss';

const iconAspects = new Set(['teambit.harmony/aspect']);

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

  const name = component.id.toString();
  if (component.buildStatus === 'pending')
    return (
      <div className={styles.previewPlaceholder} data-tip="" data-for={name}>
        <Icon of="Ripple-processing" />
        <div>Processing preview</div>
      </div>
    );

  if (!component.compositions.length && iconAspects.has(component.environment?.id || '')) {
    return (
      <div className={styles.previewPlaceholder} data-tip="" data-for={name}>
        <EnvIcon component={component} className={styles.envIcon} />
      </div>
    );
  }

  if (shouldShowPreview) {
    return <ComponentComposition component={component} composition={selectedPreview} pubsub={false} />;
  }

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
