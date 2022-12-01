import { validateEnvPolicyLegacyConfigObject } from './validate-env-policy';

describe('validateEnvPolicyLegacyConfigObject', () => {
  it('should throw an exception if peer supportedRange is empty', () => {
    expect(() => validateEnvPolicyLegacyConfigObject({ peers: [{ name: 'peer', supportedRange: '' }] } as any)).toThrowError(
      'Peer "peer" has an empty supportedRange'
    );
  });
  it('should throw an exception if peer supportedRange is null', () => {
    expect(() => validateEnvPolicyLegacyConfigObject({ peers: [{ name: 'peer', supportedRange: null }] } as any)).toThrowError(
      'Peer "peer" has no supportedRange set'
    );
  });
  it('should throw an exception if peer version is empty', () => {
    expect(() =>
      validateEnvPolicyLegacyConfigObject({ peers: [{ name: 'peer', supportedRange: '1', version: '' }] } as any)
    ).toThrowError('Peer "peer" has an empty version');
  });
  it('should throw an exception if peer version is null', () => {
    expect(() =>
      validateEnvPolicyLegacyConfigObject({ peers: [{ name: 'peer', supportedRange: '1', version: null }] } as any)
    ).toThrowError('Peer "peer" has no version set');
  });
});
