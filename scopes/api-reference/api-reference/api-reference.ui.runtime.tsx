import React from 'react';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { SchemaPage } from '@teambit/api-reference.sections.api-reference-page';
import { APIRefSection } from '@teambit/api-reference.sections.api-reference-section';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { classRenderer } from '@teambit/api-reference.renderers.class';
import { interfaceRenderer } from '@teambit/api-reference.renderers.interface';
import { typeRenderer } from '@teambit/api-reference.renderers.type';
import { functionRenderer } from '@teambit/api-reference.renderers.function';
import { enumRenderer } from '@teambit/api-reference.renderers.enum';
import { variableRenderer } from '@teambit/api-reference.renderers.variable';

import { APIReferenceAspect } from './api-reference.aspect';

export type APINodeRendererSlot = SlotRegistry<APINodeRenderer[]>;
export class APIReferenceUI {
  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<APINodeRenderer[]>()];

  getAPIPage() {
    return <SchemaPage host={this.host} />;
  }

  apiNodeRenderers: APINodeRenderer[] = [
    classRenderer,
    typeRenderer,
    interfaceRenderer,
    variableRenderer,
    functionRenderer,
    enumRenderer,
  ];

  static async provider(
    [componentUI]: [ComponentUI],
    _,
    [apiNodeRendererSlot]: [APINodeRendererSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const schemaUI = new APIReferenceUI(host, apiNodeRendererSlot);
    schemaUI.registerAPINodeRenderer(schemaUI.apiNodeRenderers);
    const schemaSection = new APIRefSection(schemaUI);
    componentUI.registerNavigation(schemaSection.navigationLink, schemaSection.order);
    componentUI.registerRoute(schemaSection.route);
    return schemaUI;
  }

  registerAPINodeRenderer(apiNodeRenderers: APINodeRenderer[]) {
    this.schemaNodeRendererSlot.register(apiNodeRenderers);
  }

  constructor(private host: string, private schemaNodeRendererSlot: APINodeRendererSlot) {}
}

export default APIReferenceUI;

APIReferenceAspect.addRuntime(APIReferenceUI);
