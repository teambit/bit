import ComponentAspect, { ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { SchemaPage } from '@teambit/semantics.ui.pages.schema-page';
import { SchemaSection } from '@teambit/semantics.ui.schema-section';
import { SchemaAspect } from '.';

export class SchemaUI {
  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static slots = [];

  getSchemaPage() {
    return SchemaPage;
  }

  static async provider([componentUI]: [ComponentUI]) {
    const schemaUI = new SchemaUI(componentUI);
    const schemaSection = new SchemaSection(schemaUI);
    componentUI.registerNavigation(schemaSection.navigationLink, schemaSection.order);
    componentUI.registerRoute(schemaSection.route);
    return schemaUI;
  }

  registerSchemaNodeRenderer() {}

  constructor(private componentUi: ComponentUI) {}
}

export default SchemaUI;

SchemaAspect.addRuntime(SchemaUI);
