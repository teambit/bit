import { CompositionsOverview } from '@teambit/compositions';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import React from 'react';

export interface CompositionsSummaryProps extends SectionProps {
  compositions: {};
  compositionCardClass?: string;
}

export function CompositionsSummary({ compositions, compositionCardClass, ...rest }: CompositionsSummaryProps) {

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
