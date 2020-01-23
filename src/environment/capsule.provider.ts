import CapsuleBuilder from './capsule-builder';

export type CapsuleDeps = [];

export type CapsuleConfig = {};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function provideCapsule(config: CapsuleConfig) {
  return new CapsuleBuilder('any');
}
