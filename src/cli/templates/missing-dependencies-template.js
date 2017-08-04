// @flow
import R from 'ramda';
import chalk from 'chalk';
import ConsumerComponent from '../../consumer/component/consumer-component';
import { formatBit } from '../chalk-box';

export default function missingDepsTemplate(components: ConsumerComponent[]) {
  const result = components.map(paintOneComponent).join('\n\n');
  return result;
}

function paintOneComponent(component) {
  const { missingDependencies } = component;
  const { missingDependenciesOnFs, missingPackagesDependenciesOnFs, untrackedDependencies } = missingDependencies;
  const idColored = chalk.underline.white(formatBit(component));
  let result = `${idColored}\n`;

  let missingOnFsColored;
  let missingPackagesDependenciesOnFsColored;
  let untrackedDependenciesColored;

  if (missingDependenciesOnFs) {
    missingOnFsColored = paintArrayOfMissings('The following files dependencies not found on file system', missingDependenciesOnFs);
  }

  if (missingPackagesDependenciesOnFs) {
    missingPackagesDependenciesOnFsColored = paintArrayOfMissings('The following packages not found on file system', missingPackagesDependenciesOnFs);
  }

  if (untrackedDependencies) {
    untrackedDependenciesColored = paintArrayOfMissings('The following files dependencies are not tracked by bit', untrackedDependencies);
  }

  result = ([result, missingOnFsColored, missingPackagesDependenciesOnFsColored, untrackedDependenciesColored]).join('\n');
  return result;
}

function paintArrayOfMissings(title: string, missings: string[]) {
  if (!missings || R.isEmpty(missings)) return '';
  const titleColored = chalk.underline.white(title);
  const missingsColored = chalk.red(missings.join('\n'));
  return ([titleColored, missingsColored]).join('\n');
}
