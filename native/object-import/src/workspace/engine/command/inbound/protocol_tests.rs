use super::Prepare;
use serde_json::json;

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
