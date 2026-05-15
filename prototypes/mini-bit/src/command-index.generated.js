// AUTO-GENERATED — do not edit by hand.
// In real Bit this is emitted by codegen at publish time (see RFC §6.3).
// For the prototype we author it directly to keep the demo self-contained.
//
// Importing this file is cheap: descriptors are pure data, and the .commands.js
// files do NOT import their .main.runtime.js. So `bit --help`, `bit completion`,
// and the unknown-command path never touch a runtime module.

import statusDescriptors from './status/status.commands.js';
import installDescriptors from './install/install.commands.js';
import compilerDescriptors from './compiler/compiler.commands.js';
import workspaceDescriptors from './workspace/workspace.commands.js';

export const ALL_DESCRIPTORS = [
  ...statusDescriptors,
  ...installDescriptors,
  ...compilerDescriptors,
  ...workspaceDescriptors,
];

export const COMMAND_INDEX = {};
for (const d of ALL_DESCRIPTORS) {
  COMMAND_INDEX[d.name] = { aspectId: d.aspectId };
  if (d.alias) COMMAND_INDEX[d.alias] = { aspectId: d.aspectId };
}
