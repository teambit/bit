use super::{Budgets, File, Request, read};
use crate::read_budget::Budget;
use serde_json::json;
use std::path::PathBuf;

#[test]
fn patch_limit_is_shared_across_components_and_allows_empty_batches() {
    let request = Request {
        root: PathBuf::from("/"),
        import_token: None,
        targets: Vec::new(),
        git_executable: "git".into(),
        color: false,
        modified_only: false,
    };
    let source = || File {
        metadata: json!({"relativePath":"new.txt"}),
        contents: b"new contents\n".to_vec(),
        cost: 13,
    };
    let unlimited =
        Budgets { raw: Budget::new(1024), packed: Budget::new(1024), output: Budget::new(8192) };
    let first = read(&request, vec![source()], None, &unlimited, None).unwrap();
    let size = first[0]["rawDiff"]
        .as_str()
        .unwrap()
        .len();
    assert!(size > 0);
    let budgets = Budgets {
        raw: Budget::new(1024),
        packed: Budget::new(1024),
        output: Budget::new(size + 64),
    };
    assert!(read(&request, vec![source()], None, &budgets, None).is_ok());
    assert!(read(&request, vec![], None, &budgets, None).is_ok());
    assert!(read(&request, vec![source()], None, &budgets, None).is_err());
}
