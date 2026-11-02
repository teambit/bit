//! Unit tests for [`WorkspaceSession`] stack frame size bounds and heap-owned operation state ([`retained_operation_state_does_not_inflate_caller_stack_frames`]) in `bit-object-import`.

use super::WorkspaceSession;

#[test]
fn retained_operation_state_does_not_inflate_caller_stack_frames() {
    assert!(
        std::mem::size_of::<WorkspaceSession>() <= 1024,
        "workspace sessions cross deep CLI frames; operation state must stay heap-owned",
    );
}
