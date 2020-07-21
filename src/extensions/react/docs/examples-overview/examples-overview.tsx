import React from 'react';
import { Section } from '@bit/bit.test-scope.ui.section';
import { LinkedHeading } from '@bit/bit.test-scope.ui.linked-heading';
import { Card } from '@bit/bit.base-ui.surfaces.card';
import { Playground, CodeScope } from '../playground';

import styles from './examples-overview.module.scss';

export type ExamplesOverviewProps = {
  examples: ExampleProps[];
};

export type ExampleProps = {
  code: string;
  scope: CodeScope;
};

export function ExamplesOverview({ examples, ...rest }: ExamplesOverviewProps) {
  if (examples.length <= 0) return null;
  return (
    <Section {...rest}>
      <LinkedHeading link="/~compositions">Examples</LinkedHeading>
      <div className={styles.examples}>
        {examples.map((example, idx) => (
          <Card key={idx} className={styles.playCard} elevation="low">
            <Playground code={example.code} scope={example.scope} />
          </Card>
        ))}
      </div>
    </Section>
  );
}
