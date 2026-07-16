import os from 'os';
import { join } from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import { generateLink } from './generate-link';

function mockComponentMap(ids: { scope: string; fullName: string }[]) {
  return {
    toArray: () =>
      ids.map(({ scope, fullName }) => [
        {
          id: {
            toStringWithoutVersion: () => `${scope}/${fullName}`,
            version: '0.0.1',
            scope,
            fullName,
          },
        },
        [`/fake/${scope}/${fullName.replace(/\//g, '-')}.docs.mdx`],
      ]),
  } as any;
}

describe('generateLink', () => {
  // generateLink writes a preview-modules-<hash>.mjs side file; without an
  // explicit tempPackageDir it lands in previewDistDir, which can fall back to
  // this component's own directory — keep test output in a throwaway temp dir.
  let tmpDir: string;
  before(() => {
    tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'bit-generate-link-'));
  });
  after(() => {
    fs.removeSync(tmpDir);
  });

  const genLink = (ids: { scope: string; fullName: string }[]) =>
    generateLink('overview', mockComponentMap(ids), undefined, false, tmpDir);

  describe('componentMap entries', () => {
    it('emits a plain entry for a fullName that appears once', () => {
      const contents = genLink([{ scope: 'org.scope', fullName: 'ui/button' }]);
      expect(contents).to.include('"ui/button": [file_0_0]');
    });

    // the componentMap is keyed by fullName, which carries no scope. components
    // from different scopes sharing a fullName (served by one deduped dev server)
    // used to emit duplicate object keys — the last entry silently won, and since
    // non-active components resolve to a null-rendering Placeholder, every other
    // same-named component's preview rendered blank without any error.
    it('emits a single runtime-conditional entry when the same fullName exists in several scopes', () => {
      const contents = genLink([
        { scope: 'org.scope-a', fullName: 'readme' },
        { scope: 'org.scope-b', fullName: 'readme' },
        { scope: 'org.scope-c', fullName: 'readme' },
      ]);
      const entries = contents.match(/"readme":/g);
      expect(entries).to.have.lengthOf(1);
      expect(contents).to.include(
        '"readme": __bitShouldSurfaceFor("org.scope-a/readme") ? [file_0_0] : ' +
          '__bitShouldSurfaceFor("org.scope-b/readme") ? [file_1_0] : ' +
          '__bitShouldSurfaceFor("org.scope-c/readme") ? [file_2_0] : [file_2_0]'
      );
    });

    it('keeps plain entries for non-colliding names alongside a colliding group', () => {
      const contents = genLink([
        { scope: 'org.scope-a', fullName: 'ui/card' },
        { scope: 'org.scope-a', fullName: 'readme' },
        { scope: 'org.scope-b', fullName: 'readme' },
      ]);
      expect(contents).to.include('"ui/card": [file_0_0]');
      expect(contents).to.include(
        '"readme": __bitShouldSurfaceFor("org.scope-a/readme") ? [file_1_0] : ' +
          '__bitShouldSurfaceFor("org.scope-b/readme") ? [file_2_0] : [file_2_0]'
      );
    });
  });
});
