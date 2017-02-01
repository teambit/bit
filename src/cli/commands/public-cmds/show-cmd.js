/** @flow */
import Command from '../../command';
import { getInlineBit, getScopeBit } from '../../../api/consumer';
import { tablizeComponent } from '../../chalk-box';
import ConsumerComponent from '../../../consumer/component';

export default class Show extends Command {
  name = 'show <id>';
  description = 'show a component';
  alias = '';
  opts = [
    ['i', 'inline', 'show inline component']
  ];
  loader = { autoStart: false, text: 'fetching remote component' };

  action([id, ]: [string], { inline }: { inline: ?bool}): Promise<*> {
    const loader = this.loader;
    
    function getBitComponent() {
      if (inline) return getInlineBit({ id });
      return getScopeBit({ id, loader });
    }
    
    return getBitComponent();
  }

  report(component: ?ConsumerComponent): string {
    if (!component) return 'could not find the requested component';
    return tablizeComponent(component);
  }
}
