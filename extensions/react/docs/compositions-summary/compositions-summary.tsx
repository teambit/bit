import { CompositionsOverview } from '@teambit/compositions';
import { LinkedHeading } from '@teambit/documenter-temp.ui.linked-heading';
import { Section } from '@teambit/documenter-temp.ui.section';
import React from 'react';

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
