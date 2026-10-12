mod compact_receipts;
mod parallel_reads;
use super::{State, apply};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let directory = std::env::temp_dir()
            .join(format!(
                "bit-merge-bodies-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir(&directory).expect("fixture");
        fs::create_dir(directory.join("snapshots")).expect("snapshots");
        Self(directory)
    }
    fn object(&self, hash: &str, kind: &str, body: &[u8]) {
        let mut compressed = ZlibEncoder::new(Vec::new(), Compression::default());
        write!(compressed, "{kind} {hash} {}\0", body.len()).expect("header");
        compressed.write_all(body).expect("body");
        let directory = self.0.join("objects").join(&hash[..2]);
        fs::create_dir_all(&directory).expect("object directory");
        fs::write(directory.join(&hash[2..]), compressed.finish().expect("compress"))
            .expect("object");
    }
    fn version(&self, number: char, contents: &[u8]) -> Value {
        let hash = crate::validate::hexadecimal(&Sha1::digest(contents));
        self.object(&hash, "Source", contents);
        let version = number.to_string().repeat(40);
        let files = json!([{"file":hash,"relativePath":"index.ts","name":"index.ts","test":false}]);
        self.object(
            &version,
            "Version",
            &serde_json::to_vec(&json!({"files":files})).expect("version JSON"),
        );
        json!({"hash":version,"files":[{"hash":hash,"relativePath":"index.ts","name":"index.ts","test":false}]})
    }
    fn prepare(&self, state: &mut State, target: &Value) -> Value {
        self.prepare_packed(state, target, false)
    }
    fn prepare_packed(&self, state: &mut State, target: &Value, packed: bool) -> Value {
        let base = "9".repeat(40);
        self.object(&base, "Version", b"{\"files\":[]}");
        let owner = apply("mergeTransactionBegin", json!({"mode":"status","count":1}), state)
            .expect("owner");
        apply("mergePrepare", json!({"packedBodies":packed,"token":owner["token"],"index":0,"objectsDirectory":self.0.join("objects"),"snapshotDirectory":self.0.join("snapshots"),"target":target,"base":{"hash":base,"files":[]},"labels":{"current":"current","other":"other"},"current":[]}), state).expect("prepare")
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn retained_prepare_capsules_and_late_template_preserve_raw_bytes_before_auto_eol() {
    let fixture = Fixture::new();
    let mut state = State::default();
    let incoming = fixture.version('1', b"incoming\n");
    let prepared = fixture.prepare(&mut state, &incoming);
    assert_eq!(prepared["sourceGroups"][1]["loads"][0]["row"], 0);
    assert_eq!(prepared["reads"]["sourceReads"], 1);
    assert_eq!(
        prepared["bodies"]
            .as_array()
            .expect("retained bodies")
            .len(),
        1,
    );
    assert_eq!(prepared["mergeRows"][0]["bodyPlanIndex"], prepared["targetFiles"][0]["planIndex"]);
    let capsule = &prepared["sources"][0];
    assert_eq!(
        fs::metadata(capsule["privatePath"].as_str().expect("capsule"))
            .expect("capsule exists")
            .len(),
        capsule["bodySize"].as_u64().expect("body size"),
    );
    assert_eq!(capsule["encoding"], "raw");
    assert_eq!(capsule["privatePath"], prepared["bodies"][0]["spoolPath"]);
    assert_eq!(
        fs::read(capsule["privatePath"].as_str().expect("capsule")).expect("body"),
        b"incoming\n",
    );
    for (revision, phase, completed) in
        [(0, "status", 1), (1, "importGap", 1), (2, "plans", 0), (3, "clearTemps", 1)]
    {
        apply("mergeTransactionReceipt",json!({"token":prepared["ownerToken"],"revision":revision,"phase":phase,"index":0,"completed":completed,"nextCount":0}),&mut state).expect("status completed before late apply");
    }
    let target = fixture.version('2', b"\xef\xbb\xbf\xff\0current\r\n");
    let applied = apply("mergeApply",json!({"token":prepared["ownerToken"],"planToken":prepared["token"],"target":target,"strategy":"ours"}),&mut state).expect("late template");
    assert!(
        applied["bodies"]
            .as_array()
            .expect("updated bodies")
            .len()
            > prepared["bodies"]
                .as_array()
                .expect("initial bodies")
                .len(),
    );
    let output = fixture.0.join("output.bin");
    let materialized = apply("mergeMaterialize",json!({"token":prepared["ownerToken"],"planToken":prepared["token"],"files":[{"planIndex":applied["files"][0]["planIndex"],"path":output,"overwrite":true,"eol":"auto"}]}),&mut state).expect("materialize");
    assert_eq!(materialized["completed"], 1);
    let body =
        &applied["bodies"][applied["files"][0]["planIndex"].as_u64().expect("body index") as usize];
    assert_eq!(
        fs::read(body["spoolPath"].as_str().expect("raw spool")).expect("raw bytes"),
        b"\xef\xbb\xbf\xff\0current\r\n",
    );
    // Canonical auto-EOL keeps the existing CRLF bytes on Windows; the Unix
    // conversion decodes the invalid UTF-8 byte while replacing line endings.
    let expected: &[u8] = if cfg!(windows) {
        b"\xef\xbb\xbf\xff\0current\r\n"
    } else {
        b"\xef\xbb\xbf\xef\xbf\xbd\0current\n"
    };
    assert_eq!(fs::read(&output).expect("output"), expected);
    apply("mergeTransactionFinish", json!({"token":prepared["ownerToken"]}), &mut state)
        .expect("finish");
    assert!(
        PathBuf::from(prepared["bodies"][0]["spoolPath"].as_str().expect("durable spool")).exists(),
    );
    assert!(
        apply(
            "mergeMaterialize",
            json!({"token":prepared["ownerToken"],"planToken":prepared["token"],"files":[]}),
            &mut state
        )
        .is_err(),
    );
}
#[test]
fn completion_order_ack_cannot_be_replayed_and_failures_preserve_original_order() {
    let fixture = Fixture::new();
    let mut state = State::default();
    let target = fixture.version('3', b"target");
    let prepared = fixture.prepare(&mut state, &target);
    let groups = json!([{"stage":"currentUpdated","order":[]},{"stage":"added","order":[0]},{"stage":"deletedConflict","order":[]},{"stage":"modified","order":[]}]);
    let request =
        json!({"token":prepared["ownerToken"],"planToken":prepared["token"],"groups":groups});
    let mut invalid = request.clone();
    invalid["groups"][1]["order"] = json!([0, 0]);
    assert!(apply("mergePlanOrder", invalid, &mut state).is_err());
    assert_eq!(
        apply("mergePlanOrder", request.clone(), &mut state).expect("ordered")["mergeRows"],
        prepared["mergeRows"],
    );
    assert!(apply("mergePlanOrder", request, &mut state).is_err());
}

#[test]
fn updated_rows_reuse_verified_target_bodies_and_base_reads_are_not_repeated() {
    let fixture = Fixture::new();
    let base = fixture.version('4', b"base\n");
    let target = fixture.version('5', b"target\n");
    let current = fixture.0.join("index.ts");
    fs::write(&current, b"base\n").expect("workspace file");
    let mut state = State::default();
    let owner = apply("mergeTransactionBegin", json!({"mode":"status","count":1}), &mut state)
        .expect("owner");
    let prepared = apply("mergePrepare", json!({
        "token":owner["token"],"index":0,"objectsDirectory":fixture.0.join("objects"),
        "snapshotDirectory":fixture.0.join("snapshots"),"base":base,"target":target,
        "labels":{"current":"current","other":"other"},
        "current":[{"relativePath":"index.ts","workspace":{"path":current,"rawHash":base["files"][0]["hash"],"snapshotHash":base["files"][0]["hash"]}}]
    }), &mut state).expect("prepare");
    assert_eq!(prepared["reads"]["sourceReads"], 2);
    assert_eq!(
        prepared["bodies"]
            .as_array()
            .expect("bodies")
            .len(),
        2,
    );
    assert_eq!(prepared["mergeRows"][0]["kind"], "updatedFiles");
    assert_eq!(prepared["mergeRows"][0]["bodyPlanIndex"], prepared["targetFiles"][0]["planIndex"]);
    let index = prepared["mergeRows"][0]["bodyPlanIndex"].as_u64().expect("index") as usize;
    assert_eq!(
        fs::read(prepared["bodies"][index]["spoolPath"].as_str().expect("spool")).expect("read"),
        b"target\n",
    );
    assert_eq!(fs::read(current).expect("workspace unchanged"), b"base\n");
}

#[test]
fn packed_bodies_preserve_ranges_source_receipts_and_retarget_without_rewriting_old_spools() {
    let fixture = Fixture::new();
    let mut state = State::default();
    let first = fixture.version('1', b"first\n");
    let second = fixture.version('2', b"\0\xffsecond\r\n");
    let mut target = first;
    let mut other = second["files"][0].clone();
    other["relativePath"] = json!("other.bin");
    other["name"] = json!("other.bin");
    target["files"]
        .as_array_mut()
        .unwrap()
        .push(other);
    fixture.object(&"1".repeat(40), "Version", &serde_json::to_vec(&json!({"files":target["files"].as_array().unwrap().iter().map(|f|json!({"file":f["hash"],"relativePath":f["relativePath"],"name":f["name"],"test":false})).collect::<Vec<_>>()})).unwrap());
    let prepared = fixture.prepare_packed(&mut state, &target, true);
    let path = prepared["bodies"][0]["spoolPath"].as_str().unwrap();
    let packed = fs::read(path).unwrap();
    assert_eq!(packed, b"first\n\0\xffsecond\r\n");
    assert_eq!(prepared["bodies"][1]["spoolPath"], prepared["bodies"][0]["spoolPath"]);
    assert_eq!(prepared["bodies"][1]["spoolOffset"], 6);
    assert_eq!(fs::read_dir(fixture.0.join("snapshots")).unwrap().count(), 1);
    for source in prepared["sources"].as_array().unwrap() {
        let offset = source["bodyOffset"].as_u64().unwrap() as usize;
        let length = source["bodySize"].as_u64().unwrap() as usize;
        assert_eq!(source["privatePath"], prepared["bodies"][0]["spoolPath"]);
        assert_eq!(
            source["hash"],
            crate::validate::hexadecimal(&Sha1::digest(&packed[offset..offset + length])),
        );
    }
    let next = fixture.version('3', b"late target");
    let collision = fixture.0
        .join("snapshots")
        .join(format!("{}-2.checkout-pack", prepared["token"].as_str().unwrap()));
    fs::write(&collision, b"must not overwrite").unwrap();
    let request = json!({"token":prepared["ownerToken"],"planToken":prepared["token"],"target":next,"strategy":"ours"});
    assert!(apply("mergeApply", request.clone(), &mut state).is_err());
    assert_eq!(fs::read(&collision).unwrap(), b"must not overwrite");
    assert_eq!(fs::read(path).unwrap(), packed);
    fs::remove_file(collision).unwrap();
    let applied = apply("mergeApply", request, &mut state).unwrap();
    assert_eq!(applied["bodies"][0], prepared["bodies"][0]);
    assert_eq!(applied["bodies"][2]["spoolOffset"], 0);
    assert_eq!(
        fs::read(applied["bodies"][2]["spoolPath"].as_str().unwrap()).unwrap(),
        b"late target",
    );
    assert_eq!(fs::read(path).unwrap(), packed);
}
