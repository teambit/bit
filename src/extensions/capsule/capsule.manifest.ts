import Capsule from './capsule';
import { PackageManagerExt } from '../package-manager';

export default {
  name: 'Capsule',
  dependencies: [PackageManagerExt],
  provider: Capsule.provide
};
