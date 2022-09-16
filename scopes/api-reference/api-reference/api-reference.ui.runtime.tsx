import React from 'react';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { SchemaPage } from '@teambit/api-reference.sections.api-reference-page';
import { SchemaSection } from '@teambit/api-reference.sections.api-reference-section';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { SchemaNodeRenderer } from '@teambit/api-reference.models.api-reference-renderer';
import { APIReferenceAspect } from './api-reference.aspect';

export type APINodeRendererSlot = SlotRegistry<SchemaNodeRenderer[]>;
export class APIReferenceUI {
  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<SchemaNodeRenderer>()];

  getAPIPage() {
    return <SchemaPage host={this.host} />;
  }

  static async provider(
    [componentUI]: [ComponentUI],
    _,
    [apiNodeRendererSlot]: [APINodeRendererSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const schemaUI = new APIReferenceUI(host, apiNodeRendererSlot);
    // schemaUI.registerSchemaNodeRenderer(schemaUI.schemas)
    const schemaSection = new SchemaSection(schemaUI);
    componentUI.registerNavigation(schemaSection.navigationLink, schemaSection.order);
    componentUI.registerRoute(schemaSection.route);
    return schemaUI;
  }

  registerAPINodeRenderer(apiNodeRenderers: SchemaNodeRenderer[]) {
    this.schemaNodeRendererSlot.register(apiNodeRenderers);
  }

  constructor(private host: string, private schemaNodeRendererSlot: APINodeRendererSlot) {}
}

export default APIReferenceUI;

APIReferenceAspect.addRuntime(APIReferenceUI);
