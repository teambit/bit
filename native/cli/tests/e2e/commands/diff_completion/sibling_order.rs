//! Normalize only the two concurrent sibling file rows and their exact Files summary order.
//! Root/deeper placement, paths, statuses and all diff bytes remain checked.
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
    assert_eq!(paths[5], "a/nested/deeper.js");
    let mut siblings = paths[3..5].to_vec();
    siblings.sort();
    assert_eq!(siblings, ["a/deep.js", "z/deep.js"]);
    // fs.walk AsyncReader emits each completed scandir batch through fastq;
    // fast-glob's default concurrency is CPU_COUNT, so sibling batches race.
    // Keep root/within-directory/depth assertions and every diff byte exact.
    rows[3..5].sort_by(|left, right| {
        left["filePath"]
            .as_str()
            .cmp(&right["filePath"].as_str())
    });
    let fields = result[0]["fieldsDiff"].as_array_mut().unwrap();
    let files = fields
        .iter_mut()
        .find(|field| field["fieldName"] == "files")
        .unwrap();
    files["diffOutput"] = Value::String(
        files["diffOutput"]
            .as_str()
            .unwrap()
            .replace(
                "[ a.js, foo.js, z.js, z/deep.js, a/deep.js, a/nested/deeper.js ]",
                "[ a.js, foo.js, z.js, a/deep.js, z/deep.js, a/nested/deeper.js ]",
            ),
    );
    result
}
