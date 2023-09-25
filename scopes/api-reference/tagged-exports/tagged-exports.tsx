import React from 'react';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';
import { useTaggedExports } from '@teambit/api-reference.hooks.use-tagged-exports';

export type TaggedExportsProp = {
  componentId: string;
} & React.HtmlHTMLAttributes<HTMLDivElement>;

export function TaggedExports({ componentId, ...rest }: TaggedExportsProp) {
  const { taggedExportsModel } = useTaggedExports(componentId);
  if (!taggedExportsModel) return null;
  // console.log("🚀 ~ file: tagged-exports.tsx:13 ~ TaggedExports ~ taggedExportsModel:", taggedExportsModel)

  return (
    <Section {...rest}>
      <LinkedHeading>Properties</LinkedHeading>
      {/* <PropTable rows={properties} /> */}
    </Section>
  );
}
