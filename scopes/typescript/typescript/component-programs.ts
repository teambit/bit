import { ComponentID } from '@teambit/component-id';
import ts from 'typescript';

type ComponentProgram = {
  componentDir: string; // absolute path in the fs that contains the tsconfig.json and component files
  componentId: ComponentID;
  program?: ts.Program;
};

export class ComponentPrograms {
  constructor(private componentPrograms: ComponentProgram[], private tsModule: typeof ts) {}

  startWatch() {
    const host = this.tsModule.createSolutionBuilderWithWatchHost(
      undefined,
      undefined,
      undefined,
      undefined,
      reportWatch
    );

    const dirs = this.componentPrograms.map((c) => c.componentDir);
    const solutionBuilder = this.tsModule.createSolutionBuilderWithWatch(host, dirs, { verbose: false });
    solutionBuilder.build();

    const { componentPrograms } = this;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function reportWatch(diag: ts.Diagnostic) {
      const proj = solutionBuilder.getNextInvalidatedProject();
      // @ts-ignore
      if (proj && proj.getProgram) {
        const progSource = proj as any as ts.BuilderProgram;
        const program = progSource.getProgram();
        const projectDir = proj.project;
        const dirWithoutTsconfig = projectDir.replace(/[/\\]tsconfig.json/, '');
        const compProg = componentPrograms.find((c) => c.componentDir === dirWithoutTsconfig);
        if (!compProg) {
          throw new Error(`unable to find the component-id of ${projectDir}`);
        }
        compProg.program = program;
      }
    }
  }

  getProgram(id: ComponentID): ts.Program | undefined {
    return this.componentPrograms.find((c) => c.componentId.isEqual(id))?.program;
  }
}
