import colorizeSemverDiff from '@pnpm/colorize-semver-diff';
import semverDiff from '@pnpm/semver-diff';
import { OutdatedPkg } from '@teambit/dependency-resolver';
import { getBorderCharacters, table } from 'table';
import chalk from 'chalk';
import { prompt } from 'enquirer';

/**
 * Lets the user pick the packages that should be updated.
 */
export async function pickOutdatedPkgs(outdatedPkgs: OutdatedPkg[]): Promise<OutdatedPkg[]> {
  const { updateDependencies } = (await prompt({
    choices: makeOutdatedPkgChoices(outdatedPkgs),
    footer: '\nEnter to start updating. Ctrl-c to cancel.',
    indicator: (state: any, choice: any) => ` ${choice.enabled ? '●' : '○'}`,
    message:
      'Choose which packages to update ' +
      `(Press ${chalk.cyan('<space>')} to select, ` +
      `${chalk.cyan('<a>')} to toggle all, ` +
      `${chalk.cyan('<i>')} to invert selection)
${chalk.green('Green')} - indicates a semantically safe update
${chalk.red('Red')} - indicates a semantically breaking change`,
    name: 'updateDependencies',
    pointer: '❯',
    styles: {
      dark: chalk.white,
      em: chalk.bgBlack.whiteBright,
      success: chalk.white,
    },
    type: 'multiselect',
    validate(value: string[]) {
      if (value.length === 0) {
        return 'You must choose at least one package.';
      }
      return true;
    },
    j() {
      return this.down();
    },
    k() {
      return this.up();
    },
    result(names: string[]) {
      // This is needed in order to have the values of the choices in the answer object.
      // Otherwise, only the names of the selected choices would've been included.
      return this.map(names);
    },
    cancel() {
      // By default, canceling the prompt via Ctrl+c throws an empty string.
      // The custom cancel function prevents that behavior.
      // Otherwise, Bit CLI would print an error and confuse users.
      // See related issue: https://github.com/enquirer/enquirer/issues/225
    },
  } as any)) as { updateDependencies: Record<string, string | OutdatedPkg> };
  return Object.values(updateDependencies ?? {}).filter(
    (updateDependency) => typeof updateDependency !== 'string'
  ) as OutdatedPkg[];
}

const DEP_TYPE_PRIORITY = {
  dependencies: 0,
  devDependencies: 1,
  peerDependencies: 2,
};

/**
 * Groups the outdated packages and makes choices for enquirer's prompt.
 */
export function makeOutdatedPkgChoices(outdatedPkgs: OutdatedPkg[]) {
  outdatedPkgs.sort((pkg1, pkg2) => {
    if (pkg1.targetField === pkg2.targetField) return pkg1.name.localeCompare(pkg2.name);
    return DEP_TYPE_PRIORITY[pkg1.targetField] - DEP_TYPE_PRIORITY[pkg2.targetField];
  });
  const renderedTable = alignColumns(outdatedPkgsRows(outdatedPkgs));
  const groupedChoices = {};
  outdatedPkgs.forEach((outdatedPkg, index) => {
    const context = renderContext(outdatedPkg);
    if (!groupedChoices[context]) {
      groupedChoices[context] = [];
    }
    groupedChoices[context].push({
      message: renderedTable[index],
      name: outdatedPkg.name,
      value: outdatedPkg,
    });
  });
  const choices = Object.entries(groupedChoices).map(([context, subChoices]) => ({
    message: chalk.cyan(context),
    choices: subChoices,
  }));
  return choices;
}

function renderContext(outdatedPkg: OutdatedPkg) {
  if (outdatedPkg.variantPattern) {
    return `${outdatedPkg.variantPattern} (variant)`;
  }
  if (outdatedPkg.componentId) {
    return `${outdatedPkg.componentId} (component)`;
  }
  return 'Root policies';
}

const TARGET_FIELD_TO_DEP_TYPE = {
  devDependencies: 'dev',
  dependencies: 'runtime',
  peerDependencies: 'peer',
};

function outdatedPkgsRows(outdatedPkgs: OutdatedPkg[]) {
  return outdatedPkgs.map((outdatedPkg) => {
    const { change, diff } = semverDiff(outdatedPkg.currentRange, outdatedPkg.latestRange);
    let colorizeChange = change ?? 'breaking';
    if (change === 'feature') {
      colorizeChange = 'fix';
    }
    const latest = colorizeSemverDiff({
      change: colorizeChange,
      diff,
    });
    return [
      outdatedPkg.name,
      chalk.grey(`(${TARGET_FIELD_TO_DEP_TYPE[outdatedPkg.targetField]})`),
      outdatedPkg.currentRange,
      '❯',
      latest,
    ];
  });
}

function alignColumns(rows: string[][]) {
  return table(rows, {
    border: getBorderCharacters('void'),
    columnDefault: {
      paddingLeft: 0,
      paddingRight: 1,
    },
    columns: {
      // This is the current range column
      2: { alignment: 'right' },
    },
    drawHorizontalLine: () => false,
  }).split('\n');
}
