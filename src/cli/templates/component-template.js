/** @flow */
import c from 'chalk';
import { table } from 'table';
import rightpad from 'pad-right';
import ConsumerComponent from '../../consumer/component/consumer-component';
import paintDocumentation from './docs-template';
import {
  componentToPrintableForDiff,
  getDiffBetweenObjects,
  prettifyFieldName
} from '../../consumer/component-ops/components-object-diff';
import type { DependenciesInfo } from '../../scope/graph/scope-graph';

const COLUMN_WIDTH = 50;
const tableColumnConfig = {
  columns: {
    // $FlowFixMe
    1: {
      alignment: 'left',
      width: COLUMN_WIDTH
    },
    // $FlowFixMe
    2: {
      alignment: 'left',
      width: COLUMN_WIDTH
    }
  }
};

export default function paintComponent(
  component: ConsumerComponent,
  componentModel?: ConsumerComponent,
  showRemoteVersion: boolean,
  detailed: boolean,
  dependenciesInfo: DependenciesInfo[],
  dependentsInfo: DependenciesInfo[]
) {
  return componentModel ? paintWithCompare() : paintWithoutCompare();

  function paintWithoutCompare() {
    const printableComponent = componentToPrintableForDiff(component);
    printableComponent.scopesList = (component.scopesList || []).map(s => s.name).join('\n');
    const rows = getFields()
      .map((field) => {
        const arr = [];

        const title = prettifyFieldName(field);
        if (!printableComponent[field]) return null;

        arr.push(c.cyan(title));
        if (!printableComponent[field]) return null;

        if (printableComponent[field]) {
          if (printableComponent[field] instanceof Array) {
            arr.push(
              printableComponent[field]
                .map(str => calculatePadRightLength(str, COLUMN_WIDTH))
                .join(' ')
                .trim()
            );
          } else arr.push(printableComponent[field]);
        }
        return arr;
      })
      .filter(x => x);

    const componentTable = table(rows, tableColumnConfig);
    const dependenciesTableStr = showRemoteVersion ? generateDependenciesTable() : '';
    const dependentsInfoTableStr = generateDependentsInfoTable();
    const dependenciesInfoTableStr = generateDependenciesInfoTable();
    return (
      componentTable +
      dependenciesTableStr +
      dependentsInfoTableStr +
      dependenciesInfoTableStr +
      paintDocumentation(component.docs)
    );
  }

  function paintWithCompare() {
    if (!componentModel) throw new Error('paintWithCompare, componentModel must be defined');
    const printableOriginalComponent = componentToPrintableForDiff(component);
    printableOriginalComponent.id += ' [file system]';
    const printableComponentToCompare = componentToPrintableForDiff(componentModel);

    const componentsDiffs = getDiffBetweenObjects(printableOriginalComponent, printableComponentToCompare);

    const rows = getFields()
      .map((field) => {
        const arr = [];
        if (!printableOriginalComponent[field] && !printableComponentToCompare[field]) return null;
        const title = `${field[0].toUpperCase()}${field.substr(1)}`.replace(/([A-Z])/g, ' $1').trim();
        arr.push(field in componentsDiffs && field !== 'id' ? c.red(title) : c.cyan(title));
        if (printableComponentToCompare[field] instanceof Array) {
          arr.push(
            printableComponentToCompare[field]
              .map(str => calculatePadRightLength(str, COLUMN_WIDTH))
              .join(' ')
              .trim()
          );
        } else {
          arr.push(printableComponentToCompare[field]);
        }
        if (printableOriginalComponent[field] instanceof Array) {
          arr.push(
            printableOriginalComponent[field]
              .map(str => calculatePadRightLength(str, COLUMN_WIDTH))
              .join(' ')
              .trim()
          );
        } else {
          arr.push(printableOriginalComponent[field]);
        }
        return arr;
      })
      .filter(x => x);

    const componentTable = table(rows, tableColumnConfig);
    const dependenciesTableStr = generateDependenciesTable();
    return componentTable + dependenciesTableStr;
  }

  function getFields() {
    const fields = [
      'id',
      'compiler',
      'tester',
      'language',
      'mainFile',
      'dependencies',
      'devDependencies',
      'compilerDependencies',
      'testerDependencies',
      'packages',
      'devPackages',
      'peerDependencies',
      'files',
      'specs',
      'deprecated'
    ];
    if (detailed) {
      const extraFields = [
        'overridesDependencies',
        'overridesDevDependencies',
        'overridesPeerDependencies',
        'scopesList'
      ];
      fields.push(...extraFields);
    }
    return fields;
  }

  function generateDependenciesTable() {
    if (!component.hasDependencies()) {
      return '';
    }

    const dependencyHeader = [];
    if (showRemoteVersion) {
      dependencyHeader.push(['Dependency ID', 'Current Version', 'Local Version', 'Remote Version']);
    } else {
      dependencyHeader.push(['Dependencies']);
    }
    const getDependenciesRows = (dependencies, title?: string) => {
      const dependencyRows = [];
      dependencies.forEach((dependency) => {
        let dependencyId = showRemoteVersion ? dependency.id.toStringWithoutVersion() : dependency.id.toString();
        dependencyId = title ? `${dependencyId} (${title})` : dependencyId;
        const row = [dependencyId];
        if (showRemoteVersion) {
          const dependencyVersion = dependency.currentVersion;
          const localVersion = dependency.localVersion;
          const remoteVersion = dependency.remoteVersion ? dependency.remoteVersion : null;
          // if all versions are equal, paint them with green. Otherwise, paint with red
          const color =
            (remoteVersion && remoteVersion === localVersion && remoteVersion === dependencyVersion) ||
            (!remoteVersion && localVersion === dependencyVersion)
              ? 'green'
              : 'red';
          // $FlowFixMe
          row.push(c[color](dependencyVersion));
          // $FlowFixMe
          row.push(c[color](localVersion));
          // $FlowFixMe
          row.push(remoteVersion ? c[color](remoteVersion) : 'N/A');
        }
        dependencyRows.push(row);
      });
      return dependencyRows;
    };
    const dependenciesRows = getDependenciesRows(component.dependencies.get());
    const devDependenciesRows = getDependenciesRows(component.devDependencies.get(), 'dev');
    const compilerDependenciesRows = getDependenciesRows(component.compilerDependencies.get(), 'compiler');
    const testerDependenciesRows = getDependenciesRows(component.testerDependencies.get(), 'tester');
    const allDependenciesRows = [
      ...dependenciesRows,
      ...devDependenciesRows,
      ...compilerDependenciesRows,
      ...testerDependenciesRows
    ];

    const dependenciesTable = table(dependencyHeader.concat(allDependenciesRows));
    return dependenciesTable;
  }

  function generateDependentsInfoTable() {
    if (!dependentsInfo.length) {
      return '';
    }
    const dependentsHeader = [];
    dependentsHeader.push([
      c.cyan('Dependent ID'),
      c.cyan('Depth'),
      c.cyan('Immediate Dependency'),
      c.cyan('Dependent type')
    ]);
    const allDependenciesRows = dependentsInfo.map((dependent: DependenciesInfo) => {
      const row = [];
      row.push(dependent.id);
      row.push(dependent.depth);
      row.push(dependent.parent);
      row.push(dependent.dependencyType);
      return row;
    });

    const dependentsTable = table(dependentsHeader.concat(allDependenciesRows));
    return `\n${c.bold('Dependents Details')}\n${dependentsTable}`;
  }

  function generateDependenciesInfoTable() {
    if (!dependenciesInfo.length) {
      return '';
    }

    const dependenciesHeader = [];
    dependenciesHeader.push([
      c.cyan('Dependency ID'),
      c.cyan('Depth'),
      c.cyan('Immediate Dependent'),
      c.cyan('Dependency type')
    ]);
    const allDependenciesRows = dependenciesInfo.map((dependency: DependenciesInfo) => {
      const row = [];
      row.push(dependency.id);
      row.push(dependency.depth);
      row.push(dependency.parent);
      row.push(dependency.dependencyType);
      return row;
    });

    const dependenciesTable = table(dependenciesHeader.concat(allDependenciesRows));
    return `\n${c.bold('Dependencies Details')}\n${dependenciesTable}`;
  }

  function calculatePadRightLength(str: string, columnWidth: number): string {
    if (!str) return '';
    const padRightCount = Math.ceil(str.length / columnWidth) * columnWidth;
    return str.length > columnWidth ? rightpad(str, padRightCount, ' ') : rightpad(str, columnWidth, ' ');
  }
}
