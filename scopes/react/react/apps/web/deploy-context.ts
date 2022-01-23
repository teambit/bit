import { AppDeployContext } from '@teambit/application';
import { ReactAppBuildResult } from './react-build-result';

export type ReactDeployContext = ReactAppBuildResult & AppDeployContext;
