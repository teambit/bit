import React from 'react';
import type { ComponentModel } from '@teambit/component';
import { Icon } from '@teambit/design.elements.icon';
import { useNavigate } from '@teambit/base-react.navigation.link';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { CompositionCard } from '@teambit/composition-card';
import styles from './composition-gallery.module.scss';


export function CompositionGallery({ component }: { component: ComponentModel }) {
  const navigate = useNavigate();
  return (
    <div className={styles.compositionGallery}>
      <LinkedHeading size="xs" className={styles.title}>
        <Icon of="eye" /> <span>PREVIEW</span>
      </LinkedHeading>
      <div className={styles.carousel}>
        {component.compositions.map((composition) => {
          return <CompositionCard key={composition.identifier.toLowerCase()} onClick={() => navigate(`~compositions/${composition.identifier.toLowerCase()}`)} className={styles.compositionCard} previewClass={styles.preview} composition={composition} component={component} />;
        })}
      </div>
    </div>
  );
}
