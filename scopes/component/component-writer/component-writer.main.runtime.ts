import { MainRuntime } from '@teambit/cli';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import InstallAspect, { InstallMain } from '@teambit/install';
import { ComponentWriterAspect } from './component-writer.aspect';
import { ManyComponentsWriterParams, ManyComponentsWriter } from './many-components-writer';

export class ComponentWriterMain {
  constructor(private install: InstallMain, private compiler: CompilerMain) {}

  async writeMany(opts: ManyComponentsWriterParams) {
    const manyComponentsWriter = new ManyComponentsWriter(this.install, this.compiler, opts);
    return manyComponentsWriter.writeAll();
  }

  static slots = [];

  static dependencies = [InstallAspect, CompilerAspect];

  static runtime = MainRuntime;

  static async provider([install, compiler]: [InstallMain, CompilerMain]) {
    return new ComponentWriterMain(install, compiler);
  }
}

ComponentWriterAspect.addRuntime(ComponentWriterMain);

export default ComponentWriterMain;
