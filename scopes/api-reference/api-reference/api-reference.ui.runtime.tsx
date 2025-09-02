import React from 'react';
import { flatten } from 'lodash';
import type { ComponentUI } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { APIRefPage } from '@teambit/api-reference.sections.api-reference-page';
import { APIRefSection } from '@teambit/api-reference.sections.api-reference-section';
import type { Harmony, SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { defaultNodeRenderers } from '@teambit/api-reference.renderers.default-node-renderers';
import { APIRefRenderersProvider } from '@teambit/api-reference.hooks.use-api-renderers';
import type { SchemaNodeConstructor } from '@teambit/semantics.entities.semantic-schema';
import { SchemaRegistry, Schemas } from '@teambit/semantics.entities.semantic-schema';
import type { CodeUI } from '@teambit/code';
import { CodeAspect } from '@teambit/code';
import { TaggedExports } from '@teambit/tagged-exports';
import type { WorkspaceUI } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';

import { APIReferenceAspect } from './api-reference.aspect';

export type APINodeRendererSlot = SlotRegistry<APINodeRenderer[]>;
export class APIReferenceUI {
  constructor(
    private host: string,
    private apiNodeRendererSlot: APINodeRendererSlot,
    private code: CodeUI,
    private workspace: WorkspaceUI
  ) {}

  static dependencies = [ComponentAspect, CodeAspect, WorkspaceAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<APINodeRenderer[]>()];

  getAPIPage() {
    const EditorProvider = this.code.getCodeEditorProvider();
    return (
      <EditorProvider>
        <APIRefPage host={this.host} rendererSlot={this.apiNodeRendererSlot} />
      </EditorProvider>
    );
  }

  TaggedAPIPage = ({ componentId }: { componentId: string }) => {
    return (
      <APIRefRenderersProvider nodeRenderers={flatten(this.apiNodeRendererSlot.values())}>
        <TaggedExports componentId={componentId} showBanner={Boolean(this.workspace)} />
      </APIRefRenderersProvider>
    );
  };

  /**
   * @deprecated use registerSchemaClasses instead
   * registerSchemaClasses is better for performance as it lazy-loads the schemas.
   */
  registerSchemaClass(schema: SchemaNodeConstructor) {
    SchemaRegistry.register(schema);
  }

  registerSchemaClasses(getSchemas: () => SchemaNodeConstructor[]) {
    SchemaRegistry.registerGetSchemas(getSchemas);
  }

  registerAPINodeRenderer(apiNodeRenderers: APINodeRenderer[]) {
    this.apiNodeRendererSlot.register(apiNodeRenderers);
  }

  apiNodeRenderers = defaultNodeRenderers;

  static async provider(
    [componentUI, codeUI, workspaceUI]: [ComponentUI, CodeUI, WorkspaceUI],
    _,
    [apiNodeRendererSlot]: [APINodeRendererSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const apiReferenceUI = new APIReferenceUI(host, apiNodeRendererSlot, codeUI, workspaceUI);
    apiReferenceUI.registerAPINodeRenderer(apiReferenceUI.apiNodeRenderers);
    const apiReferenceSection = new APIRefSection(apiReferenceUI);
    componentUI.registerNavigation(apiReferenceSection.navigationLink, apiReferenceSection.order);
    componentUI.registerRoute(apiReferenceSection.route);
    // register all default schema classes
    apiReferenceUI.registerSchemaClasses(() => Object.values(Schemas));

    return apiReferenceUI;
  }
}

export default APIReferenceUI;

APIReferenceAspect.addRuntime(APIReferenceUI);
