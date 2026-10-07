import { expect } from 'chai';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import type { CLIMain, Command } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { ConfigStoreMain, Store } from '@teambit/config-store';
import { ConfigStoreAspect } from '@teambit/config-store';
import { WorkspaceAspect } from './workspace.aspect';

/**
 * the "bit config" sub-commands (set, get, del, list) against the global, workspace and scope stores.
 * the global store is replaced with an in-memory one, so the spec never touches the real global config of the
 * machine it runs on (the e2e version of these tests had to clean up after itself).
 */
describe('bit config command', function () {
  this.timeout(0);

  let workspaceData: WorkspaceData;
  let configStore: ConfigStoreMain;
  let configCmd: Command;

  function createInMemoryGlobalStore(): Store {
    const values: Record<string, string> = {};
    return {
      list: () => ({ ...values }),
      set: (key, value) => {
        values[key] = value;
      },
      del: (key) => {
        delete values[key];
      },
      write: async () => {},
      invalidateCache: async () => {},
      getPath: () => 'in-memory-global-config',
    };
  }

  /** the registered command, as the CLI runs it. a fresh harmony load is what a new process gets */
  async function load() {
    const harmony = await loadManyAspects([WorkspaceAspect, ConfigStoreAspect], workspaceData.workspacePath);
    configStore = harmony.get<ConfigStoreMain>(ConfigStoreAspect.id);
    configStore.stores.global = createInMemoryGlobalStore();
    configStore.invalidateCache();
    configCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('config') as Command;
  }

  const subCommand = (name: string) =>
    configCmd.commands?.find((cmd) => cmd.name.startsWith(`${name} `) || cmd.name === name) as Command;
  const set = async (key: string, value: string, flags = {}) =>
    stripAnsi(String(await subCommand('set').report!([key, value], flags)));
  const get = async (key: string) => stripAnsi(String(await subCommand('get').report!([key], {})));
  const del = async (key: string, flags = {}) => stripAnsi(String(await subCommand('del').report!([key], flags)));
  const listLocally = async (origin: 'scope' | 'workspace') =>
    (await subCommand('list').json!([], { origin })) as Record<string, string>;

  before(async () => {
    workspaceData = mockWorkspace();
    await load();
  });

  after(async () => {
    configStore.invalidateCache();
    await destroyWorkspace(workspaceData);
  });

  describe('set, get, delete configs', () => {
    let setOutput: string;
    let getOutput: string;
    let delOutput: string;

    before(async () => {
      setOutput = await set('conf.key', 'conf.value');
      getOutput = await get('conf.key');
      delOutput = await del('conf.key');
    });

    it('should set the config correctly', () => {
      expect(setOutput).to.have.string('added configuration successfully');
    });

    it('should get the config correctly', () => {
      expect(getOutput).to.have.string('conf.value');
    });

    it('should delete the config correctly', async () => {
      const confVal = await get('conf.key');
      expect(delOutput).to.have.string('deleted successfully');
      expect(confVal).to.not.have.string('conf.value');
    });
  });

  describe('saving config in the local workspace', () => {
    before(async () => {
      await set('local.ws', 'hello-ws', { localTrack: true });
    });
    after(async () => {
      await del('shared-conf');
      await del('shared-conf');
    });
    it('should save to the workspace when using "--local-track"', async () => {
      const list = await listLocally('workspace');
      expect(list).to.have.property('local.ws');
    });
    it('should be available for config-get', async () => {
      const val = await get('local.ws');
      expect(val).to.include('hello-ws');
    });
    describe('after a new process loads the workspace', () => {
      before(load);
      it('should still be available for config-get', async () => {
        expect(await get('local.ws')).to.include('hello-ws');
      });
    });
    describe('deleting the config', () => {
      before(async () => {
        await del('local.ws');
      });
      it('should not list it anymore', async () => {
        const list = await listLocally('workspace');
        expect(list).to.not.have.property('local.ws');
      });
      it('should not be available for config-get', async () => {
        const val = await get('local.ws');
        expect(val).to.not.include('hello-ws');
      });
    });
    describe('same config in global and workspace', () => {
      before(async () => {
        await set('shared-conf', 'global-val');
        await set('shared-conf', 'ws-val', { localTrack: true });
      });
      it('bit config get should return the local one', async () => {
        const val = await get('shared-conf');
        expect(val).to.include('ws-val');
        expect(val).to.not.include('global-val');
      });
    });
  });

  describe('saving config in the local scope', () => {
    before(async () => {
      await set('local.scope', 'hello-scope', { local: true });
    });
    after(async () => {
      await del('shared-conf');
      await del('shared-conf');
    });
    it('should save to the scope when using "--local"', async () => {
      const list = await listLocally('scope');
      expect(list).to.have.property('local.scope');
    });
    it('should be available for config-get', async () => {
      const val = await get('local.scope');
      expect(val).to.include('hello-scope');
    });
    describe('deleting the config', () => {
      before(async () => {
        await del('local.scope');
      });
      it('should not list it anymore', async () => {
        const list = await listLocally('scope');
        expect(list).to.not.have.property('local.scope');
      });
      it('should not be available for config-get', async () => {
        const val = await get('local.scope');
        expect(val).to.not.include('hello-scope');
      });
    });
    describe('same config in global and scope', () => {
      before(async () => {
        await set('shared-conf', 'global-val');
        await set('shared-conf', 'scope-val', { local: true });
      });
      it('bit config get should return the local one', async () => {
        const val = await get('shared-conf');
        expect(val).to.include('scope-val');
        expect(val).to.not.include('global-val');
      });
    });
  });
});
