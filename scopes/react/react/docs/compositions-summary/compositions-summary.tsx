import { CompositionsOverview } from '@teambit/compositions';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import { CompositionsTip } from '@teambit/instructions.compositions-tip';
import { MdxPage } from '@teambit/ui.mdx-page';
import React from 'react';

export type CompositionsSummaryProps = {
  compositions: {};
} & SectionProps;

export function CompositionsSummary({ compositions, ...rest }: CompositionsSummaryProps) {
  if (!compositions || Object.keys(compositions).length === 0) {
    return (
      <MdxPage>
        <CompositionsTip />
      </MdxPage>
    );
  }

  return (
    <Section {...rest}>
      <LinkedHeading>Compositions</LinkedHeading>
      <CompositionsOverview compositions={compositions} />
    </Section>
  );
}
