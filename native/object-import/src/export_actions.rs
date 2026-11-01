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
        let path = path.to_str().map_or(path, |text| Path::new(text.trim()));
        let name = name.trim();
        let path_bytes = path.as_os_str().as_encoded_bytes();
        let valid_path =
            !path_bytes.is_empty() && path_bytes.len() <= 32768 && !path_bytes.contains(&0);
        if !valid_path || name.is_empty() || name.len() > 256 || name.chars().any(char::is_control)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "export action requires a non-empty scope path and action name",
            ));
        }
        (self.0)(path, name, options)
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
        CURRENT.with_borrow_mut(|current| *current = self.0.take());
    }
}

/// Capture the adapter when dispatching an operation onto its worker pool.
#[must_use]
pub fn current() -> Option<Handler> {
    CURRENT.with_borrow(Clone::clone)
}

/// Bind an adapter to this operation and restore the prior binding on return or unwind.
pub fn scope<Output>(handler: Option<Handler>, work: impl FnOnce() -> Output) -> Output {
    let _binding = bind(handler);
    work()
}

/// Bind an adapter on the dispatch thread until the returned guard is dropped.
pub fn bind(handler: Option<Handler>) -> Binding {
    Binding(CURRENT.with_borrow_mut(|current| std::mem::replace(current, handler)))
}
