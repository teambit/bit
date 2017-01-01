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
    .then(bit => ({
      name: bit.getName(),
      box: bit.getBox(),
      version: bit.getVersion(),
      compiler: bit.bitJson.getCompilerName(),
      tester: bit.bitJson.getTesterName(),
      dependencies: bit.bitJson.getDependencies(),
      packageDependencies: bit.bitJson.getPackageDependencies(),
      path: bit.getPath()
    }));
  }

  report({ 
    name,
    box,
    version,
    compiler,
    dependencies,
    path,
    tester,
    packageDependencies,
  }: any): string {
    return paintHeader(`${box}/${name}`) +  
      paintBitProp('version', version) +
      paintBitProp('compiler', compiler === 'none' ? '' : compiler) +
      paintBitProp('tester', tester === 'none' ? '' : tester) +
      paintBitProp('dependencies', Object.keys(dependencies).join(', ')) +
      paintBitProp('packageDependencies', Object.keys(packageDependencies).join(', ')) +
      paintBitProp('path', path)
    ;
  }
}
