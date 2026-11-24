import { expect } from 'chai';
import { ExternalEnvWithoutVersion } from './external-env-without-version';

describe('ExternalEnvWithoutVersion', () => {
  it('should suggest updating the env for all components at once', () => {
    const issue = new ExternalEnvWithoutVersion();
    issue.data = { envId: 'my-org.my-scope/my-env', componentId: 'my-org.my-scope/comp1@0.0.1' };
    expect(issue.formatSolution()).to.include('bit envs update my-org.my-scope/my-env');
  });
});
