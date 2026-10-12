# Client history reset in Rust

Repository history reset and untag use the Rust client engine when `BIT_RUST_CLIENT_VCS=on`. This operation is separate from restoring workspace files with `checkout reset`. It retains the existing public reset, soft-tag reset and never-exported reset routes.

An awaited reset owns one helper lease and serialized request broker. Rust tracks completed operation phases and forks independent component cursors before the existing concurrent component map. Public callbacks remain concurrent; a rejected component does not cause the caller to await unrelated siblings. A retired helper is not replaced during that operation, and completed public effects are not replayed to reconstruct its cursor.

Concurrent component removals queue the default unmerged-state initialize, transition and apply sequence per helper session. Persistence uses the same queue. Each queued operation captures the current state after its predecessor finishes, so concurrent removals cannot reuse a stale revision. Public component callbacks remain outside this queue.

Rust selects staged and removed candidates, pattern membership, local-history unions and lane filtering, tag labels, immediate dependents and ref mutations from bounded metadata. Canonical model loaders still observe divergence, cached Versions and lane heads at their original boundaries. The dependency loader retains model and Version nodes, completion order and the canonical assignment of `Version.id`; Rust constructs its inbound dependency index from the resulting flattened-dependency strings. Ordinary dependency graph loading remains available to other callers.

Ref planning accepts a cached `Version.id` data alias only when the canonical dependency loader recorded that exact assignment. Other method shadows, custom accessors and changed defining methods retain canonical behavior. Selectors recheck captured descriptors, metadata and object aliases after the helper acknowledgement before applying their result. Helper loss resumes the remaining observed algorithm without repeating discovery callbacks.

The shared Version reader validates ordinary dependency, flattened-edge and extension metadata before traversing history. Eligibility validation leaves the returned Version JSON intact. Unsupported builder artifact shapes retain the existing conservative fallback; the reset engine does not weaken helper retirement after a failed request.

Lane history pruning deletes entries from the original history map and preserves retained row aliases. Rust also projects and serializes ordinary LaneHistory metadata, including its stable identity derived from the lane hash. Changing a history entry does not change that identity. Unsupported objects, accessors and changed metadata use the existing model methods.

Real reset preserves its effect order: candidate selection, dependency checks and concurrent component mutation; lane history pruning; repository persistence; serial bitmap updates; staged-snapshot writing; consumer cleanup. Hidden lane dependents retain their existing bitmap exclusions. Soft reset still calls the bitmap lookup and clears each selected entry serially, including the existing duplicate-entry behavior. Never-exported reset deletes repository objects before its bitmap callbacks and bitmap write.

These operations are not atomic repository transactions. Earlier canonical mutations can remain when a later callback fails. Node retains public component objects, scope and model loaders, bitmap lifecycle callbacks and error presentation. Reset does not delete orphaned version labels or collect Version objects as an additional side effect. The client migration remains tracked by #73.

## Qualification

Qualification and whole-command measurements are in progress. This document does not yet record a frozen production revision or a completed command proof.
