import React from 'react';
import classNames from 'classnames';
import { Example } from '@teambit/documenter-temp.types.docs-file';
import { Section, SectionProps } from '@teambit/documenter-temp.ui.section';
import { LinkedHeading } from '@teambit/documenter-temp.ui.linked-heading';
import { Paragraph } from '@teambit/base-ui-temp.text.paragraph';
import { Playground } from '../playground';

import styles from './examples-overview.module.scss';

export type ExamplesOverviewProps = {
  examples: Example[];
};

export function ExamplesOverview({ examples, ...rest }: ExamplesOverviewProps) {
  if (examples.length <= 0) return null;

  return (
    <div {...rest}>
      {examples.map((example, idx) => (
        <ExampleSection key={idx} example={example} />
      ))}
    </div>
  );
}

export type ExampleSectionProps = {
  example: Example;
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
