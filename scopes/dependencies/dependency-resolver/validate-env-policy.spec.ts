import { validateEnvPolicy } from './validate-env-policy';

describe('validateEnvPolicy', () => {
  it('should throw an exception if peer supportedRange is empty', () => {
    expect(() => validateEnvPolicy({ peers: [{ name: 'peer', supportedRange: '' }] } as any)).toThrowError(
      'Peer "peer" has an empty supportedRange'
    );
  });
  it('should throw an exception if peer supportedRange is null', () => {
    expect(() => validateEnvPolicy({ peers: [{ name: 'peer', supportedRange: null }] } as any)).toThrowError(
      'Peer "peer" has no supportedRange set'
    );
  });
});
