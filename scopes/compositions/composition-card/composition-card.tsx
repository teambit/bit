import React, { useState } from 'react';
import classnames from 'classnames';
import type { ComponentModel } from '@teambit/component';
import type { Composition } from '@teambit/compositions';
import { Icon } from '@teambit/evangelist.elements.icon';
import { ComponentComposition } from '@teambit/compositions';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { PreviewSkeleton } from './composition-card-skeleton';
import styles from './composition-card.module.scss';

export type CompositionCardProps = {
  component: ComponentModel;
  composition: Composition;
  openCompositionLink?: string;
  previewClass?: string;
  isLoading?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function CompositionCard({
  composition,
  component,
  className,
  openCompositionLink,
  previewClass,
  isLoading = true,
  ...rest
}: CompositionCardProps) {
  const [previewLoading, setLoading] = useState(isLoading);
  return (
    <div {...rest} key={composition.identifier} className={classnames(styles.compositionCard, className)}>
      <div className={styles.compositionPreview}>
        {!isLoading && <ComponentComposition
          onLoad={() => setLoading(false)}
          onError={() => {
            // we need to handle exceptions in ther iframe and what to show here
            setLoading(false)
          }}
          loading="lazy"
          className={previewClass}
          composition={composition}
          component={component}
          pubsub={false}
        />}
        <div className={styles.previewOverlay}>{previewLoading && <PreviewSkeleton />}</div>
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
