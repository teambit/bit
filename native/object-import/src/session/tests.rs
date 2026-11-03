//! Unit tests for [`WorkspaceSession`] stack frame size bounds and heap-owned operation state ([`retained_operation_state_does_not_inflate_caller_stack_frames`]) across deep CLI call stacks in `bit-object-import`.

use super::WorkspaceSession;

/// Verifies that [`WorkspaceSession`] stack size (`std::mem::size_of`) remains at most 1024 bytes by boxing large operation state structs across CLI frames.
#[test]
fn retained_operation_state_does_not_inflate_caller_stack_frames() {
    assert!(
        std::mem::size_of::<WorkspaceSession>() <= 1024,
        "workspace sessions cross deep CLI frames; operation state must stay heap-owned",
    );
}
