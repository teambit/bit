import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { SchemaAspect } from '.';

export class SchemaUI {
  static dependencies = [];
  static runtime = UIRuntime;
  static slots = [];
  static async provider([]: []) {}

  getSchemaRoutes() {}

  registerSchemaRoutes() {}

  registerSchemaNodeRenderer() {}

  constructor() {}
}

export default SchemaUI;

SchemaAspect.addRuntime(SchemaUI);
