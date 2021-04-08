import { ComponentTemplate } from '@teambit/generator';
import { reactComponent } from './templates/react-component';
import { reactComponentJSX } from './templates/react-component-jsx';
import { reactEnvTemplate } from './templates/react-env';

export const componentTemplates: ComponentTemplate[] = [reactComponent, reactComponentJSX, reactEnvTemplate];
