import React from 'react';
import type { ComponentModel } from '@teambit/component';
import { Icon } from '@teambit/design.elements.icon';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { useNavigate } from '@teambit/base-react.navigation.link';
import { CompositionCard } from '@teambit/composition-card';
import styles from './composition-gallery.module.scss';

export type CompositionGalleryProps = {
  component: ComponentModel;
  isLoading?: boolean;
};

export function CompositionGallery({ component, isLoading }: CompositionGalleryProps) {
  const navigate = useNavigate();
  return (
    <div className={styles.compositionGallery}>
      {/* TODO - @oded replace with panelCard */}
      <LinkedHeading size="xs" className={styles.title}>
        <Icon of="eye" /> <span>PREVIEW</span>
      </LinkedHeading>
      <div className={styles.carousel}>
        {component.compositions.map((composition) => {
          return (
            <CompositionCard
              isLoading={isLoading}
              key={composition.identifier.toLowerCase()}
              onClick={() => navigate(`~compositions/${composition.identifier.toLowerCase()}`)}
              className={styles.compositionGalleryCard}
              previewClass={styles.preview}
              composition={composition}
              component={component}
            />
          );
        })}
      </div>
    </div>
  );
}
