//! Normalize only independently completed directory batches and their exact Files summary order.
//! Root placement, ancestor order, paths, statuses and every diff byte remain checked.
use serde_json::Value;

pub(super) fn normalize(output: &str) -> Value {
    let mut result: Value = serde_json::from_str(output).unwrap();
    let rows = result[0]["filesDiff"].as_array_mut().unwrap();
    let paths = rows
        .iter()
        .map(|row| {
            row["filePath"]
                .as_str()
                .unwrap()
                .replace('\\', "/")
        })
        .collect::<Vec<_>>();
    assert_eq!(paths.len(), 6);
    assert_eq!(&paths[..3], ["foo.js", "a.js", "z.js"]);
    let tail = &paths[3..];
    let ancestor = tail
        .iter()
        .position(|path| path == "a/deep.js")
        .unwrap();
    let nested = tail
        .iter()
        .position(|path| path == "a/nested/deeper.js")
        .unwrap();
    assert!(ancestor < nested, "a directory's entries precede its own child batch");
    let mut directories = tail.to_vec();
    directories.sort();
    assert_eq!(directories, ["a/deep.js", "a/nested/deeper.js", "z/deep.js"]);
    // AsyncReader emits a completed scandir batch synchronously, then fastq runs
    // queued child scans concurrently. A grandchild of a can finish before z.
    // Only independent batches race; a's own file must precede its grandchild.
    rows[3..].sort_by(|left, right| {
        left["filePath"]
            .as_str()
            .cmp(&right["filePath"].as_str())
    });
    let fields = result[0]["fieldsDiff"].as_array_mut().unwrap();
    let files = fields
        .iter_mut()
        .find(|field| field["fieldName"] == "files")
        .unwrap();
    let mut summary = files["diffOutput"]
        .as_str()
        .unwrap()
        .to_owned();
    for order in
        ["a/deep.js, z/deep.js, a/nested/deeper.js", "z/deep.js, a/deep.js, a/nested/deeper.js"]
    {
        summary = summary.replace(
            &format!("[ a.js, foo.js, z.js, {order} ]"),
            "[ a.js, foo.js, z.js, a/deep.js, a/nested/deeper.js, z/deep.js ]",
        );
    }
    files["diffOutput"] = Value::String(summary);
    result
}
