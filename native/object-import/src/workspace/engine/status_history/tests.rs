use super::{Request, commit, identity, proof, validate};
use flate2::read::ZlibDecoder;
use serde_json::{Value, json};
use std::{
    fs,
    io::Read,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-status-history-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(root.join(".bit/objects")).unwrap();
        Self(root)
    }
    fn plan(&self, name: &str) -> Value {
        let identity = format!("test.scope/{name}");
        let mut proofs = Vec::new();
        proof::read(&self.file(&identity), &mut proofs).unwrap();
        json!({"identity":identity,"history":{"name":name,"scope":"test.scope","versions":[{"hash":"1111111111111111111111111111111111111111","parents":[]}],"graphCompleteRefs":[]},"readSet":proofs})
    }
    fn file(&self, name: &str) -> PathBuf {
        let hash = identity(name);
        self.0
            .join(".bit/objects")
            .join(&hash[..2])
            .join(&hash[2..])
    }
    fn request(&self, plans: &[Value]) -> Request {
        serde_json::from_value(json!({"root":self.0,"plans":plans})).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
#[test]
fn validates_whole_batch_before_writing_any_history() {
    let fixture = Fixture::new();
    let request = fixture.request(&[fixture.plan("alpha"), fixture.plan("beta")]);
    validate(&request).unwrap();
    assert!(!fixture.file("test.scope/alpha").exists());
    let beta = fixture.file("test.scope/beta");
    fs::create_dir_all(beta.parent().unwrap()).unwrap();
    fs::write(&beta, b"concurrent writer").unwrap();
    assert!(commit(&request).is_err());
    assert!(!fixture.file("test.scope/alpha").exists());
    assert_eq!(fs::read(beta).unwrap(), b"concurrent writer");
}
#[test]
fn commit_uses_canonical_utf16_header_and_preserves_history_fields() {
    let fixture = Fixture::new();
    let mut plan = fixture.plan("alpha😀");
    plan["history"]["graphCompleteRefs"] = json!(["1111111111111111111111111111111111111111"]);
    let expected = serde_json::to_string(&plan["history"]).unwrap();
    let request = fixture.request(&[plan]);
    assert_eq!(commit(&request).unwrap().1["written"], 1);
    let mut decoded = String::new();
    ZlibDecoder::new(fs::File::open(fixture.file("test.scope/alpha😀")).unwrap())
        .read_to_string(&mut decoded)
        .unwrap();
    let (header, body) = decoded.split_once('\0').unwrap();
    assert!(header.ends_with(&format!(" {}", expected.encode_utf16().count())));
    assert_eq!(body, expected);
}
