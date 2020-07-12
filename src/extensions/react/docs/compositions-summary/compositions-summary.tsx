import React from 'react';
import { Section } from '@bit/bit.test-scope.ui.section';
import { LinkedHeading } from '@bit/bit.test-scope.ui.linked-heading';
import { CompositionsOverview } from '../../../compositions/ui/compositions-overview';
import spacing from '../docs-spacer.module.scss';

export type CompositionsSummaryProps = {
  compositions: {};
};

export function CompositionsSummary({ compositions }: CompositionsSummaryProps) {
  if (!compositions || Object.keys(compositions).length === 0) {
    return <div></div>;
  }

  return (
    <Section>
      <LinkedHeading link="/~compositions" className={spacing.secondaryTitleMargin}>
        Compositions
      </LinkedHeading>
      <CompositionsOverview compositions={compositions} />
    </Section>
  );
}
