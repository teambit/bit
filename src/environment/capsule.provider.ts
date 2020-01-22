import CapsuleBuilder from './capsule-builder';

export type CapsuleDeps = [];

export type CapsuleConfig = {};

export default async function provideCapsule(config: CapsuleConfig, []: CapsuleDeps) {
  return new CapsuleBuilder('any');
}
