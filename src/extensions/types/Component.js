/** @flow */

// import BaseType, { ModelStore } from './base-type';
import BaseType from './base-type';

export type ComponentId = string;

export default class Component extends BaseType {
  name: string;
  version: ?string;
  scope: ?string;
  lang: string;
  // bindingPrefix: string;
  mainFile: PathOsBased;
  files: SourceFile[];
  dists: Dists;
  compiler: ?CompilerExtension;
  tester: ?TesterExtension;
  // bitJson: ?ComponentBitJson;
  dependencies: Dependencies;
  devDependencies: Dependencies;
  // compilerDependencies: Dependencies;
  // testerDependencies: Dependencies;
  packageDependencies: Object;
  devPackageDependencies: Object;
  peerPackageDependencies: Object;
  // compilerPackageDependencies: Object;
  // testerPackageDependencies: Object;
  docs: ?(Doclet[]);
  // specsResults: ?(SpecsResults[]);
  license: ?License;
  log: ?Log;
  writtenPath: ?string; // needed for generate links
  originallySharedDir: ?PathLinux; // needed to reduce a potentially long path that was used by the author
  componentMap: ?ComponentMap; // always populated when the loadedFromFileSystem is true
  // componentFromModel: ?Component; // populated when loadedFromFileSystem is true and it exists in the model
  // isolatedEnvironment: IsolatedEnvironment;
  // issues: { [label: $Keys<typeof componentIssuesLabels>]: { [fileName: string]: string[] | BitId[] | string | BitId } };
  deprecated: boolean;
  origin: ComponentOrigin;
  // detachedCompiler: ?boolean;
  // detachedTester: ?boolean;
  customResolvedPaths: customResolvedPath[];
  // _driver: Driver;
  // _isModified: boolean;
  // packageJsonInstance: PackageJsonInstance;
  // _currentlyUsedVersion: BitId; // used by listScope functionality
  // pendingVersion: Version;

  constructor(componentId: ComponentId) {
    super(val);
    this.name = 'component';
    // set all props
    // TODO: load component
  }

  // Called before saving type to models
  store(): ModelStore {
    return this.toObject();
  }

  // Called when loading the value from the model
  // Return an instance of the Component
  static loadFromStore(componentId: ComponentId): Component {
    return new Component(componentId);
  }

  /**
   * Validate the user input (as written in the bit.json)
   */
  static validate(): boolean {
    // validate component id is valid
  }

  // Return an instance of isolated env for that component
  createIsolatedEnv(envOptions: EnvOptions): Environment {}
}

// Called to create instance from the bit.json value
function _loadComponent(componentId: ComponentId): ConsumerComponent {
  return _loadFromCorrectSource(componentId);
}

function _loadFromCorrectSource(componentId: ComponentId): ConsumerComponent {
  // check in bitmap if it's imported and load from there
  // check in component's cache and load from there
  // import into component cache then load from there
}
