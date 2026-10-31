//! Caller-owned export phase events contain only operation metadata.
#[cfg(test)]
mod tests;

use std::{cell::RefCell, sync::mpsc::SyncSender};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event {
    Transfer { scope: String, objects: usize },
    Verify,
    Verified,
    Persist { scope: String },
    HubMessage(String),
}
thread_local! {
    static CURRENT: RefCell<Option<SyncSender<Event>>> = const { RefCell::new(None) };
}
struct Restore(Option<SyncSender<Event>>);
impl Drop for Restore {
    fn drop(&mut self) {
        CURRENT.with(|current| current.replace(self.0.take()));
    }
}

/// Observe this operation, restoring the previous owner when the operation returns or unwinds.
pub fn scope<Output>(sender: &SyncSender<Event>, work: impl FnOnce() -> Output) -> Output {
    with_sender(Some(sender.clone()), work)
}

#[must_use]
pub(crate) fn current() -> Option<SyncSender<Event>> {
    CURRENT.with(|current| current.borrow().clone())
}

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
            Event::Transfer { scope: scope.trim().to_owned(), objects }
        }
        Event::Persist { scope } => Event::Persist { scope: scope.trim().to_owned() },
        other => other,
    };
    current().is_some_and(|sender| sender.send(event).is_ok())
}
