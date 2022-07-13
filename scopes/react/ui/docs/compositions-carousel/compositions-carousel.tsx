import { CompositionsOverview } from '@teambit/compositions';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import React from 'react';

export interface CompositionsCarouselProps extends SectionProps {
  compositions: {};
  compositionCardClass?: string;
}

export function CompositionsCarousel({ compositions, compositionCardClass, ...rest }: CompositionsCarouselProps) {
  if (!compositions || Object.keys(compositions).length === 0) {
    return null;
  }

  return (
    <Section {...rest}>
      <LinkedHeading>Compositions</LinkedHeading>
      <CompositionsOverview compositions={compositions} compositionCardClass={compositionCardClass} />
    </Section>
  );
}
