import React from 'react';
import { Section } from '@bit/bit.test-scope.ui.section';
import { LinkedHeading } from '@bit/bit.test-scope.ui.linked-heading';
import { Playground } from '../playground';

export type ExamplesOverviewProps = {
  examples: ExampleProps[];
};

export type ExampleProps = {
  code: string;
  scope: string;
};

export function ExamplesOverview({ examples, ...rest }: ExamplesOverviewProps) {
  if (examples.length <= 0) return null;
  return (
    <Section {...rest}>
      {examples.length > 0 && <LinkedHeading link="/~compositions">Examples</LinkedHeading>}
      {examples.length > 0 && <Playground code={examples[0].code} scope={[examples[0].scope]} />}
    </Section>
  );
}
