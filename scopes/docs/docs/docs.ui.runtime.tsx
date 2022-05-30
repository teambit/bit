import { ComponentAspect, ComponentUI } from '@teambit/component';
import { Slot } from '@teambit/harmony';
import type { TitleBadge } from '@teambit/component.ui.component-meta';
import { UIRuntime } from '@teambit/ui';
import ComponentCompareAspect, { ComponentCompareUI } from '@teambit/component-compare';

import { DocsAspect } from './docs.aspect';
import { OverviewSection } from './overview.section';
import { TitleBadgeSlot } from './overview';
import { OverviewCompareSection } from './docs.compare.section';

export class DocsUI {
  constructor(readonly titleBadgeSlot: TitleBadgeSlot) {}

  /**
   * register a new title badge into the overview section of a component.
   */
  registerTitleBadge(...titleBadge: TitleBadge[]) {
    this.titleBadgeSlot.register(titleBadge);
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

  static async provider(
    [component, componentCompare]: [ComponentUI, ComponentCompareUI],
    config,
    [titleBadgeSlot]: [TitleBadgeSlot]
  ) {
    const docs = new DocsUI(titleBadgeSlot);
    const section = new OverviewSection(docs);
    const compareSection = new OverviewCompareSection(titleBadgeSlot);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);
    componentCompare.registerNavigation({
      props: { ...compareSection.navigationLink },
      order: compareSection.navigationLink.order,
    });
    componentCompare.registerRoutes([compareSection.route]);
    return docs;
  }
}

export default DocsUI;

DocsAspect.addRuntime(DocsUI);
