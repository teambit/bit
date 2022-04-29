import ComponentAspect from '@teambit/component/component.aspect';
import ComponentUI from '@teambit/component/component.ui.runtime';
import { OrderedNavigationSlot } from '@teambit/component/ui/menu';
import { Slot } from '@teambit/harmony';
import ScopeAspect from '@teambit/scope';
import { UIRuntime } from '@teambit/ui';
import { NavigationSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import WorkspaceAspect from '@teambit/workspace';
import { ComponentCompareAspect } from './component-compare.aspect';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { ComponentCompareSection } from './component-compare.section';

export class ComponentCompareUI {
  constructor(private componentUi: ComponentUI, private navSlot: OrderedNavigationSlot) {}

  static runtime = UIRuntime;

  static slots = [Slot.withType<NavigationSlot>()];

  static dependencies = [ComponentAspect, WorkspaceAspect, ScopeAspect];

  registerNavigation(nav: NavLinkProps, order?: number) {
    this.navSlot.register({
      props: nav,
      order,
    });
  }

  static async provider([componentUi]: [ComponentUI], _, [navSlot]: [OrderedNavigationSlot]) {
    const componentCompareUI = new ComponentCompareUI(componentUi, navSlot);
    const componentCompareSection = new ComponentCompareSection();
    componentUi.registerRoute([componentCompareSection.route]);
    componentUi.registerWidget(componentCompareSection.navigationLink, componentCompareSection.order);
    return componentCompareUI;
  }
}

ComponentCompareAspect.addRuntime(ComponentCompareUI);
