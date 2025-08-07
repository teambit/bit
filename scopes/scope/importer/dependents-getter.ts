import yesno from 'yesno';
// @ts-expect-error AutoComplete is actually there, the d.ts is probably outdated
import { prompt, AutoComplete } from 'enquirer';
import { compact, uniq } from 'lodash';
import chalk from 'chalk';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { GraphMain } from '@teambit/graph';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import type { ImportOptions } from './import-components';

const SHOW_ALL_PATHS_LIMIT = 10;
const SCROLL_LIMIT = 20;

export class DependentsGetter {
  constructor(
    private logger: Logger,
    private workspace: Workspace,
    private graph: GraphMain,
    private options: ImportOptions
  ) {}

  async getDependents(targetCompIds: ComponentID[]): Promise<ComponentID[]> {
    this.logger.setStatusLine('finding dependents');
    const { silent, dependentsAll } = this.options;
    const graph = await this.graph.getGraphIds();
    const sourceIds = this.workspace.listIds();
    const getIdsForThrough = () => {
      if (!this.options.dependentsVia) return undefined;
      return this.options.dependentsVia
        .split(',')
        .map((idStr) => idStr.trim())
        .map((id) => ComponentID.fromString(id));
    };
    const allPaths = graph.findAllPathsFromSourcesToTargets(sourceIds, targetCompIds, getIdsForThrough());
    const selectedPaths = silent || dependentsAll ? allPaths : await this.promptDependents(allPaths);
    const uniqAsStrings = uniq(selectedPaths.flat());

    const ids: ComponentID[] = [];
    const idsToFilterOut = ComponentIdList.fromArray([...sourceIds, ...targetCompIds]);
    uniqAsStrings.forEach((idStr) => {
      const id = ComponentID.fromString(idStr);
      if (idsToFilterOut.hasWithoutVersion(id)) return;
      const sameIds = uniqAsStrings.filter((idString) => idString.startsWith(`${id.toStringWithoutVersion()}@`));
      const idToImport = sameIds.length === 1 ? id : id.changeVersion(undefined);
      ids.push(idToImport);
      idsToFilterOut.push(idToImport);
    });

    const idsStr = ids.map((id) => id.toString());

    this.logger.debug(`found ${ids.length} component for --dependents flag`, idsStr);
    if (!this.options.silent) {
      this.logger.clearStatusLine();
      const question = idsStr.length
        ? `found the following ${ids.length} components for --dependents flag:\n${idsStr.join('\n')}`
        : 'unable to find dependents for the given component (probably the workspace components using it directly)';
      const ok = await yesno({
        question: `${question}\nWould you like to continue with the import? [yes(y)/no(n)]`,
      });
      if (!ok) {
        throw new BitError('import was aborted');
      }
    }

    return ids;
  }

  private async promptDependents(allPaths: string[][]): Promise<string[][]> {
    if (!allPaths.length) return [];
    this.logger.clearStatusLine();

    const totalToShow = SHOW_ALL_PATHS_LIMIT;
    if (allPaths.length > totalToShow) {
      return this.promptLevelByLevel(allPaths);
    }
    const firstItems = allPaths.slice(0, totalToShow);
    const choices = firstItems.map((path) => {
      const name = path.join(' -> ');
      return { name, value: path };
    });
    const tooManyPathsMsg =
      allPaths.length > totalToShow
        ? `${chalk.yellow(
            `\nfound ${allPaths.length} paths, showing the shortest ${totalToShow}. if the desired path is not shown, use the --dependents-via flag`
          )}`
        : '';
    const result = await prompt<{ selectDependents: Record<string, string[]> }>({
      choices,
      footer: '\nEnter to start importing. Ctrl+C to cancel.',
      indicator: (state: any, choice: any) => ` ${choice.enabled ? '●' : '○'}`,
      message:
        'Choose which path to include ' +
        `(Press ${chalk.cyan('<space>')} to select, ` +
        `${chalk.cyan('<a>')} to toggle all, ` +
        `${chalk.cyan('<i>')} to invert selection)${tooManyPathsMsg}`,
      name: 'selectDependents',
      pointer: '❯',
      styles: {
        dark: chalk.white,
        em: chalk.bgBlack.whiteBright,
        success: chalk.white,
      },
      type: 'multiselect',
      validate(value: string[]) {
        if (value.length === 0) {
          return 'You must choose at least one path.';
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
    } as any);

    return Object.values(result.selectDependents);
  }

  private async promptLevelByLevel(allPaths: string[][]): Promise<string[][]> {
    if (allPaths.length < SHOW_ALL_PATHS_LIMIT) {
      throw new Error(`expected to have at least ${SHOW_ALL_PATHS_LIMIT} paths`);
    }
    const finalPath: string[] = [];
    this.logger
      .console(`found ${allPaths.length} available paths from the workspace components to the target components.
the following prompts will guide you to choose the desired path to import.`);

    const getPrompt = (choices: string[], level: number, totalPaths: number) => {
      return new AutoComplete({
        name: 'comp',
        message: `Choose which component to include`,
        limit: SCROLL_LIMIT,
        footer() {
          return choices.length >= SCROLL_LIMIT ? chalk.dim('(Scroll up and down to reveal more choices)') : '';
        },
        header() {
          if (level === 1) return '';
          return `total ${totalPaths} paths left (out of ${allPaths.length})`;
        },
        cancel() {
          // By default, canceling the prompt via Ctrl+c throws an empty string.
          // The custom cancel function prevents that behavior.
          // Otherwise, Bit CLI would print an error and confuse users.
          // See related issue: https://github.com/enquirer/enquirer/issues/225
        },
        choices,
      });
    };

    const getLevel = (level: number, withinPaths: string[][]): string[] => {
      return compact(uniq(withinPaths.map((path) => path[level]))).sort();
    };

    const processLevel = async (level: number, paths: string[][], previousLevel?: string): Promise<string[]> => {
      const pathsWithinThisLevel = previousLevel ? paths.filter((path) => path[level] === previousLevel) : paths;
      const nextLevel = getLevel(level + 1, pathsWithinThisLevel);
      if (!nextLevel.length) {
        return finalPath;
      }
      if (nextLevel.length === 1) {
        finalPath.push(nextLevel[0]);
        this.logger.consoleSuccess(`${nextLevel[0]} (auto-selected)`);
        return processLevel(level + 1, pathsWithinThisLevel, nextLevel[0]);
      }
      const promptNextLevel = getPrompt(nextLevel, level + 1, pathsWithinThisLevel.length);
      const resultNextLevel = await promptNextLevel.run();
      finalPath.push(resultNextLevel);
      return processLevel(level + 1, pathsWithinThisLevel, resultNextLevel);
    };

    const result = await processLevel(0, allPaths);

    return [result];
  }
}
