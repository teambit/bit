import { MainRuntime } from '@teambit/cli';
import InstallAspect, { InstallMain } from '@teambit/install';
import { ComponentWriterAspect } from './component-writer.aspect';
import { ManyComponentsWriterParams, ManyComponentsWriter } from './many-components-writer';

export class ComponentWriterMain {
  constructor(private install: InstallMain) {}

  async writeMany(opts: ManyComponentsWriterParams) {
    const manyComponentsWriter = new ManyComponentsWriter(this.install, opts);
    return manyComponentsWriter.writeAll();
  }

  static slots = [];

  static dependencies = [InstallAspect];

  static runtime = MainRuntime;

  static async provider([install]: [InstallMain]) {
    return new ComponentWriterMain(install);
  }
}

ComponentWriterAspect.addRuntime(ComponentWriterMain);

export default ComponentWriterMain;
