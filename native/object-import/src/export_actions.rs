//! Reuse a caller's published file-scope server adapter without moving component bodies.
#[cfg(test)]
mod tests;

use serde_json::Value;
use std::{cell::RefCell, io, path::Path, sync::Arc};

type Callback = dyn Fn(&Path, &str, &Value) -> io::Result<Value> + Send + Sync;

/// An operation's metadata-only file-remote server actions.
#[derive(Clone)]
pub struct Handler(Arc<Callback>);
impl Handler {
    #[must_use]
    pub fn new(
        callback: impl Fn(&Path, &str, &Value) -> io::Result<Value> + Send + Sync + 'static,
    ) -> Self {
        Self(Arc::new(callback))
    }
    pub(crate) fn call(&self, path: &Path, name: &str, options: &Value) -> io::Result<Value> {
        (self.0)(path, name.trim(), options)
    }
}
thread_local! {
    static CURRENT: RefCell<Option<Handler>> = const { RefCell::new(None) };
}
/// Restore the caller's prior adapter when this operation binding ends.
#[must_use]
pub struct Binding(Option<Handler>);
impl Drop for Binding {
    fn drop(&mut self) {
        CURRENT.with(|current| current.replace(self.0.take()));
    }
}

/// Capture the adapter when dispatching an operation onto its worker pool.
#[must_use]
pub fn current() -> Option<Handler> {
    CURRENT.with(|current| current.borrow().clone())
}

/// Bind an adapter to this operation and restore the prior binding on return or unwind.
pub fn scope<Output>(handler: Option<Handler>, work: impl FnOnce() -> Output) -> Output {
    let _binding = bind(handler);
    work()
}

/// Bind an adapter on the dispatch thread until the returned guard is dropped.
pub fn bind(handler: Option<Handler>) -> Binding {
    Binding(CURRENT.with(|current| current.replace(handler)))
}
