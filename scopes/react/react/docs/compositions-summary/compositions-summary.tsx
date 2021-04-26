import { CompositionsOverview } from '@teambit/compositions';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import { CompositionsTip } from '@teambit/instructions.compositions-tip';
import { MdxPage } from '@teambit/ui.mdx-page';
import { Link } from '@teambit/ui.routing.link';
import React from 'react';
import styles from './compositions-summary.module.scss';

export type CompositionsSummaryProps = {
  compositions: {};
  componentId: string;
} & SectionProps;

export function CompositionsSummary({ compositions, componentId, ...rest }: CompositionsSummaryProps) {
  if (!compositions || Object.keys(compositions).length === 0) {
    return (
      <MdxPage>
        <CompositionsTip />
        <Link href={`/${componentId}/~compositions`} external className={styles.link}>
          See the Compositions tab for more info
        </Link>
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
