import Network from './network';
import { CapsuleExt } from '../capsule';
import { PackageManagerExt } from '../package-manager';

export default {
  name: 'Network',
  dependencies: [PackageManagerExt, CapsuleExt],
  provider: Network.provide
};
