import { Example } from '@teambit/documenter.types.docs-file';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import classNames from 'classnames';
import React from 'react';

import { Playground } from '@teambit/documenter.code.react-playground';
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
      {example.description && <div>{example.description}</div>}
      <Playground code={example.code} scope={example.scope} />
    </Section>
  );
}
