import { MainRuntime } from '@teambit/cli';
import { ElementsAspect } from './elements.aspect';
import { ElementTask } from './elements.task';

export class ElementsMain {
  getElementsDirName(): string {
    // const envName = context.id.replace('/', '__');
    // const compName = componentId.toString().replace('/', '__');
    // return join(`${envName}-elements`, compName);
    return '__element';
  }

  createTask() {
    return new ElementTask(this);
  }

  static slots = [];
  static dependencies = [];
  static runtime = MainRuntime;
  static async provider() {
    const elements = new ElementsMain();
    // bundler.registerTarget([
    //   {
    //     entry: elements.getPreviewTarget.bind(preview),
    //   },
    // ]);
    return elements;
  }
}

ElementsAspect.addRuntime(ElementsMain);
