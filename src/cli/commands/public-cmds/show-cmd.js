/** @flow */
import Command from '../../command';
import { getInlineBit, getScopeBit } from '../../../api/consumer';
import { paintBitProp, paintHeader, paintDoc } from '../../chalk-box';

export default class Show extends Command {
  name = 'show <id>';
  description = 'show a bit';
  alias = '';
  opts = [
    ['i', 'inline', 'show inline bit']
  ];
  
  action([id, ]: [string], { inline }: { inline: ?bool}): Promise<*> {
    function getBitComponent() {
      if (inline) return getInlineBit({ id });
      return getScopeBit({ id });
    }
    
    return getBitComponent()
    .then((component) => {
      return ({
        name: component.name,
        box: component.box,
        compiler: component.compilerId,
        tester: component.testerId,
        dependencies: component.dependencies,
        packageDependencies: component.packageDependencies,
        docs: component.docs
      });
    });
  }

  report({ 
    name,
    box,
    compiler,
    dependencies,
    tester,
    packageDependencies,
    docs,
  }: any): string {
    return paintHeader(`${box}/${name}`) +
      paintBitProp('compiler', compiler === 'none' ? '' : compiler) +
      paintBitProp('tester', tester === 'none' ? '' : tester) +
      paintBitProp('dependencies', Object.keys(dependencies).join(', ')) +
      paintBitProp('packageDependencies', Object.keys(packageDependencies).join(', ')) +
      paintBitProp('docs', docs.map(paintDoc).join('\n'));
  }
}
