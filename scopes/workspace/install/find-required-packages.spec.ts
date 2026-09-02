import { expect } from 'chai';
import { findRequiredPackages } from './find-required-packages';

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
