import c from 'chalk';
import { table } from 'table';
import type { ComponentID } from '@teambit/component-id';
import type { DependenciesInfo } from '@teambit/legacy.dependency-graph';

function getAllDependenciesRows(dependenciesInfoArray: DependenciesInfo[], id: ComponentID): Array<string[]> {
  return dependenciesInfoArray.map((dependency: DependenciesInfo) => {
    const row: string[] = [];
    row.push(dependency.id.toString());
    row.push(dependency.depth.toString());
    row.push(dependency.parent === id.toString() ? '<self>' : dependency.parent);
    row.push(dependency.dependencyType);
    return row;
  });
}

export function generateDependenciesInfoTable(dependenciesInfo: DependenciesInfo[], id: ComponentID) {
  if (!dependenciesInfo.length) {
    return '';
  }

  const dependenciesHeader: string[][] = [];
  dependenciesHeader.push([
    c.cyan('Dependency ID'),
    c.cyan('Depth'),
    c.cyan('Immediate Dependent'),
    c.cyan('Dependency type'),
  ]);
  const allDependenciesRows = getAllDependenciesRows(dependenciesInfo, id);

  const dependenciesTable = table(dependenciesHeader.concat(allDependenciesRows));
  return `\n${c.bold('Dependencies Details')}\n${dependenciesTable}`;
}

export function generateDependentsInfoTable(dependentsInfo: DependenciesInfo[], id: ComponentID) {
  if (!dependentsInfo.length) {
    return '';
  }
  const dependentsHeader: string[][] = [];
  dependentsHeader.push([
    c.cyan('Dependent ID'),
    c.cyan('Depth'),
    c.cyan('Immediate Dependency'),
    c.cyan('Dependent type'),
  ]);
  const allDependenciesRows = getAllDependenciesRows(dependentsInfo, id);
  const dependentsTable = table(dependentsHeader.concat(allDependenciesRows));
  return `\n${c.bold('Dependents Details')}\n${dependentsTable}`;
}
