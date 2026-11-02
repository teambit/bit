//! Caller-owned export phase progress events ([`Event`], [`scope`]) containing only operation metadata.
#[cfg(test)]
mod tests;

use std::{cell::RefCell, sync::mpsc::SyncSender};

/// Metadata-only progress event emitted during native export phases.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event {
    /// Exporting `objects` to remote `scope`.
    Transfer { scope: String, objects: usize },
    /// Starting remote verification phase.
    Verify,
    /// Completed remote verification phase.
    Verified,
    /// Persisting exported refs in remote `scope`.
    Persist { scope: String },
    /// Progress message emitted by the remote hub.
    HubMessage(String),
}
thread_local! {
    static CURRENT: RefCell<Option<SyncSender<Event>>> = const { RefCell::new(None) };
}
/// RAII guard restoring the previous thread-local [`Event`] sender on drop.
struct Restore(Option<SyncSender<Event>>);
impl Drop for Restore {
    fn drop(&mut self) {
        CURRENT.with(|current| current.replace(self.0.take()));
    }
}

/// Observe this operation, restoring the previous owner when the operation returns or unwinds.
#[inline]
pub fn scope<Output>(sender: &SyncSender<Event>, work: impl FnOnce() -> Output) -> Output {
    with_sender(Some(sender.clone()), work)
}

#[must_use]
#[inline]
pub(crate) fn current() -> Option<SyncSender<Event>> {
    CURRENT.with_borrow(Clone::clone)
}

#[inline]
pub(crate) fn with_sender<Output>(
    sender: Option<SyncSender<Event>>,
    work: impl FnOnce() -> Output,
) -> Output {
    let previous = CURRENT.with(|current| current.replace(sender));
    let _restore = Restore(previous);
    work()
}

/// Return whether the owning caller received this phase; no observer means no output.
#[must_use]
pub fn emit(event: Event) -> bool {
    let event = match event {
        Event::Transfer { scope, objects } => {
            let Some(scope) = non_empty_trimmed(scope) else { return false };
            Event::Transfer { scope, objects }
        }
        Event::Persist { scope } => {
            let Some(scope) = non_empty_trimmed(scope) else { return false };
            Event::Persist { scope }
        }
        Event::HubMessage(message) => {
            let Some(message) = non_empty_trimmed(message) else { return false };
            Event::HubMessage(message)
        }
        other => other,
    };
    CURRENT.with_borrow(|current| {
        current
            .as_ref()
            .is_some_and(|sender| sender.send(event).is_ok())
    })
}

#[inline]
fn non_empty_trimmed(text: String) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else if trimmed.len() == text.len() {
        Some(text)
    } else {
        Some(trimmed.to_owned())
    }
}
