import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { IsolatorMain } from './isolator.main.runtime';

const depId = ComponentID.fromString('my-scope/dep@0.0.2');

function preparePackageJson(componentDepsToIgnore: ComponentIdList, includePeers: boolean) {
  const isolator = Object.create(IsolatorMain.prototype);
  isolator.logger = { debug: () => {} };
  isolator.dependencyResolver = { getComponentDependencies: () => [{ componentId: depId, versionRange: '+^' }] };
  const noDeps = { getAllIds: () => new ComponentIdList() };
  const legacyComp = {
    id: ComponentID.fromString('my-scope/user@0.0.2'),
    version: '0.0.2',
    mainFile: 'index.js',
    _getHomepage: () => undefined,
    packageDependencies: {},
    devPackageDependencies: {},
    peerPackageDependencies: {},
    extensions: new ExtensionDataList(),
    dependencies: noDeps,
    devDependencies: noDeps,
    peerDependencies: { getAllIds: () => ComponentIdList.fromArray([depId]) },
  };
  const component = { id: legacyComp.id, state: { _consumer: legacyComp } };
  return isolator.preparePackageJsonToWrite(component, '.', componentDepsToIgnore, includePeers).packageJsonObject;
}

describe('IsolatorMain.preparePackageJsonToWrite()', () => {
  it('should write the component peers with their resolved version when asked to', () => {
    const packageJson = preparePackageJson(new ComponentIdList(), true);
    expect(Object.values(packageJson.peerDependencies)).to.deep.equal(['^0.0.2']);
  });
  it('should not write the component peers by default', () => {
    const packageJson = preparePackageJson(new ComponentIdList(), false);
    expect(packageJson.peerDependencies).to.deep.equal({});
  });
  it('should not write a component peer that is part of the capsules', () => {
    const packageJson = preparePackageJson(ComponentIdList.fromArray([depId]), true);
    expect(packageJson.peerDependencies).to.deep.equal({});
  });
});
