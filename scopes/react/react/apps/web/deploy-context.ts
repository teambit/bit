import type { AppDeployContext } from '@teambit/application';
import type { ReactAppBuildResult } from './react-build-result';

export type ReactDeployContext = ReactAppBuildResult & AppDeployContext;
