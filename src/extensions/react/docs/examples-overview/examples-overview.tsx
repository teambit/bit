import React from 'react';
import { Section, SectionProps } from '@bit/bit.test-scope.ui.section';
import { LinkedHeading } from '@bit/bit.test-scope.ui.linked-heading';
import { Paragraph } from '@bit/bit.base-ui.text.paragraph';
import { Card } from '@bit/bit.base-ui.surfaces.card';
import { Playground, CodeScope } from '../playground';

import styles from './examples-overview.module.scss';
import classNames from 'classnames';

export type ExamplesOverviewProps = {
  examples: ExampleProps[];
};

export type ExampleProps = {
  code: string;
  scope: CodeScope;
  title?: string;
  description?: string;
};

export function ExamplesOverview({ examples, ...rest }: ExamplesOverviewProps) {
  if (examples.length <= 0) return null;

  return (
    <>
      {examples.map((example, idx) => (
        <ExampleSection key={idx} example={example} />
      ))}
    </>
  );
}

export type ExampleSectionProps = {
  example: ExampleProps;
} & SectionProps;

function ExampleSection({ example, className, ...rest }: ExampleSectionProps) {
  return (
    <Section {...rest} className={classNames(className, styles.exampleSection)}>
      {example.title && <LinkedHeading link="/~compositions">{example.title}</LinkedHeading>}
      {example.description && <Paragraph>{example.description}</Paragraph>}
      <Playground code={example.code} scope={example.scope} />
    </Section>
  );
}
