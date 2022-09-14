import React, { useContext } from 'react';
import { ComponentContext } from '@teambit/component';
import { useSchema } from '@teambit/semantics.schema.hooks.use-schema';

export type SchemaPageProps = {
  host: string;
};

export function SchemaPage({ host }: SchemaPageProps) {
  const component = useContext(ComponentContext);
  useSchema(host, component.id.toString());
  return <div>Schema Page</div>;
}
