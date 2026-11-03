//! Ported cases whose subject the native CLI does not run yet: `pnpm_testing_utils`'s
//! `known_failure` ([`KnownFailure`], [`KnownResult`], [`Native`], and [`allow_known_failure`]). A case reaching an unported command returns early, so it starts
//! asserting once the command runs natively. Such cases live in `known_failures` test modules
//! (`cargo test --features e2e --test e2e known_failures -- --list` lists them).

/// Why a ported case stopped: its command delegated to the `Node.js` CLI ([`KnownFailure`], [`KnownResult`], [`Native`], [`allow_known_failure`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownFailure {
    pub reason: String,
}

/// Result alias for E2E operations that fail with [`KnownFailure`] when delegating to the `Node.js` CLI ([`Native`], [`allow_known_failure`]).
pub type KnownResult<Value> = Result<Value, KnownFailure>;

/// Continue a ported case only once its command runs natively.
#[macro_export]
macro_rules! allow_known_failure {
    ($expr:expr) => {{
        let known_result: $crate::known_failure::KnownResult<_> = $expr;
        match known_result {
            Ok(value) => value,
            Err(_known_failure) => return,
        }
    }};
}

/// A ported case whose command runs natively: [`Native::native`] fails the case
/// when the command runs on the Node.js CLI instead.
pub trait Native<Value> {
    /// Unwraps the native result or panics if the command delegated to the Node.js CLI.
    fn native(self) -> Value;
}

impl<Value> Native<Value> for KnownResult<Value> {
    fn native(self) -> Value {
        self.unwrap_or_else(|failure| panic!("ran on the Node.js CLI:\n{}", failure.reason))
    }
}
