use super::{Apply, Prepare, Retained, State, apply};
use serde_json::json;
use std::{fs, path::PathBuf};

struct PublicationFixture {
    _directory: tempfile::TempDir,
    root: PathBuf,
    global: PathBuf,
}

impl PublicationFixture {
    fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("workspace");
        let global = directory.path().join("global-remotes.json");
        fs::create_dir_all(root.join(".bit/objects")).unwrap();
        fs::write(root.join(".bit/scope.json"), br#"{"name":"local.scope","remotes":{}}"#).unwrap();
        fs::write(root.join(".bit/index.json"), br#"{"components":[],"lanes":[]}"#).unwrap();
        fs::write(&global, b"{}").unwrap();
        Self { _directory: directory, root, global }
    }

    fn state(&self, lane_import: bool) -> State {
        let mut import = crate::command_import::prepare_lane(&self.root, &self.global).unwrap();
        import.overlay.remote_refs.insert("remote.scope".into(), json!([]));
        State {
            inbound: Some(Retained {
                token: "owner".into(),
                receipt: json!({"token":"owner","laneImport":lane_import,"importedIds":[]}),
                import,
                workspace: None,
                applied: false,
                pending: None,
                proofs: Vec::new(),
            }),
            ..State::default()
        }
    }

    fn published_refs(&self) -> Vec<u8> {
        fs::read(self.root.join(".bit/refs/remotes/remote.scope/main")).unwrap()
    }
}

fn request(omit_owned_write_receipts: bool) -> Apply {
    Apply { token: "owner".into(), omit_owned_write_receipts }
}

#[test]
fn public_prepare_accepts_flat_transport_fields() {
    let request = json!({
        "root":"/workspace","home":"/home","globalRemotesFile":"/remotes.json",
        "globalConfigDir":"/config","nodeExecutable":"/node","bitVersion":"1.0.0",
        "operation":"fetch","ids":["scope/alpha"],
        "options":{"objectsOnly":true,"allHistory":false,"fromOriginalScope":false,
            "skipDependencyInstallation":false,"lanes":false,"components":true},
    });
    let input: Prepare = serde_json::from_value(request).unwrap();
    assert_eq!(input.ids, ["scope/alpha"]);
    assert_eq!(input.transport.bit_version, "1.0.0");
}

#[test]
fn ordinary_apply_keeps_receipts_while_lane_optout_publishes_the_same_files() {
    let ordinary = PublicationFixture::new();
    let lane = PublicationFixture::new();
    let default: Apply = serde_json::from_value(json!({"token":"owner"})).unwrap();
    assert!(!default.omit_owned_write_receipts);
    let default_receipt = apply(&default, &mut ordinary.state(true)).unwrap().1;
    let omitted_receipt = apply(&request(true), &mut lane.state(true)).unwrap().1;
    assert!(
        default_receipt["ownedWorkspaceWrites"]
            .as_array()
            .is_some_and(|rows| !rows.is_empty()),
    );
    assert!(omitted_receipt.get("ownedWorkspaceWrites").is_none());
    assert_eq!(ordinary.published_refs(), lane.published_refs());
    assert_eq!(
        fs::read(ordinary.root.join(".bit/index.json")).unwrap(),
        fs::read(lane.root.join(".bit/index.json")).unwrap(),
    );
}

#[test]
fn lane_receipt_optout_rejects_other_plans_without_consuming_them() {
    let fixture = PublicationFixture::new();
    let mut state = fixture.state(false);
    let error = apply(&request(true), &mut state).unwrap_err();
    assert!(error.to_string().contains("write receipts required"));
    assert!(state.inbound.is_some());
    assert!(!fixture.root.join(".bit/refs/remotes/remote.scope/main").exists());
    assert!(apply(&request(false), &mut state).unwrap().1["ownedWorkspaceWrites"].is_array());
}

#[test]
fn lane_receipt_optout_keeps_prepublication_error_prefix() {
    let default = PublicationFixture::new();
    let omitted = PublicationFixture::new();
    let mut default_state = default.state(true);
    let mut omitted_state = omitted.state(true);
    fs::write(default.root.join(".bit/scope.json"), b"changed").unwrap();
    fs::write(omitted.root.join(".bit/scope.json"), b"changed").unwrap();
    let default_error = apply(&request(false), &mut default_state).unwrap_err();
    let omitted_error = apply(&request(true), &mut omitted_state).unwrap_err();
    assert_eq!(default_error.to_string(), omitted_error.to_string());
    assert!(!default.root.join(".bit/refs/remotes/remote.scope/main").exists());
    assert!(!omitted.root.join(".bit/refs/remotes/remote.scope/main").exists());
}
