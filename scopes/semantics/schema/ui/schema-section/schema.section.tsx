import { Section } from '@teambit/component';
import { SchemaUI } from '@teambit/schema';

export class SchemaSection implements Section {
  constructor(private schemaUi: SchemaUI) {}

  order = 100;

  route = {
    path: '~dependencies',
    element: this.schemaUi.getSchemaPage(),
  };

  navigationLink = {
    href: '~apireference',
    children: 'API Reference',
  };
}
