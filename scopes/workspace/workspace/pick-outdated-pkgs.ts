import colorizeSemverDiff from '@pnpm/colorize-semver-diff';
import semverDiff from '@pnpm/semver-diff';
import { OutdatedPkg } from '@teambit/dependency-resolver';
import { getBorderCharacters, table } from '@zkochan/table';
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
      `${chalk.cyan('<i>')} to invert selection)`,
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
  } as any)) as { updateDependencies: Array<string | OutdatedPkg> };
  return updateDependencies.filter((updateDependency) => typeof updateDependency !== 'string') as OutdatedPkg[];
}

/**
 * Groups the outdated packages and makes choices for enquirer's prompt.
 */
export function makeOutdatedPkgChoices(outdatedPkgs: OutdatedPkg[]) {
  outdatedPkgs.sort((pkg1, pkg2) => pkg1.name.localeCompare(pkg2.name));
  const renderedTable = alignColumns(outdatedPkgsRows(outdatedPkgs));
  const groupedChoices = {};
  outdatedPkgs.forEach((outdatedPkg, index) => {
    const context = outdatedPkg.variantPattern ?? outdatedPkg.componentId ?? 'Root Policy';
    if (!groupedChoices[context]) {
      groupedChoices[context] = [];
    }
    groupedChoices[context].push({
      message: renderedTable[index],
      name: outdatedPkg,
    });
  });
  const choices = Object.entries(groupedChoices).map(([context, subChoices]) => ({
    message: context,
    choices: subChoices,
  }));
  return choices;
}

function outdatedPkgsRows(outdatedPkgs: OutdatedPkg[]) {
  return outdatedPkgs.map((outdatedPkg) => {
    let label = outdatedPkg.name;
    switch (outdatedPkg.targetField) {
      case 'devDependencies': {
        label += ' (dev)';
        break;
      }
      case 'peerDependencies': {
        label += ' (peer)';
        break;
      }
      default:
        break;
    }
    const { change, diff } = semverDiff(outdatedPkg.currentRange, outdatedPkg.latestRange);
    const latest = colorizeSemverDiff({
      change: change ?? 'breaking',
      diff,
    });
    return [label, outdatedPkg.currentRange, '❯', latest];
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
      1: { alignment: 'right' },
    },
    drawHorizontalLine: () => false,
  }).split('\n');
}
