import React from 'react';
import { ApplyProviders } from '@teambit/react.ui.docs.apply-providers';
import { CompositionsOverview } from '@teambit/compositions.ui.compositions-overview';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import { RenderingContext } from '@teambit/preview';

export interface CompositionsCarouselProps extends SectionProps {
  compositions: {};
  compositionCardClass?: string;
  renderingContext: RenderingContext;
}

export function CompositionsCarousel({
  compositions,
  compositionCardClass,
  renderingContext,
  ...rest
}: CompositionsCarouselProps) {
  if (!compositions || Object.keys(compositions).length === 0) {
    return null;
  }

  return (
    <Section {...rest}>
      <LinkedHeading>Compositions</LinkedHeading>
      <ApplyProviders renderingContext={renderingContext}>
        <CompositionsOverview compositions={compositions} compositionCardClass={compositionCardClass} />
      </ApplyProviders>
    </Section>
  );
}
