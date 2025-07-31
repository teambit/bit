import type { EnvHandler } from '@teambit/envs';
import type { DependencyDetector } from '@teambit/dependency-resolver';

export interface DependencyEnv {
  detectors?(): EnvHandler<DependencyDetector[] | null>;
}
