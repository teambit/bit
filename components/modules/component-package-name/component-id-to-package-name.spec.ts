import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { componentIdToPackageName } from './component-id-to-package-name';

describe('componentIdToPackageName', () => {
  const id = ComponentID.fromString('acme.pkgs/app');
  it('should derive the name from the id when nothing is configured', () => {
    expect(componentIdToPackageName({ id, extensions: new ExtensionDataList() })).to.equal('@acme/pkgs.app');
  });
  it('should take the name configured by the dependency-resolver, e.g. the one of a pnpm project', () => {
    const extensions = ExtensionDataList.fromConfigObject({
      'teambit.dependencies/dependency-resolver': { packageName: '@acme/app' },
    });
    expect(componentIdToPackageName({ id, extensions })).to.equal('@acme/app');
  });
});
