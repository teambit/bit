import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { PropTable } from '@teambit/documenter.ui.property-table';
import { Section } from '@teambit/documenter.ui.section';
import { useFetchDocs } from '@teambit/component.ui.hooks.use-fetch-docs';
import React from 'react';

export function Properties({ componentId }: any) {

  const { loading, error, data } = useFetchDocs(componentId);

  if (!data || loading) return null;
  if (error) throw error;

  const { properties } = data.docs;

  if (properties.length === 0) return <div></div>;

  return (
    <Section>
      <LinkedHeading>Properties</LinkedHeading>
      <PropTable rows={properties} />
    </Section>
  );
}
