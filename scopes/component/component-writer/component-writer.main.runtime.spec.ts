import { expect } from 'chai';
import { getPnpmVcsRootTrackerConfig } from './component-writer.main.runtime';

describe('pnpm VCS root component bootstrap', () => {
  it('accepts only the component named by a normalized root topology', () => {
    const config = {
      pnpmVcs: {
        schemaVersion: 1,
        requirements: {},
        appliedProfile: {},
        workspace: {
          schemaVersion: 1,
          rootComponent: 'acme.workspace/root',
          components: [],
        },
      },
    };
    const component = {
      id: {
        toStringWithoutVersion: () => 'acme.workspace/root',
        toString: () => 'acme.workspace/root@abc123',
      },
      extensions: {
        findCoreExtension: () => ({ config }),
      },
    } as any;

    expect(getPnpmVcsRootTrackerConfig(component)).to.equal(config);
    config.pnpmVcs.workspace.rootComponent = 'acme.workspace/other';
    expect(getPnpmVcsRootTrackerConfig(component)).to.be.undefined;
  });
});
