import { expect } from 'chai';
import { findRequiredPackages, findPhantomPackages } from './find-required-packages';

const LEGACY_CORE_ENV_PACKAGES = ['@teambit/aspect', '@teambit/react', '@teambit/node', '@teambit/react-native'];

describe('findRequiredPackages', () => {
  it('should find a package required by a compiled source', () => {
    const source = `const data = require("@teambit/aspect");`;
    expect(findRequiredPackages([source], LEGACY_CORE_ENV_PACKAGES)).to.deep.equal(['@teambit/aspect']);
  });

  it('should find a package imported with single quotes', () => {
    const source = `import { AspectAspect } from '@teambit/aspect';`;
    expect(findRequiredPackages([source], LEGACY_CORE_ENV_PACKAGES)).to.deep.equal(['@teambit/aspect']);
  });

  it('should not match a package whose name is a prefix of the required one', () => {
    const source = `const data = require("@teambit/react-native");`;
    expect(findRequiredPackages([source], LEGACY_CORE_ENV_PACKAGES)).to.deep.equal(['@teambit/react-native']);
  });

  it('should find packages across all the given sources', () => {
    const sources = [`require("@teambit/aspect")`, `require("@teambit/react")`, `require("lodash")`];
    expect(findRequiredPackages(sources, LEGACY_CORE_ENV_PACKAGES)).to.deep.equal([
      '@teambit/aspect',
      '@teambit/react',
    ]);
  });

  it('should return an empty array when none of the packages is required', () => {
    const source = `const data = require("@teambit/envs");`;
    expect(findRequiredPackages([source], LEGACY_CORE_ENV_PACKAGES)).to.deep.equal([]);
  });

  it('should return an empty array when there are no sources', () => {
    expect(findRequiredPackages([], LEGACY_CORE_ENV_PACKAGES)).to.deep.equal([]);
  });

  it('should find a package required by a sub-path of it', () => {
    const source = `require("@teambit/aspect/dist/aspect.main.runtime")`;
    expect(findRequiredPackages([source], LEGACY_CORE_ENV_PACKAGES)).to.deep.equal(['@teambit/aspect']);
  });

  it('should not match an occurrence that is not a specifier of its own', () => {
    const source = `const docs = 'see @teambit/aspect for the aspect env';`;
    expect(findRequiredPackages([source], LEGACY_CORE_ENV_PACKAGES)).to.deep.equal([]);
  });
});

describe('findPhantomPackages', () => {
  const sources = [`require("@teambit/aspect");require("@teambit/react")`];

  it('should return the required packages that the package.json does not declare', () => {
    const packageJson = { dependencies: { '@teambit/react': '1.0.1107' } };
    expect(findPhantomPackages(sources, LEGACY_CORE_ENV_PACKAGES, packageJson)).to.deep.equal(['@teambit/aspect']);
  });

  it('should not return a package declared as a peer dependency', () => {
    const packageJson = { peerDependencies: { '@teambit/aspect': '1.0.1107' } };
    expect(findPhantomPackages(sources, LEGACY_CORE_ENV_PACKAGES, packageJson)).to.deep.equal(['@teambit/react']);
  });

  it('should not return a package declared as an optional dependency', () => {
    const packageJson = { optionalDependencies: { '@teambit/aspect': '1.0.1107' } };
    expect(findPhantomPackages(sources, LEGACY_CORE_ENV_PACKAGES, packageJson)).to.deep.equal(['@teambit/react']);
  });

  it('should return all the required packages when nothing is declared', () => {
    expect(findPhantomPackages(sources, LEGACY_CORE_ENV_PACKAGES, {})).to.deep.equal([
      '@teambit/aspect',
      '@teambit/react',
    ]);
  });

  it('should return an empty array when all the required packages are declared', () => {
    const packageJson = { dependencies: { '@teambit/aspect': '1.0.1107', '@teambit/react': '1.0.1107' } };
    expect(findPhantomPackages(sources, LEGACY_CORE_ENV_PACKAGES, packageJson)).to.deep.equal([]);
  });
});
