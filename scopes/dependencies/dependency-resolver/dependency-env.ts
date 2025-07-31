import type { EnvHandler } from '@teambit/envs';
import type { DependencyDetector } from './dependency-detector';

export interface DependencyEnv {
  detectors?(): EnvHandler<DependencyDetector[] | null>;
}
