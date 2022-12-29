import React from 'react';
import classnames from 'classnames';
import type { ComponentModel } from '@teambit/component';
import type { Composition } from '@teambit/compositions';
import { Icon } from '@teambit/evangelist.elements.icon';
import { ComponentComposition } from '@teambit/compositions';
import styles from './composition-card.module.scss';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';

export type CompositionCardProps = {
  component: ComponentModel;
  composition: Composition;
  openCompositionLink?: string;
  previewClass?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function CompositionCard({
  composition,
  component,
  className,
  openCompositionLink,
  previewClass,
  ...rest
}: CompositionCardProps) {
  return (
    <div {...rest} key={composition.identifier} className={classnames(styles.compositionCard, className)}>
      <div className={styles.compositionPreview}>
        <ComponentComposition
          loading="lazy"
          className={previewClass}
          composition={composition}
          component={component}
          pubsub={false}
        />
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
