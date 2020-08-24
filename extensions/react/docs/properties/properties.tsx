import { LinkedHeading } from '@teambit/documenter-temp.ui.linked-heading';
import { PropTable } from '@teambit/documenter-temp.ui.property-table';
import { Section } from '@teambit/documenter-temp.ui.section';
import React from 'react';

export function Properties({ properties }: any) {
  if (properties.length === 0) return <div></div>;

  return (
    <Section>
      <LinkedHeading link="/~compositions">Properties</LinkedHeading>
      <PropTable rows={properties} />
    </Section>
  );
}
