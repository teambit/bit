import { ComponentUI, ComponentAspect } from '../component';
import { CompositionsSection } from './composition.section';

export class CompositionsUI {
  static id = '@teambit/compositions';
  static dependencies = [ComponentAspect];

  static async provider([component]: [ComponentUI]) {
    const compositions = new CompositionsUI();
    const section = new CompositionsSection(compositions);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink);

    return compositions;
  }
}

export default CompositionsUI;
