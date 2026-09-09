import { expect } from 'chai';
import { removeHiddenPeerDependencies } from './remove-hidden-peer-dependencies';

describe('removeHiddenPeerDependencies()', () => {
  it('removes a hidden peer restored from a previous build manifest', () => {
    const packageJson = {
      peerDependencies: { visible: '^2.0.0' },
      peerDependenciesMeta: { visible: { optional: true } },
    };
    const previousBuildManifest = {
      peerDependencies: {
        visible: '^2.0.0',
        hidden: '^1.0.0',
      },
      peerDependenciesMeta: {
        visible: { optional: true },
        hidden: { optional: true },
      },
    };
    Object.assign(packageJson, previousBuildManifest);

    removeHiddenPeerDependencies(packageJson, [
      {
        getPackageName: () => 'hidden',
      },
    ]);

    expect(packageJson.peerDependencies).to.deep.equal({ visible: '^2.0.0' });
    expect(packageJson.peerDependenciesMeta).to.deep.equal({ visible: { optional: true } });
  });

  it('handles a missing peerDependenciesMeta field', () => {
    const packageJson = { peerDependencies: { hidden: '^1.0.0' } };

    removeHiddenPeerDependencies(packageJson, [{ getPackageName: () => 'hidden' }]);

    expect(packageJson.peerDependencies).to.be.empty;
  });

  it('removes hidden peer metadata when peerDependencies is absent', () => {
    const packageJson = { peerDependenciesMeta: { hidden: { optional: true } } };

    removeHiddenPeerDependencies(packageJson, [{ getPackageName: () => 'hidden' }]);

    expect(packageJson.peerDependenciesMeta).to.be.empty;
  });
});
