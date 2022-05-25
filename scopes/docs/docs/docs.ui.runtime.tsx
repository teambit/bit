import { ComponentAspect, ComponentUI } from '@teambit/component';
import { Slot } from '@teambit/harmony';
import type { TitleBadge } from '@teambit/component.ui.component-meta';
import { UIRuntime } from '@teambit/ui';

import { DocsAspect } from './docs.aspect';
import { OverviewSection } from './overview.section';
import { TitleBadgeSlot } from './overview';
import ComponentCompareAspect, { ComponentCompareUI } from '@teambit/component-compare';

export class DocsUI {
  constructor(readonly titleBadgeSlot: TitleBadgeSlot, private readonly componentCompareUI: ComponentCompareUI) {}

  /**
   * register a new title badge into the overview section of a component.
   */
  registerTitleBadge(...titleBadge: TitleBadge[]) {
    this.titleBadgeSlot.register(titleBadge);
    this.componentCompareUI.registerTitleBadge(titleBadge);
    return this;
  }

  /**
   * list all title badges registered.
   */
  listTitleBadges() {
    return this.titleBadgeSlot;
  }

  static dependencies = [ComponentAspect, ComponentCompareAspect];

  static runtime = UIRuntime;

  static slots = [Slot.withType<TitleBadge>()];

  static async provider([component, componentCompareUI]: [ComponentUI, ComponentCompareUI], config, [titleBadgeSlot]: [TitleBadgeSlot]) {
    const docs = new DocsUI(titleBadgeSlot, componentCompareUI);
    const section = new OverviewSection(docs);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return docs;
  }
}

export default DocsUI;

DocsAspect.addRuntime(DocsUI);
