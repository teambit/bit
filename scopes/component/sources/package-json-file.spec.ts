import { expect } from 'chai';
import { PackageJsonFile } from './package-json-file';

describe('PackageJsonFile', () => {
  describe('sortDependencies', () => {
    it('should sort the dependencies fields by package name and leave the rest of the object untouched', () => {
      const packageJson = PackageJsonFile.create('/tmp/comp', undefined, {
        name: 'my-pkg',
        version: '1.0.0',
        dependencies: { lodash: '4.0.0', '@my-org/b': '1.0.0', '@my-org/a': '1.0.0' },
        devDependencies: { mocha: '1.0.0', chai: '1.0.0' },
        peerDependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', '@types/react': '^18.0.0' },
        peerDependenciesMeta: { react: { optional: true }, '@types/react': { optional: true } },
      });
      packageJson.sortDependencies();
      const obj = packageJson.packageJsonObject;
      expect(Object.keys(obj)).to.deep.equal([
        'name',
        'version',
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'peerDependenciesMeta',
      ]);
      expect(Object.keys(obj.dependencies)).to.deep.equal(['@my-org/a', '@my-org/b', 'lodash']);
      expect(obj.dependencies.lodash).to.equal('4.0.0');
      expect(Object.keys(obj.devDependencies)).to.deep.equal(['chai', 'mocha']);
      expect(Object.keys(obj.peerDependencies)).to.deep.equal(['@types/react', 'react', 'react-dom']);
      expect(Object.keys(obj.peerDependenciesMeta)).to.deep.equal(['@types/react', 'react']);
    });

    it('should not add missing dependencies fields', () => {
      const packageJson = PackageJsonFile.create('/tmp/comp', undefined, { name: 'my-pkg', version: '1.0.0' });
      packageJson.sortDependencies();
      expect(packageJson.packageJsonObject).to.deep.equal({ name: 'my-pkg', version: '1.0.0' });
    });
  });
});
