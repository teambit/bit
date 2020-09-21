import PubsubAspect, { PubsubUI, BitBaseEvent } from '@teambit/pubsub';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';

import { DocsAspect } from './docs.aspect';
import { OverviewSection } from './overview.section';

export class DocsUI {
  constructor(
    /**
     * pubsub extension.
     */
    private pubsub: PubsubUI
  ) {
    window.location !== window.parent.location ? console.log('DocsUI - IFRAME') : console.log('DocsUI - Not IFRAME');

    this.pubsub.sub(DocsAspect.id, (be: BitBaseEvent) => {
      console.log('Click Inside an IFrame', be);
    });
  }

  static dependencies = [PubsubAspect, ComponentAspect];

  static runtime = UIRuntime;

  static async provider([pubsub, component]: [PubsubUI, ComponentUI]) {
    const docs = new DocsUI(pubsub);
    const section = new OverviewSection(docs);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return docs;
  }
}

export default DocsUI;

DocsAspect.addRuntime(DocsUI);
