use super::Request;

#[test]
fn component_log_request_decodes_on_main_and_lane() {
    for input in [
        serde_json::json!({"kind":"componentLog","root":"/tmp","identity":"s/a"}),
        serde_json::json!({"kind":"componentLog","root":"/tmp","identity":"s/a","lane":null}),
        serde_json::json!({"kind":"componentLog","root":"/tmp","identity":"s/a","lane":{"scope":"s","name":"study"}}),
    ] {
        let result = serde_json::from_value::<Request>(input);
        assert!(result.is_ok(), "{:?}", result.err());
    }
}

fn outbound_prepare() -> serde_json::Value {
    serde_json::json!({
        "kind":"commandOutboundPrepare","root":"/workspace","home":"/home",
        "operation":"export","ids":["scope/alpha"],
        "globalRemotesFile":"/remotes.json","skipRemoteResolution":true,
        "globalConfigDir":"/config","nodeExecutable":"/node","bitVersion":"2.2.94",
        "clientId":"client","exportDate":"2026-10-17","bitmapHistoryFileId":"history",
        "bitDir":"/bit","options":{"originDirectly":false},
    })
}

#[test]
fn outbound_prepare_retains_flat_transport_and_resolution_protocol() {
    let request = serde_json::from_value::<Request>(outbound_prepare()).unwrap();
    assert!(matches!(request, Request::CommandOutboundPrepare(_)));
}

#[test]
fn outbound_prepare_rejects_unknown_fields_in_flat_protocol() {
    for field in ["unexpected", "resolvedHosts"] {
        let mut input = outbound_prepare();
        input[field] = serde_json::json!({});
        assert!(serde_json::from_value::<Request>(input).is_err(), "{field}");
    }
    let mut input = outbound_prepare();
    input["options"]["unexpected"] = serde_json::json!(true);
    assert!(serde_json::from_value::<Request>(input).is_err());
}

#[test]
fn outbound_prepare_requires_typed_resolution_fields() {
    for field in ["globalRemotesFile", "nodeExecutable"] {
        let mut input = outbound_prepare();
        input
            .as_object_mut()
            .unwrap()
            .remove(field);
        assert!(serde_json::from_value::<Request>(input).is_err(), "{field}");
    }
    let mut input = outbound_prepare();
    input["skipRemoteResolution"] = serde_json::json!("yes");
    assert!(serde_json::from_value::<Request>(input).is_err());
}
