import React from 'react';
import { Section } from '@bit/bit.test-scope.ui.section';
import { LinkedHeading } from '@bit/bit.test-scope.ui.linked-heading';
import { CompositionsOverview } from '../../../compositions/ui/compositions-overview';

export type CompositionsSummaryProps = {
  compositions: {};
};

export function CompositionsSummary({ compositions }: CompositionsSummaryProps) {
  if (!compositions || Object.keys(compositions).length === 0) {
    return <div></div>;
  }

  return (
    <Section>
      <LinkedHeading link="/~compositions">Compositions</LinkedHeading>
      <CompositionsOverview compositions={compositions} />
    </Section>
  );
}
