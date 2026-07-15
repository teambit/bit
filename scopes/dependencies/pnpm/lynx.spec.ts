import { expect } from 'chai';
import { resolveScriptPolicies } from './lynx';

describe('resolveScriptPolicies()', () => {
  it('should pass through the pnpm allow-all builds flag', () => {
    expect(resolveScriptPolicies({ dangerouslyAllowAllScripts: true })).to.deep.equal({
      allowBuilds: {},
      dangerouslyAllowAllBuilds: true,
    });
  });

  it('should preserve explicit never-built packages instead of passing the allow-all builds flag', () => {
    expect(
      resolveScriptPolicies({
        dangerouslyAllowAllScripts: true,
        neverBuiltDependencies: ['native-pkg'],
      })
    ).to.deep.equal({
      allowBuilds: {
        'native-pkg': false,
      },
      neverBuildPackageNames: ['native-pkg'],
    });
  });
});
