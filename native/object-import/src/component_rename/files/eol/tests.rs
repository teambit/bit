use super::Writer;

#[test]
fn component_writer_uses_platform_eol_for_new_nonpreserved_targets() {
    let writer = Writer::target(false, false);
    let mixed = b"first\r\nsecond\nthird\r";
    assert_eq!(writer.contents(mixed.to_vec(), true), b"first\r\nsecond\r\nthird\r\n");
    assert_eq!(writer.contents(mixed.to_vec(), false), b"first\nsecond\nthird\n");
}

#[test]
fn exported_and_preserved_target_writes_retain_exact_source_eol() {
    for (exported, preserve) in [(true, false), (true, true), (false, true)] {
        let writer = Writer::target(exported, preserve);
        for windows in [false, true] {
            for source in [b"first\nsecond\n".as_slice(), b"first\r\nsecond\r\n"] {
                assert_eq!(writer.contents(source.to_vec(), windows), source);
            }
        }
    }
}

#[test]
fn refactored_dependents_use_workspace_write_on_both_platforms() {
    let source = b"const value = require('@scope/new');\r\nmodule.exports = value;\n";
    for windows in [false, true] {
        assert_eq!(Writer::Workspace.contents(source.to_vec(), windows), source);
    }
}

#[test]
fn component_writer_keeps_binary_source_bytes_on_both_platforms() {
    let source = b"\0first\nsecond\r\n";
    for windows in [false, true] {
        assert_eq!(Writer::target(false, false).contents(source.to_vec(), windows), source);
    }
}
