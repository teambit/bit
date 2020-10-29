import { PreviewRuntime } from '@teambit/preview';

import { GraphqlAspect } from './graphql.aspect';
import { GraphqlUI } from './graphql.ui.runtime';

GraphqlUI.runtime = PreviewRuntime;
GraphqlAspect.addRuntime(GraphqlUI);
