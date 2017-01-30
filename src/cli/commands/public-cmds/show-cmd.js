/** @flow */
import Command from '../../command';
import { getInlineBit, getScopeBit } from '../../../api/consumer';
import { paintBitProp, paintHeader, paintDoc } from '../../chalk-box';
import ConsumerComponent from '../../../consumer/component';

export default class Show extends Command {
  name = 'show <id>';
  description = 'show a bit';
  alias = '';
  opts = [
    ['i', 'inline', 'show inline bit']
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
    if (!component) return 'could not find the requested bit';
    const { name, box, compilerId, testerId, dependencies, packageDependencies, docs } = component;

    return paintHeader(`${box}/${name}`) +
      paintBitProp('compiler', compilerId === 'none' ? '' : compilerId) +
      paintBitProp('tester', testerId === 'none' ? '' : testerId) +
      paintBitProp('dependencies', dependencies.map(id => id.toString()).join(', ')) +
      paintBitProp('packageDependencies', Object.keys(packageDependencies).join(', ')) +
      paintBitProp('docs', docs.map(paintDoc).join('\n'));
  }
}
