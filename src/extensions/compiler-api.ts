import Vinyl from 'vinyl';
// import { PathOsBasedRelative, PathLinuxRelative } from '../utils/path';
// import { SourceFile } from '../consumer/component/sources';
// import ExtensionFile from './extension-file';
// import Capsule from '../../components/core/capsule';
// import ComponentWithDependencies from '../scope/component-dependencies';

export type CompilerResults = Vinyl[] | { dists: Vinyl[]; mainFile?: string; packageJson?: Record<string, any> };

// export type IsolateFunction = ({ targetDir?: string, shouldBuildDependencies?: boolean }) => {
//   capsule: Capsule,
//   componentWithDependencies: ComponentWithDependencies
// };

// export type ContextParam = {
//   componentObject: Object, // see src/consumer/component/consumer-component.js toObject() method
//   rootDistDir: PathOsBasedRelative,
//   componentDir: PathLinuxRelative,
//   isolate: Function
// };

// export interface CurrentCompiler {
//   run(files: SourceFile[], rootDistDir: PathOsBasedRelative, context: ContextParam): CompilerResults;
// }

// export interface FutureCompiler {
//   action({
//     files: SourceFile[],
//     rawConfig: Object,
//     dynamicConfig: Object,
//     configFiles: ExtensionFile[],
//     api: Object,
//     context: ContextParam
//   }): CompilerResults;
// }
