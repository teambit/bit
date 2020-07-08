import React from 'react';
import { Section } from '@bit/bit.test-scope.ui.section';
import { PropTable } from '@bit/bit.test-scope.ui.property-table';
import { LinkedHeading } from '@bit/bit.test-scope.ui.linked-heading';
import spacing from '../docs-spacer.module.scss';

export function Properties({ properties }: any) {
  if (properties.length === 0) return <div></div>;

  return (
    <Section>
      <LinkedHeading link="/~compositions" className={spacing.secondaryTitleMargin}>
        Properties
      </LinkedHeading>
      <PropTable headings={['name', 'type', 'defaultValue', 'description']} rows={properties} />
    </Section>
  );
}
