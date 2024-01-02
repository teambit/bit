import { EnvHandler } from '@teambit/envs';
import { DependencyDetector } from './dependency-detector';

export interface DependencyEnv {
  detectors?(): EnvHandler<DependencyDetector[] | null>;
}
