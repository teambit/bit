import { expect } from 'chai';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import ImportComponents from './import-components';
import type { ImportOptions } from './import-components';

describe('ImportComponents', () => {
  describe('_writeToFileSystem', () => {
    // a handler may write what the install needs, e.g. the pnpm manifest that lists the written packages
    it('should run the handlers of the written components after the files are written and before the install', async () => {
      const calls: string[] = [];
      const componentWriter = {
        writeComponentsFiles: async () => {
          calls.push('write');
        },
        finalizeWrite: async () => {
          calls.push('install');
          return {};
        },
      };
      const workspace = { consumer: { scope: {} } };
      const importComponents = new ImportComponents(
        workspace as any,
        {} as any, // graph
        componentWriter as any,
        {} as any, // envs
        {} as any, // logger
        {} as any, // lister
        { installNpmPackages: true } as ImportOptions,
        async () => {
          calls.push('handlers');
        }
      );
      await importComponents._writeToFileSystem([{} as ConsumerComponent]);
      expect(calls).to.deep.equal(['write', 'handlers', 'install']);
    });
  });
});
