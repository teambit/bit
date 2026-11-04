import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { isEnvOfComponent } from './remove.main.runtime';

function componentWithEnv(envId?: string): any {
  const envsData = envId ? { data: { id: envId } } : undefined;
  return { state: { aspects: { get: (id: string) => (id === 'teambit.envs/envs' ? envsData : undefined) } } };
}

describe('isEnvOfComponent', () => {
  const myEnv = ComponentID.fromString('my-org.envs/my-env@abc1234567890abcdef1234567890abcdef12345');
  it('should return true when the id is the env of the component, regardless of the version', () => {
    expect(isEnvOfComponent(componentWithEnv('my-org.envs/my-env@2.0.7'), myEnv)).to.be.true;
  });
  it('should return false when the component has a different env (the id is a regular dependency)', () => {
    expect(isEnvOfComponent(componentWithEnv('my-org.envs/other-env@1.0.0'), myEnv)).to.be.false;
  });
  it('should return true when the env data is missing', () => {
    expect(isEnvOfComponent(componentWithEnv(), myEnv)).to.be.true;
  });
});
