use super::compare;

/// `[...ids].sort((a, b) => a.localeCompare(b))` in Node 22 with `LANG=en_US.UTF-8`.
#[test]
fn sorts_like_node_root_collation() {
    let mut ids = vec![
        "my.scope/alpha",
        "my.scope/Alpha",
        "my.scope/beta",
        "my.scope/a-b",
        "my.scope/a_b",
        "my.scope/a.b",
        "my.scope/a/b",
        "my.scope/ab",
        "my.scope/a1",
        "my.scope/a10",
        "my.scope/a2",
        "my-scope/alpha",
        "my_scope/alpha",
        "My.scope/alpha",
        "org.x/aa",
        "org.x/z",
        "org.x/Z",
        "a@1.0.0",
        "a/b@1.0.0",
        "A",
    ];
    ids.sort_by(|left, right| compare(left, right));
    assert_eq!(
        ids,
        [
            "A",
            "a@1.0.0",
            "a/b@1.0.0",
            "my_scope/alpha",
            "my-scope/alpha",
            "my.scope/a_b",
            "my.scope/a-b",
            "my.scope/a.b",
            "my.scope/a/b",
            "my.scope/a1",
            "my.scope/a10",
            "my.scope/a2",
            "my.scope/ab",
            "my.scope/alpha",
            "my.scope/Alpha",
            "My.scope/alpha",
            "my.scope/beta",
            "org.x/aa",
            "org.x/z",
            "org.x/Z",
        ],
    );
}
