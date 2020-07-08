import React from 'react';
import { Section } from '@bit/bit.test-scope.ui.section';
import { LinkedHeading } from '@bit/bit.test-scope.ui.linked-heading';
import { CompositionsOverview } from '../../../compositions/ui/compositions-overview';
import spacing from '../docs-spacer.module.scss';

export function CompositionsSummary({ overviewCompositions }: any) {
  if (!overviewCompositions || Object.keys(overviewCompositions).length === 0) {
    return <div></div>;
  }

  return (
    <Section>
      <LinkedHeading link="/~compositions" className={spacing.secondaryTitleMargin}>
        Compositions
      </LinkedHeading>
      <CompositionsOverview compositions={overviewCompositions} />
    </Section>
  );
}
