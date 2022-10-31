import React from 'react';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { APIRefPage } from '@teambit/api-reference.sections.api-reference-page';
import { APIRefSection } from '@teambit/api-reference.sections.api-reference-section';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { classRenderer } from '@teambit/api-reference.renderers.class';
import { interfaceRenderer } from '@teambit/api-reference.renderers.interface';
import { typeRenderer } from '@teambit/api-reference.renderers.type';
import { functionRenderer } from '@teambit/api-reference.renderers.function';
import { enumRenderer } from '@teambit/api-reference.renderers.enum';
import { variableRenderer } from '@teambit/api-reference.renderers.variable';
import { unresolvedRenderer } from '@teambit/api-reference.renderers.unresolved';
import { typeRefRenderer } from '@teambit/api-reference.renderers.type-ref';
import { typeUnionRenderer } from '@teambit/api-reference.renderers.type-union';
import { typeIntersectionRenderer } from '@teambit/api-reference.renderers.type-intersection';
import { typeLiteralRenderer } from '@teambit/api-reference.renderers.type-literal';
import { parameterRenderer } from '@teambit/api-reference.renderers.parameter';
import { inferenceTypeRenderer } from '@teambit/api-reference.renderers.inference-type';

import WorkspaceAspect from '@teambit/workspace';

import { APIReferenceAspect } from './api-reference.aspect';

export type APINodeRendererSlot = SlotRegistry<APINodeRenderer[]>;
export class APIReferenceUI {
  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<APINodeRenderer[]>()];

  getAPIPage() {
    return <APIRefPage host={this.host} rendererSlot={this.apiNodeRendererSlot} />;
  }

  apiNodeRenderers: APINodeRenderer[] = [
    classRenderer,
    typeRenderer,
    interfaceRenderer,
    variableRenderer,
    functionRenderer,
    enumRenderer,
    unresolvedRenderer,
    typeRefRenderer,
    typeIntersectionRenderer,
    typeUnionRenderer,
    parameterRenderer,
    typeLiteralRenderer,
    inferenceTypeRenderer,
  ];

  static async provider(
    [componentUI]: [ComponentUI],
    _,
    [apiNodeRendererSlot]: [APINodeRendererSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const apiReferenceUI = new APIReferenceUI(host, apiNodeRendererSlot);
    if (host === WorkspaceAspect.id) {
      apiReferenceUI.registerAPINodeRenderer(apiReferenceUI.apiNodeRenderers);
      const apiReferenceSection = new APIRefSection(apiReferenceUI);
      componentUI.registerNavigation(apiReferenceSection.navigationLink, apiReferenceSection.order);
      componentUI.registerRoute(apiReferenceSection.route);
    }
    return apiReferenceUI;
  }

  registerAPINodeRenderer(apiNodeRenderers: APINodeRenderer[]) {
    this.apiNodeRendererSlot.register(apiNodeRenderers);
  }

  constructor(private host: string, private apiNodeRendererSlot: APINodeRendererSlot) {}
}

export default APIReferenceUI;

APIReferenceAspect.addRuntime(APIReferenceUI);
