use super::{read, wire};
use serde_json::json;
use sha1::{Digest, Sha1};
use std::fs;

fn hash(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
#[test]
fn artifact_sources_keep_bom_and_binary_while_workspace_sources_strip_bom() {
    let root = std::env::temp_dir().join(format!("bit-artifact-source-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    for (index, bytes) in
        [b"\xef\xbb\xbftext\r\n".as_slice(), b"\0\xff\r\n", b"plain\r\n"].iter().enumerate()
    {
        let path = root.join(index.to_string());
        fs::write(&path, bytes).unwrap();
        for normalization in ["workspace", "linuxEol"] {
            let body = if normalization == "workspace" && bytes.starts_with(&[239, 187, 191]) {
                &bytes[3..]
            } else {
                bytes
            };
            let expected = crate::checkout::eol::normalize(body.to_vec(), false);
            let object: wire::Object = serde_json::from_value(json!({"type":"Source","hash":hash(&expected),"source":{"path":path,"hash":hash(bytes),"sourceHash":hash(&expected),"normalization":normalization}})).unwrap();
            assert_eq!(read(&object, 4096, &mut 0).unwrap(), expected);
        }
    }
    fs::remove_dir_all(root).unwrap();
}
