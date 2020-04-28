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
import { DependenciesInfo } from '../../scope/graph/scope-graph';

const COLUMN_WIDTH = 50;
const tableColumnConfig = {
  columns: {
    1: {
      alignment: 'left',
      width: COLUMN_WIDTH
    },
    2: {
      alignment: 'left',
      width: COLUMN_WIDTH
    }
  }
};

export default function paintComponent(
  component: ConsumerComponent,
  componentModel: ConsumerComponent | undefined,
  showRemoteVersion: boolean,
  detailed: boolean,
  dependenciesInfo: DependenciesInfo[],
  dependentsInfo: DependenciesInfo[]
) {
  return componentModel ? paintWithCompare() : paintWithoutCompare();

  function paintWithoutCompare() {
    const printableComponent = componentToPrintableForDiff(component);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    printableComponent.scopesList = (component.scopesList || []).map(s => s.name).join('\n');
    const rows = getFields()
      .map(field => {
        const arr = [];

        const title = prettifyFieldName(field);
        if (!printableComponent[field]) return null;

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        arr.push(c.cyan(title));
        if (!printableComponent[field]) return null;

        if (printableComponent[field]) {
          if (printableComponent[field] instanceof Array) {
            arr.push(
              // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
              printableComponent[field]
                .map(str => calculatePadRightLength(str, COLUMN_WIDTH))
                .join(' ')
                .trim()
            );
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    printableOriginalComponent.id += ' [file system]';
    const printableComponentToCompare = componentToPrintableForDiff(componentModel);

    const componentsDiffs = getDiffBetweenObjects(printableOriginalComponent, printableComponentToCompare);

    const rows = getFields()
      .map(field => {
        const arr = [];
        if (!printableOriginalComponent[field] && !printableComponentToCompare[field]) return null;
        const title = `${field[0].toUpperCase()}${field.substr(1)}`.replace(/([A-Z])/g, ' $1').trim();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        arr.push(field in componentsDiffs && field !== 'id' ? c.red(title) : c.cyan(title));
        if (printableComponentToCompare[field] instanceof Array) {
          arr.push(
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            printableComponentToCompare[field]
              .map(str => calculatePadRightLength(str, COLUMN_WIDTH))
              .join(' ')
              .trim()
          );
        } else {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          arr.push(printableComponentToCompare[field]);
        }
        if (printableOriginalComponent[field] instanceof Array) {
          arr.push(
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            printableOriginalComponent[field]
              .map(str => calculatePadRightLength(str, COLUMN_WIDTH))
              .join(' ')
              .trim()
          );
        } else {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      dependencyHeader.push(['Dependency ID', 'Current Version', 'Local Version', 'Remote Version']);
    } else {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      dependencyHeader.push(['Dependencies']);
    }
    const getDependenciesRows = (dependencies, title?: string) => {
      const dependencyRows = [];
      dependencies.forEach(dependency => {
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
          row.push(c[color](dependencyVersion));
          row.push(c[color](localVersion));
          row.push(remoteVersion ? c[color](remoteVersion) : 'N/A');
        }
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dependencyRows.push(row);
      });
      return dependencyRows;
    };
    const dependenciesRows = getDependenciesRows(component.dependencies.get());
    const devDependenciesRows = getDependenciesRows(component.devDependencies.get(), 'dev');
    const allDependenciesRows = [...dependenciesRows, ...devDependenciesRows];

    const dependenciesTable = table(dependencyHeader.concat(allDependenciesRows));
    return dependenciesTable;
  }

  function generateDependentsInfoTable() {
    if (!dependentsInfo.length) {
      return '';
    }
    const dependentsHeader = [];
    dependentsHeader.push([
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      c.cyan('Dependent ID'),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      c.cyan('Depth'),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      c.cyan('Immediate Dependency'),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      c.cyan('Dependent type')
    ]);
    const allDependenciesRows = getAllDependenciesRows(dependentsInfo);

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const dependentsTable = table(dependentsHeader.concat(allDependenciesRows));
    return `\n${c.bold('Dependents Details')}\n${dependentsTable}`;
  }

  function generateDependenciesInfoTable() {
    if (!dependenciesInfo.length) {
      return '';
    }

    const dependenciesHeader = [];
    dependenciesHeader.push([
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      c.cyan('Dependency ID'),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      c.cyan('Depth'),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      c.cyan('Immediate Dependent'),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      c.cyan('Dependency type')
    ]);
    const allDependenciesRows = getAllDependenciesRows(dependenciesInfo);

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const dependenciesTable = table(dependenciesHeader.concat(allDependenciesRows));
    return `\n${c.bold('Dependencies Details')}\n${dependenciesTable}`;
  }

  function getAllDependenciesRows(dependenciesInfoArray: DependenciesInfo[]): Array<string[]> {
    return dependenciesInfoArray.map((dependency: DependenciesInfo) => {
      const row = [];
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      row.push(dependency.id.toString());
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      row.push(dependency.depth.toString());
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      row.push(dependency.parent === component.id.toString() ? '<self>' : dependency.parent);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      row.push(dependency.dependencyType);
      return row;
    });
  }

  function calculatePadRightLength(str: string, columnWidth: number): string {
    if (!str) return '';
    const padRightCount = Math.ceil(str.length / columnWidth) * columnWidth;
    return str.length > columnWidth ? rightpad(str, padRightCount, ' ') : rightpad(str, columnWidth, ' ');
  }
}
