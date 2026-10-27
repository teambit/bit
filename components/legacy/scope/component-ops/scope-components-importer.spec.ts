import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ModelComponent, Version, Ref } from '@teambit/objects';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import Scope from '../scope';

const hash = (name: string) => Buffer.from(name.padEnd(20, '-')).toString('hex');

describe('ScopeComponentsImporter', () => {
  describe('bitIdsToVersionDeps', () => {
    let scope: Scope;
    let scopePath: string;
    const depId = (name: string) => ComponentID.fromObject({ scope: 'importer-spec', name, version: hash(name) });
    before(async () => {
      scopePath = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-importer-spec-'));
      scope = await Scope.ensure(scopePath, 'importer-spec');
      const objects: Array<ModelComponent | Version> = [];
      const add = (name: string, deps: string[]) => {
        const component = ModelComponent.from({ name, scope: 'importer-spec' } as any);
        component.setHead(Ref.from(hash(name)));
        const version = new Version({
          mainFile: 'index.ts',
          files: [],
          log: { message: '', date: '0', username: 'u', email: 'e' },
          hash: hash(name),
          parents: [],
        } as any);
        version.flattenedDependencies = ComponentIdList.fromArray(deps.map(depId));
        objects.push(component, version);
      };
      add('button', ['icon', 'theme', 'missing']);
      add('icon', ['theme']);
      add('theme', []);
      scope.objects.addMany(objects);
      await scope.objects.persist(false);
    });
    after(async () => {
      await fs.remove(scopePath);
    });
    it('should resolve the flattened dependencies of each version, and leave out a dependency that is not in the scope', async () => {
      const ids = ComponentIdList.fromArray(['button', 'icon', 'theme'].map(depId));
      const versionDeps = await (scope.scopeImporter as any).bitIdsToVersionDeps(ids, false, false);
      const resolved = Object.fromEntries(
        versionDeps.map((versionDep) => [
          versionDep.component.id.name,
          versionDep.dependencies.map((dep) => dep.id.toString()).sort(),
        ])
      );
      expect(resolved).to.deep.equal({
        button: [depId('icon').toString(), depId('theme').toString()],
        icon: [depId('theme').toString()],
        theme: [],
      });
    });
  });
});
