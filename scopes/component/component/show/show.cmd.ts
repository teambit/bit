import { Command, CommandOptions } from '@teambit/cli';
// import { Logger } from '@teambit/logger';
// import chalk from 'chalk';
import Table from 'tty-table';
import { MissingBitMapComponent } from '@teambit/legacy/dist/consumer/bit-map/exceptions';
import { BitId } from '@teambit/legacy-bit-id';
import LegacyShow from '@teambit/legacy/dist/cli/commands/public-cmds/show-cmd';
import { ComponentMain } from '../component.main.runtime';

export class ShowCmd implements Command {
  name = 'show <id>';
  description = 'show a component';
  alias = '';
  group = 'info';
  options = [
    ['j', 'json', 'return the component data in json format'],
    ['l', 'legacy', 'use the legacy bit show.'],
    ['r', 'remote', 'show a remote component'],
    [
      'c',
      'compare [boolean]',
      'compare current file system component to latest tagged component [default=latest]. only works in legacy.',
    ],
  ] as CommandOptions;

  constructor(private component: ComponentMain) {}

  private async getComponent(idStr: string, remote: boolean) {
    if (remote) {
      const bitId: BitId = BitId.parse(idStr, true); // user used --remote so we know it has a scope
      const host = this.component.getHost('teambit.scope/scope');
      const id = await host.resolveComponentId(bitId);
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
    const legacyShow = new LegacyShow();
    const showData = await legacyShow.action([id], {
      json,
      versions: undefined,
      remote,
      compare,
    });

    return legacyShow.report(showData);
  }

  async report([idStr]: [string], { legacy, remote, compare }: { legacy: boolean; remote: boolean; compare: boolean }) {
    if (legacy) return this.useLegacy(idStr, false, remote, compare);
    const component = await this.getComponent(idStr, remote);
    const fragments = this.component.getShowFragments();
    const rows = await Promise.all(
      fragments.map(async (fragment) => {
        const row = await fragment.renderRow(component);
        return [row.title, row.content];
      })
    );

    const options = {
      borderStyle: 'solid',
      paddingBottom: 0,
      headerAlign: 'center',
      align: 'left',
      headerColor: 'cyan',
    };

    const headers = [
      {
        width: 35,
        color: 'cyan',
      },
      {
        width: 150,
        alias: 'content',
      },
    ];

    const table = new Table(headers, rows, options);
    return table.render();
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
