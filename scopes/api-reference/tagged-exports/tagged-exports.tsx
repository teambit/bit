import React from 'react';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';

export type TaggedExportsProps = {
  componentId: string;
} & React.HtmlHTMLAttributes<HTMLDivElement>;

export function TaggedExports({ componentId, ...rest }: TaggedExportsProps) {
  return (
    <Section {...rest}>
      <LinkedHeading>Properties</LinkedHeading>
      {/* <PropTable rows={properties} /> */}
    </Section>
  );
}
