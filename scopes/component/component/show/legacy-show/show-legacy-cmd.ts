import c from 'chalk';
import rightpad from 'pad-right';
import { table } from 'table';
import type { Alignment } from 'table';
import { componentToPrintableForDiff, getDiffBetweenObjects, prettifyFieldName } from '@teambit/legacy.component-diff';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { show } from './legacy-show';
import paintDocumentation from './docs-template';
import { compact } from 'lodash';

export function actionLegacy(
  [id]: [string],
  {
    json,
    remote = false,
    compare = false,
  }: {
    json?: boolean;
    remote: boolean;
    compare?: boolean;
  }
): Promise<any> {
  return show({
    id,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    json,
    remote,
    compare,
  });
}

export function reportLegacy({
  component,
  componentModel,
  json,
}: {
  component: ConsumerComponent;
  componentModel?: ConsumerComponent;
  json: boolean | null | undefined;
}): string {
  if (component.componentFromModel) {
    component.scopesList = component.componentFromModel.scopesList;
  }
  if (json) {
    const makeComponentReadable = (comp: ConsumerComponent) => {
      if (!comp) return comp;
      const componentObj = comp.toObject();
      componentObj.files = comp.files.map((file) => file.toReadableString());

      if (comp.componentMap) {
        componentObj.componentDir = comp.componentMap.getComponentDir();
      }

      return componentObj;
    };
    const componentFromFileSystem = makeComponentReadable(component);
    if (component.scopesList) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      componentFromFileSystem.scopesList = component.scopesList;
    }
    const componentFromModel = componentModel ? makeComponentReadable(componentModel) : undefined;
    const jsonObject = componentFromModel ? { componentFromFileSystem, componentFromModel } : componentFromFileSystem;
    return JSON.stringify(jsonObject, null, '  ');
  }
  return paintComponent(component, componentModel);
}

const COLUMN_WIDTH = 50;
const tableColumnConfig = {
  columns: {
    1: {
      alignment: 'left' as Alignment,
      width: COLUMN_WIDTH,
    },
    2: {
      alignment: 'left' as Alignment,
      width: COLUMN_WIDTH,
    },
  },
};

function paintComponent(component: ConsumerComponent, componentModel: ConsumerComponent | undefined) {
  return componentModel ? paintWithCompare() : paintWithoutCompare();

  function paintWithoutCompare() {
    const printableComponent = componentToPrintableForDiff(component);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    printableComponent.scopesList = (component.scopesList || []).map((s) => s.name).join('\n');
    const fields = getFields();
    const rows = compact(
      fields.map((field) => {
        const arr: string[] = [];

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
                .map((str) => calculatePadRightLength(str, COLUMN_WIDTH))
                .join(' ')
                .trim()
            );
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          } else arr.push(printableComponent[field]);
        }
        return arr;
      })
    );

    const componentTable = table(rows, tableColumnConfig);
    return componentTable + paintDocumentation(component.docs);
  }

  function paintWithCompare() {
    if (!componentModel) throw new Error('paintWithCompare, componentModel must be defined');
    const printableOriginalComponent = componentToPrintableForDiff(component);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    printableOriginalComponent.id += ' [file system]';
    const printableComponentToCompare = componentToPrintableForDiff(componentModel);

    const componentsDiffs = getDiffBetweenObjects(printableOriginalComponent, printableComponentToCompare);
    const fields = getFields();
    const rows = compact(
      fields.map((field) => {
        const arr = [];
        if (!printableOriginalComponent[field] && !printableComponentToCompare[field]) return null;
        const title = `${field[0].toUpperCase()}${field.slice(1)}`.replace(/([A-Z])/g, ' $1').trim();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        arr.push(field in componentsDiffs && field !== 'id' ? c.red(title) : c.cyan(title));
        if (printableComponentToCompare[field] instanceof Array) {
          arr.push(
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            printableComponentToCompare[field]
              .map((str) => calculatePadRightLength(str, COLUMN_WIDTH))
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
              .map((str) => calculatePadRightLength(str, COLUMN_WIDTH))
              .join(' ')
              .trim()
          );
        } else {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          arr.push(printableOriginalComponent[field]);
        }
        return arr;
      })
    );

    const componentTable = table(rows, tableColumnConfig);
    const dependenciesTableStr = generateDependenciesTable();
    return componentTable + dependenciesTableStr;
  }

  function getFields() {
    const fields = [
      'id',
      'packageName',
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
      'deprecated',
    ];
    return fields;
  }

  function generateDependenciesTable() {
    if (!component.hasDependencies()) {
      return '';
    }

    const dependencyHeader = [];
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    dependencyHeader.push(['Dependencies']);
    const getDependenciesRows = (dependencies, title?: string) => {
      const dependencyRows = [];
      dependencies.forEach((dependency) => {
        let dependencyId = dependency.id.toString();
        dependencyId = title ? `${dependencyId} (${title})` : dependencyId;
        const row = [dependencyId];
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

  function calculatePadRightLength(str: string, columnWidth: number): string {
    if (!str) return '';
    const padRightCount = Math.ceil(str.length / columnWidth) * columnWidth;
    return str.length > columnWidth ? rightpad(str, padRightCount, ' ') : rightpad(str, columnWidth, ' ');
  }
}
