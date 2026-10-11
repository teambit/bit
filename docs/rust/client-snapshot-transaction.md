# Client snapshot transactions in Rust

With `BIT_RUST_CLIENT_VCS=on`, ordinary client snapshots and tags use one pinned Rust helper for transaction decisions, future versions, auto-tag graph traversal, dependency updates, metadata serialization, and object-store commit receipts. Public hooks, builders, class hydration, workspace links and transport remain Node callbacks at their existing boundaries.

The outer transaction covers initialization, pre-snapshot hooks, version preparation, lane capture, soft tagging or dependency flattening, interleaved object/workspace updates, staged configuration, builds, removal, lane updates, persistence, merge cleanup, links and cache cleanup. The repository transaction runs inside the existing persistence mutex. Public post-persistence callbacks retain their original position after mutex release.

A local cursor records completed public effects before waiting for Rust receipts. A missing helper, rejected response or terminated session resumes the remaining canonical suffix without repeating completed hooks or writes. The same helper owns all snapshot transaction tokens for a command; other client operations may have their own helper owners. Native object writes retain individual receipts. A failed concurrent repository write phase does not promise rollback or a complete ordered ledger of every write already made by the canonical pool.

## Ordinary objects and custom callbacks

Adapters check defining class identities, method descriptors, dependency containers and known framework hooks before invoking private planning. Unsupported custom objects and hooks continue through canonical behavior. Semver grammar comes from the defining Node package; Rust owns the ordinary version decisions. Guards preserve package-local function identities, mutable alias checks and callback order.

Version metadata uses a tagged JavaScript value representation so Rust preserves UTF-16 strings, numeric formatting, property order, undefined omission and JSON escaping. Rust projects the canonical Version, Component, Lane and LaneHistory fields, computes object identity, constructs headers and compresses the body. The adapter captures an immutable canonical projection before awaiting Rust so fallback retains the original serialization timing. This means ordinary metadata projection still has Node preparation work; serialization and compression are native.

Workspace file Sources carry a guarded disk descriptor through ordinary clones. Rust checks the raw file fingerprint before normalization, then constructs the canonical Source header and body. Existing repository Sources are read only when the object actually exists on disk. Newly generated Sources without disk provenance use bounded inline bytes; reports distinguish those bytes from workspace file bytes. Source header length follows Node's decoded UTF-16 length, including invalid UTF-8 replacement behavior.

Ordinary buffered build artifacts retain their capsule disk path through Vinyl cloning and Source creation. Their LF normalization preserves a BOM, matching canonical artifact behavior. Workspace Sources retain their own BOM stripping rule. Custom Vinyl accessors, streams, stat objects and unsupported clone shapes keep the canonical path; local builders and their callbacks remain Node operations.

Private transport uses the defining JSON serializer and declines patched serializers or inherited `toJSON` callbacks before encoding a frame. Unsupported inputs, stale aliases and helper failures preserve canonical execution; the implementation remains opt-in.
