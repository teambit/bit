import { CompositionsOverview } from '@teambit/compositions';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import React from 'react';

export type CompositionsSummaryProps = {
  compositions: {};
} & SectionProps;

export function CompositionsSummary({ compositions, ...rest }: CompositionsSummaryProps) {
  if (!compositions || Object.keys(compositions).length === 0) {
    return null;
  }

  return (
    <Section {...rest}>
      <LinkedHeading>Compositions</LinkedHeading>
      <CompositionsOverview compositions={compositions} />
    </Section>
  );
}
