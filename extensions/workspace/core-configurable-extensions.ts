// TODO: make this in a better way
// This used by the workspace to do:
// 1. know which extensions to look in the workspace itself (in the bitmap) and which are core
// 2. to have the manifest for the core extensions so it will be able to load it
import { ComposerExt } from '@bit/bit.core.composer';
import { PackageManagerExt } from '@bit/bit.core.package-manager';
import workspaceExt from './workspace.manifest';
import { FlowsExt } from '@bit/bit.core.flows';
import { CreateExt } from '@bit/bit.core.create';

const coreConfigurableExtensions = {
  // TODO: change the way we get the name when moving to decorators
  [ComposerExt.name]: ComposerExt,
  [FlowsExt.name]: FlowsExt,
  [CreateExt.name]: CreateExt,
  // TODO: take the name from the extension. Its hard coded because currently that's how it is in the config
  dependencyResolver: PackageManagerExt,
  [workspaceExt.name]: workspaceExt
};

export { coreConfigurableExtensions };
