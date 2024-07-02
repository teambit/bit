import open from 'open';
import { Command, CommandOptions } from '@teambit/cli';
import { compact } from 'lodash';
// import { Logger } from '@teambit/logger';
// import chalk from 'chalk';
import { CLITable } from '@teambit/cli-table';
import { MissingBitMapComponent } from '@teambit/legacy/dist/consumer/bit-map/exceptions';
import { ComponentID } from '@teambit/component-id';
import { Logger } from '@teambit/logger';
import { reportLegacy, actionLegacy } from './legacy-show/show-legacy-cmd';
import { ComponentMain } from '../component.main.runtime';

export class ShowCmd implements Command {
  name = 'show <component-name>';
  description = "display the component's essential information";
  alias = '';
  group = 'info';
  arguments = [{ name: 'component-name', description: 'component name or component id' }];
  options = [
    ['j', 'json', 'return the component data in json format'],
    ['l', 'legacy', 'use the legacy bit show.'],
    ['r', 'remote', 'show data for a remote component'],
    ['b', 'browser', 'open the component page in the browser'],
    [
      'c',
      'compare',
      'legacy-only. compare current file system component to its latest tagged version [default=latest]',
    ],
  ] as CommandOptions;

  constructor(private component: ComponentMain, private logger: Logger) {}

  private async getComponent(idStr: string, remote: boolean) {
    if (remote) {
      const id = ComponentID.fromString(idStr); // user used --remote so we know it has a scope
      const host = this.component.getHostIfExist('teambit.scope/scope');
      if (!host)
        throw new Error(`error: the current directory is not a workspace nor a scope. the full "bit show" is not supported.
to see the legacy bit show, please use "--legacy" flag`);
      if (!host.getRemoteComponent) {
        throw new Error('Component Host does not implement getRemoteComponent()');
      }
      const component = await host.getRemoteComponent(id);
      return component;
    }
    const host = this.component.getHost();
    const id = await host.resolveComponentId(idStr);
    const component = await host.get(id);
    if (!component) throw new MissingBitMapComponent(idStr);
    return component;
  }

  async useLegacy(id: string, json = false, remote = false, compare = false) {
    const showData = await actionLegacy([id], {
      json,
      remote,
      compare,
    });

    return reportLegacy(showData);
  }

  async report(
    [idStr]: [string],
    { legacy, remote, compare, browser }: { legacy: boolean; remote: boolean; compare: boolean; browser: boolean }
  ) {
    if (legacy) return this.useLegacy(idStr, false, remote, compare);
    const component = await this.getComponent(idStr, remote);
    const fragments = this.component.getShowFragments();
    const rows = await Promise.all(
      fragments.map(async (fragment) => {
        const row = await fragment.renderRow(component);
        if (!row.content) return null;
        return [row.title, row.content];
      })
    );

    const table = new CLITable([], compact(rows));
    const renderedTable = table.render();
    if (browser) {
      const isExported = component.isExported();
      if (!isExported) {
        this.logger.consoleWarning(`unable to open the browser, the component "${idStr}" has not been exported yet`);
        return renderedTable;
      }
      const homepageUrl = component.homepage;
      if (!homepageUrl || homepageUrl === '') {
        this.logger.consoleWarning(`unable to open browser, the component ${idStr} does not have a homepage`);
        return renderedTable;
      }
      open(homepageUrl).catch((err) => {
        this.logger.error(`failed to open browser for component ${idStr}, err: ${err}`);
      });
    }
    return renderedTable;
  }

  async json([idStr]: [string], { remote, legacy }: { remote: boolean; legacy: boolean }) {
    if (legacy) return JSON.parse(await this.useLegacy(idStr, true, remote));
    const component = await this.getComponent(idStr, remote);
    const fragments = this.component.getShowFragments();
    const rows = await Promise.all(
      fragments.map(async (fragment) => {
        return fragment.json ? fragment.json(component) : undefined;
      })
    );

    return rows.filter((row) => !!row);
  }
}
