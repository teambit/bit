import React from 'react';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { SchemaPage } from '@teambit/semantics.schema.ui.schema-page';
import { SchemaSection } from '@teambit/semantics.schema.ui.schema-section';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { SchemaNodeRenderer } from '@teambit/semantics.schema.ui.models.schema-renderer';
import { SchemaAspect } from './schema.aspect';

export type SchemaNodeRendererSlot = SlotRegistry<SchemaNodeRenderer>;
export class SchemaUI {
  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<SchemaNodeRenderer>()];

  getSchemaPage() {
    return <SchemaPage host={this.host} />;
  }

  static async provider(
    [componentUI]: [ComponentUI],
    _,
    [schemaNodeRendererSlot]: [SchemaNodeRendererSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const schemaUI = new SchemaUI(host, schemaNodeRendererSlot);
    const schemaSection = new SchemaSection(schemaUI);
    componentUI.registerNavigation(schemaSection.navigationLink, schemaSection.order);
    componentUI.registerRoute(schemaSection.route);
    return schemaUI;
  }

  registerSchemaNodeRenderer(schemaNodeRenderer: SchemaNodeRenderer) {
    this.schemaNodeRendererSlot.register(schemaNodeRenderer);
  }

  constructor(private host: string, private schemaNodeRendererSlot: SchemaNodeRendererSlot) {}
}

export default SchemaUI;

SchemaAspect.addRuntime(SchemaUI);
