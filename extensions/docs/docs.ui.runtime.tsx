import PubsubAspect, { PubsubUI, BitBaseEvent } from '@teambit/pubsub';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';

import { ClickInsideAnIframeEvent } from './events';
import { DocsAspect } from './docs.aspect';
import { OverviewSection } from './overview.section';

export class DocsUI {

  constructor(
    /**
     * pubsub extension.
     */
    private pubsub: PubsubUI
  ) {
    // pubsub(sub) usage example
    this.pubsub.sub(DocsAspect.id, (be: BitBaseEvent<any>) => {
      switch(be.type) {
        case ClickInsideAnIframeEvent.TYPE:
          console.log('Click Inside an IFrame', be);
          const body = document.querySelector('body');
          const _backgroundColor = body?.style.backgroundColor || 'coral';
          
          const new_backgroundColor = _backgroundColor == 'coral' ? 'lemonchiffon' : 'coral';

          if(body){
            body.style.backgroundColor = new_backgroundColor;
          }
          break;
      }

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
