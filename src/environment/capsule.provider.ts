import { Workspace } from '../workspace';
import CapsuleBuilder from './capsule-builder';

export type CapsuleDeps = [Workspace];

export type CapsuleConfig = {};

export default async function provideCapsule(config: CapsuleConfig, [workspace]: CapsuleDeps) {
  return new CapsuleBuilder(workspace.path);
}
