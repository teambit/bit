import { ComponentAspect, ComponentUI } from '@teambit/component';
import { PubsubAspect, PubsubUI } from '@teambit/pubsub';
import { UIRuntime } from '@teambit/ui';

import { CompositionsSection } from './composition.section';
import { CompositionsAspect } from './compositions.aspect';
import { ToggleHighlightEvent } from './toggle-highlight-event';

export class CompositionsUI {
  static dependencies = [ComponentAspect, PubsubAspect];

  static runtime = UIRuntime;

  static async provider([component, pubsubUI]: [ComponentUI, PubsubUI]) {
    const toggleHighlight = (active: boolean) => {
      const event = new ToggleHighlightEvent(active);
      pubsubUI.pubChild(ToggleHighlightEvent.topic, event);
    };

    const compositions = new CompositionsUI();
    const section = new CompositionsSection(compositions, { onToggleHighlight: toggleHighlight });

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return compositions;
  }
}

export default CompositionsUI;

CompositionsAspect.addRuntime(CompositionsUI);
