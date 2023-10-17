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
  parentRef?: React.RefObject<HTMLDivElement>;
} & React.HTMLAttributes<HTMLDivElement>;

export const CompositionCard = React.memo(_CompositionCard);

function _CompositionCard({
  composition,
  component,
  className,
  openCompositionLink,
  previewClass,
  isLoading = true,
  parentRef,
  ...rest
}: CompositionCardProps) {
  const [previewLoading, setLoading] = useState(isLoading);

  React.useEffect(() => {
    setLoading(isLoading);
  }, [isLoading]);

  const [isNearViewport, ref] = useNearViewport(parentRef);

  return (
    <div {...rest} ref={ref} key={composition.identifier} className={classnames(styles.compositionCard, className)}>
      <div className={styles.compositionPreview}>
        {!previewLoading && (
          <ComponentComposition
            onLoad={() => {
              setLoading(false);
            }}
            onError={() => {
              // we need to handle exceptions in ther iframe and what to show here
              setLoading(false);
            }}
            loading={isNearViewport ? 'eager' : 'lazy'}
            className={previewClass}
            composition={composition}
            component={component}
            pubsub={false}
          />
        )}
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

function useNearViewport(parentRef, offset = 800): [boolean, React.RefObject<HTMLDivElement>] {
  const [isNear, setIsNear] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const leftIsNear = rect.left >= 0 && rect.left <= window.innerWidth + offset;
      const rightIsNear = rect.right >= -offset && rect.right <= window.innerWidth;

      setIsNear(leftIsNear || rightIsNear);
    };

    if (parentRef.current) {
      parentRef.current.addEventListener('scroll', handleScroll, { passive: true });
    }

    handleScroll();

    return () => {
      if (parentRef.current) {
        parentRef.current.removeEventListener('scroll', handleScroll);
      }
    };
  }, [parentRef, offset]);

  return [isNear, ref];
}
