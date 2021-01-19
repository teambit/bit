import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import classNames from 'classnames';
import React from 'react';
import jsxToString from 'jsx-to-string';
import { Playground } from '@teambit/documenter.code.react-playground';
import styles from './examples-overview.module.scss';
import { Example } from './example';

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
  // @ts-ignore
  const code = example.jsx
    ? jsxToString(example.jsx, {
        useFunctionCode: true,
      })
    : example.code;

  return (
    <Section {...rest} className={classNames(className, styles.exampleSection)}>
      {example.title && <LinkedHeading>{example.title}</LinkedHeading>}
      {example.description && <div>{example.description}</div>}
      <Playground code={code} scope={example.scope} />
    </Section>
  );
}
