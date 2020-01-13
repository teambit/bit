import { CreateConfig, WorkspaceCapsules } from './types';

export default class Capsule {
  create(component, config: CreateConfig) {}

  list(): ComponentCapsule[] {}

  listAll(): WorkspaceCapsules {}
}
