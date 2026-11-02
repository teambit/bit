//! Unit tests ensuring installation directory receipts preserve identities while accepting platform separator spellings (POSIX and Windows).
//!
//! Verifies `installationDirectoryEquals` across drive letters, UNC shares, and relative segments.
use std::{env, process::Command};

/// Verifies Windows installation directory receipts accept separator variations while rejecting distinct identities.
#[test]
fn windows_directory_receipts_accept_separators_but_reject_other_identities() {
    check(
        r"
const cases = [
  ['C:\\workspace\\comp1', 'C:/workspace/comp1', true],
  ['C:\\workspace\\comp1\\', 'C:/workspace/./comp1', true],
  ['C:\\workspace\\comp1', 'C:/workspace/sibling/../comp1', true],
  ['\\\\server\\share\\comp1', '//server/share/comp1', true],
  ['C:\\workspace\\comp1', 'D:/workspace/comp1', false],
  ['C:\\workspace\\comp1', 'C:/workspace/comp2', false],
  ['C:\\workspace\\comp1', 'C:/Workspace/comp1', false],
  ['C:\\workspace\\comp1', 'C:workspace/comp1', false],
  ['comp1', 'comp1', false],
];
for (const [actual, requested, expected] of cases) {
  assert.strictEqual(installationDirectoryEquals(actual, requested, path.win32), expected,
    JSON.stringify({actual, requested}));
}
",
    );
}

/// Verifies POSIX installation directory receipts keep backslashes and case significant in `installationDirectoryEquals`.
///
/// Executes the POSIX path test matrix via [`check`].
#[test]
fn posix_directory_receipts_keep_backslashes_and_case_significant() {
    check(
        r"
const cases = [
  ['/workspace/comp1/', '/workspace/./comp1', true],
  ['/workspace/comp1', '/workspace/sibling/../comp1', true],
  ['/workspace/comp1', '/workspace/comp2', false],
  ['/workspace/comp1', '/Workspace/comp1', false],
  ['/workspace/comp1', '/workspace\\comp1', false],
  ['/workspace/comp1', 'workspace/comp1', false],
  [undefined, '/workspace/comp1', false],
  ['/workspace/comp1', undefined, false],
];
for (const [actual, requested, expected] of cases) {
  assert.strictEqual(installationDirectoryEquals(actual, requested, path.posix), expected,
    JSON.stringify({actual, requested}));
}
",
    );
}

/// Executes `assertions` against `directory_identity.js` inside a child `node` process.
///
/// Fails with captured `stdout` and `stderr` if any `node:assert/strict` check fails.
fn check(assertions: &str) {
    let program = format!(
        "const path=require('node:path');const assert=require('node:assert/strict');\n{}\n{assertions}",
        include_str!("directory_identity.js"),
    );
    let output = Command::new(env::var_os("BIT_NODE_BINARY").unwrap_or_else(|| "node".into()))
        .args(["-e", &program])
        .output()
        .expect("directory identity tests require Node.js");
    assert!(
        output.status.success(),
        "directory identity assertions failed: {:?}\n{}\n{}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );
}
