import { prompt } from 'enquirer';
import yesno from 'yesno';
import { uniq } from 'lodash';
import chalk from 'chalk';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { GraphMain } from '@teambit/graph';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import { ImportOptions } from './import-components';

export class DependentsGetter {
  constructor(
    private logger: Logger,
    private workspace: Workspace,
    private graph: GraphMain,
    private options: ImportOptions
  ) {}

  async getDependents(compIds: ComponentID[]): Promise<ComponentID[]> {
    this.logger.setStatusLine('finding dependents');
    const graph = await this.graph.getGraphIds();
    const targetCompIds = await this.workspace.resolveMultipleComponentIds(compIds);
    const sourceIds = await this.workspace.listIds();
    const getIdsForThrough = () => {
      if (!this.options.dependentsThrough) return undefined;
      return this.options.dependentsThrough
        .split(',')
        .map((idStr) => idStr.trim())
        .map((id) => ComponentID.fromString(id));
    };
    const allPaths = graph.findAllPathsFromSourcesToTargets(sourceIds, targetCompIds, getIdsForThrough());
    const selectedPaths = await this.promptDependents(allPaths);
    const uniqAsStrings = uniq(selectedPaths.map((path) => path.map((id) => id.toString())).flat());

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
    if (this.options.dependentsDryRun) {
      this.logger.clearStatusLine();
      const question = idsStr.length
        ? `found the following ${ids.length} components for --dependents flag:\n${idsStr.join('\n')}`
        : 'unable to find dependents for the given component (probably the workspace components using it directly)';
      const ok = await yesno({
        question: `${question}\nWould you like to continue with the import?`,
      });
      if (!ok) {
        throw new BitError('import was aborted');
      }
    }

    return ids;
  }

  private async promptDependents(allPaths: string[][]): Promise<ComponentID[][]> {
    if (!allPaths.length) return [];
    this.logger.clearStatusLine();

    const totalToShow = 30;
    const firstItems = allPaths.slice(0, totalToShow);
    const choices = firstItems.map((path) => {
      const name = path.join(' -> ');
      const value = path.map((id) => ComponentID.fromString(id));
      return { name, value };
    });
    const tooManyPathsMsg =
      allPaths.length > totalToShow
        ? `${chalk.yellow(
            `\nfound ${allPaths.length} paths, showing the shortest ${totalToShow}. if the desired path is not shown, use the --dependents-through flag`
          )}`
        : '';
    const result = await prompt<{ selectDependents: Record<string, ComponentID[]> }>({
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
}
