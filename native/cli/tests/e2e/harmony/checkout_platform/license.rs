//! `ScopeMeta` license text is generated metadata, independently of Version source files.
use super::{compare, versions};
use crate::helper::{Helper, config};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::json;
use sha1::{Digest, Sha1};
use std::{fs, io::Write};

fn scope_license(helper: &Helper, name: &str, text: &str) {
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let hash = format!("{:x}", Sha1::digest(name.as_bytes()));
    // Canonical ScopeMeta identity is its scope name; the object body keeps license then name.
    let body = serde_json::to_vec(&json!({"license":text,"name":name})).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "ScopeMeta {hash} {}\0", body.len()).unwrap();
    encoder.write_all(&body).unwrap();
    let directory = scope.join("objects").join(&hash[..2]);
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join(&hash[2..]), encoder.finish().unwrap()).unwrap();
}

#[test]
fn checkout_writes_scope_license_verbatim_like_node() {
    let helper = versions();
    let text = "Copyright fixture ©\r\nlicensed source\r\n";
    scope_license(&helper, "my-scope", text);
    helper.output_file("bar/LICENSE", "old unrelated license");
    let baseline = compare(&helper, "checkout 0.0.1 bar/foo -x");
    let license = fs::read(helper.scopes.local_path.join("bar/LICENSE")).unwrap();
    assert_eq!(license, fs::read(baseline.join("bar/LICENSE")).unwrap());
    assert_eq!(license, text.as_bytes());
    let path = "node_modules/@my-scope/bar.foo/package.json";
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(path)),
        config::read_jsonc(&baseline.join(path)),
    );
}

#[test]
fn checkout_ignores_license_from_an_unrelated_local_scope() {
    let helper = versions();
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let name = config::read_jsonc(&scope.join("scope.json"))["name"]
        .as_str()
        .unwrap()
        .to_owned();
    scope_license(&helper, &name, "unrelated local scope license");
    helper.output_file("bar/LICENSE", "existing unrelated license");
    let baseline = compare(&helper, "checkout 0.0.1 bar/foo -x");
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/LICENSE")).unwrap(),
        fs::read(baseline.join("bar/LICENSE")).unwrap(),
    );
    assert_eq!(fs::read(baseline.join("bar/LICENSE")).unwrap(), b"existing unrelated license");
}
