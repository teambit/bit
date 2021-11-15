import colorizeSemverDiff from '@pnpm/colorize-semver-diff';
import semverDiff from '@pnpm/semver-diff';
import { OutdatedPkg } from '@teambit/dependency-resolver';
import { getBorderCharacters, table } from '@zkochan/table';
import chalk from 'chalk';
import { prompt } from 'enquirer';

export async function pickOutdatedPkgs(outdatedPkgs: OutdatedPkg[]) {
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
  } as any)) as { updateDependencies: OutdatedPkg[] };
  return updateDependencies;
}

export function makeOutdatedPkgChoices(outdatedPkgs: OutdatedPkg[]) {
  outdatedPkgs.sort((pkg1, pkg2) => pkg1.name.localeCompare(pkg2.name));
  const renderedTable = alignColumns(outdatedPkgsRows(outdatedPkgs));
  const choices = outdatedPkgs.map((outdatedPkg, index) => ({
    message: renderedTable[index],
    name: outdatedPkg,
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
    const context = outdatedPkg.variantPattern ?? outdatedPkg.componentId ?? ' '; // column cannot be empty string
    const { change, diff } = semverDiff(outdatedPkg.currentRange, outdatedPkg.latestRange);
    const latest = colorizeSemverDiff({
      change: change ?? 'breaking',
      diff,
    });
    return [label, outdatedPkg.currentRange, '❯', latest, context];
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
