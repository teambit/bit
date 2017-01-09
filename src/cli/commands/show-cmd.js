/** @flow */
import Command from '../command';
import { getBit } from '../../api';
import { paintBitProp, paintHeader } from '../chalk-box';

export default class Show extends Command {
  name = 'show <id>';
  description = 'show a bit';
  alias = '';
  opts = [];
  
  action([id, ]: [string]): Promise<*> {
    return getBit({ id })
    .then(component => ({
      name: component.name,
      box: component.box,
      compiler: component.compilerId,
      tester: component.testerId,
      dependencies: component.dependencies,
      packageDependencies: component.packageDependencies,
    }));
  }

  report({ 
    name,
    box,
    compiler,
    dependencies,
    tester,
    packageDependencies,
  }: any): string {
    return paintHeader(`${box}/${name}`) +  
      paintBitProp('compiler', compiler === 'none' ? '' : compiler) +
      paintBitProp('tester', tester === 'none' ? '' : tester) +
      paintBitProp('dependencies', Object.keys(dependencies).join(', ')) +
      paintBitProp('packageDependencies', Object.keys(packageDependencies).join(', '));
  }
}
