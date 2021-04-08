import { ComponentTemplate } from '@teambit/generator';
import { reactComponent } from './templates/react-component';
import { reactComponentJS } from './templates/react-component-js';
import { reactEnvTemplate } from './templates/react-env';

export const componentTemplates: ComponentTemplate[] = [reactComponent, reactComponentJS, reactEnvTemplate];
