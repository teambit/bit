import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { PropTable } from '@teambit/documenter.ui.property-table';
import { Section } from '@teambit/documenter.ui.section';
import { AddingProperties } from '@teambit/instructions.adding-properties';
import { MdxPage } from '@teambit/ui.mdx-page';
import React from 'react';

export function Properties({ properties }: any) {
  if (properties.length === 0)
    return (
      <MdxPage>
        <AddingProperties />
      </MdxPage>
    );

  return (
    <Section>
      <LinkedHeading>Properties</LinkedHeading>
      <PropTable rows={properties} />
    </Section>
  );
}
