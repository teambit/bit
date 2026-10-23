import { RuntimeDefinition } from '@teambit/harmony';

/**
 * The runtime definitions every aspect declares its runtimes with. They live in this tiny module rather than in
 * the aspects that own them (cli, ui, preview) so that declaring a runtime doesn't make an aspect depend on
 * those aspects.
 */
export const MainRuntime = new RuntimeDefinition('main');
export const UIRuntime = new RuntimeDefinition('ui');
export const PreviewRuntime = new RuntimeDefinition('preview');
