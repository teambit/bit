import React from 'react';
import { useNavigate } from '@teambit/base-react.navigation.link';
import { ApplyProviders } from '@teambit/react.ui.docs.apply-providers';
import { CompositionsOverview } from '@teambit/compositions.ui.compositions-overview';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import { RenderingContext } from '@teambit/preview';
import { ComponentModel } from '@teambit/component';
import { ComponentComposition } from '@teambit/compositions';
import styles from './compositions-carousel.module.scss';

export interface CompositionsCarouselProps extends SectionProps {
  component?: ComponentModel;
  compositions?: {};
  compositionCardClass?: string;
  renderingContext?: RenderingContext;
}

export function CompositionsCarousel({
  compositions,
  component,
  compositionCardClass,
  renderingContext,
  ...rest
}: CompositionsCarouselProps) {
  const navigate = useNavigate();
  if (!component && (!compositions || Object.keys(compositions).length === 0)) {
    return null;
  }

  if (component && component.compositions.length === 0) {
    return <></>;
  }

  return (
    <Section {...rest}>
      <LinkedHeading>Compositions</LinkedHeading>
      {!component && renderingContext && (
        <ApplyProviders renderingContext={renderingContext}>
          <CompositionsOverview compositions={compositions} compositionCardClass={compositionCardClass} />
        </ApplyProviders>
      )}
      {component && (
        <div className={styles.carousel}>
          {component.compositions.map((composition) => {
            return (
              <div key={composition.identifier} className={styles.compositionCard} onClick={() => navigate(`~compositions/${composition.identifier.toLowerCase()}`)}>
                <div className={styles.compositionPreview}>
                  <ComponentComposition composition={composition} component={component} pubsub={false} />
                  <div className={styles.previewOverlay} />
                </div>
                <div>{composition.displayName}</div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
