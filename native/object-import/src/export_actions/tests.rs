use super::{Handler, current, scope};
use serde_json::json;
use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    path::Path,
    thread,
};

#[test]
fn nested_and_unwound_adapters_restore_their_operation_owner() {
    let handler = Handler::new(|_, name, options| Ok(json!({"name":name,"options":options})));
    assert!(current().is_none());
    scope(Some(handler), || {
        assert!(
            catch_unwind(AssertUnwindSafe(|| scope(None, || panic!("adapter failure")))).is_err(),
        );
        let result = current()
            .unwrap()
            .call(Path::new("remote"), "validate", &json!({"id":"client"}))
            .unwrap();
        assert_eq!(result, json!({"name":"validate","options":{"id":"client"}}));
        assert!(thread::spawn(|| current().is_none()).join().unwrap());
    });
    assert!(current().is_none());
}
