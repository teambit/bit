import { expect } from 'chai';
import { removeHiddenPeerDependencies } from './remove-hidden-peer-dependencies';

describe('removeHiddenPeerDependencies()', () => {
  it('removes a hidden peer restored from a previous build manifest', () => {
    const packageJson = { peerDependencies: { visible: '^2.0.0' } };
    const previousBuildManifest = {
      peerDependencies: {
        visible: '^2.0.0',
        hidden: '^1.0.0',
      },
    };
    Object.assign(packageJson, previousBuildManifest);

    removeHiddenPeerDependencies(packageJson, [
      {
        getPackageName: () => 'hidden',
      },
    ]);

    expect(packageJson.peerDependencies).to.deep.equal({ visible: '^2.0.0' });
  });
});
