/**
 * Delegates to SchemaNode.diff() — each schema subclass defines its own diff behavior.
 * This file exists for backwards compatibility and as a convenience entry point.
 */
import type { SchemaNode, SchemaChangeFact } from '@teambit/semantics.entities.semantic-schema';

export function computeDetailedDiff(baseNode: SchemaNode, compareNode: SchemaNode): SchemaChangeFact[] {
  return baseNode.diff(compareNode);
}
