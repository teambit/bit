/** @flow */
import Command from '../../command';
import { getInlineBit, getScopeBit } from '../../../api/consumer';
import { paintBitProp, paintHeader } from '../../chalk-box';
import { parser } from '../../../jsdoc';

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

    let component = {};
    
    return getBitComponent()
    .then((componentResult) => {
      component = componentResult;
      return parser.parse(component._impl.src);
    })
    .then(docs => ({
      name: component.name,
      box: component.box,
      compiler: component.compilerId,
      tester: component.testerId,
      dependencies: component.dependencies,
      packageDependencies: component.packageDependencies,
      docs
    }));
  }

  formatDoc(doc) {
    const params = doc.params.map(param => `${param.name} (${param.type})`).join(', ');
    const returns = `${doc.returns.description} (${doc.returns.type})`;
    return `name: ${doc.name}, description: ${doc.description}, params: ${params}, returns: ${returns}`;
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
      paintBitProp('doc', docs.map(this.formatDoc).join('\n'));
  }
}
