import React from 'react';
import classnames from 'classnames';
import type { ComponentModel } from '@teambit/component';
import type { Composition } from '@teambit/compositions';
import { Icon } from '@teambit/evangelist.elements.icon';
import { ComponentComposition } from '@teambit/compositions';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import styles from './composition-card.module.scss';

export type CompositionCardProps = {
  component: ComponentModel;
  composition: Composition;
  openCompositionLink?: string;
  previewClass?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export const CompositionCard = React.memo(_CompositionCard);

function _CompositionCard({
  composition,
  component,
  className,
  openCompositionLink,
  previewClass,
  ...rest
}: CompositionCardProps) {
  const Composition = React.useMemo(() => {
    return (
      <ComponentComposition
        disableScroll
        className={previewClass}
        includeEnv={false}
        loading={'lazy'}
        composition={composition}
        component={component}
        viewport={1280}
        previewName="compositions"
      />
    );
  }, [composition.identifier, component.id.toString(), previewClass]);

  return (
    <div {...rest} key={composition.identifier} className={classnames(styles.compositionCard, className)}>
      <div className={styles.compositionPreview}>
        {Composition}
        <div className={styles.previewOverlay} />
      </div>
      <div className={styles.bottom}>
        <span className={classnames(ellipsis, styles.displayName)}>{composition.displayName}</span>
        {openCompositionLink && (
          <a className={styles.link} target="_blank" rel="noopener noreferrer" href={openCompositionLink}>
            <Icon className={styles.icon} of="open-tab" />
          </a>
        )}
      </div>
    </div>
  );
}
