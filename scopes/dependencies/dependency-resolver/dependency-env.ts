import type { EnvHandler } from '@teambit/envs';
import type { DependencyDetector } from './detector-hook';

export interface DependencyEnv {
  detectors?(): EnvHandler<DependencyDetector[] | null>;
}
