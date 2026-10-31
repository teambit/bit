use super::{http_lane, lane_list, remote_lane};
use crate::{command_import::lane, workspace::engine::command::outbound};
use bit_client_transfer::{
    GlobalConfig,
    http::Network,
    tar::{self, ObjectItem},
};
use serde_json::json;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    thread,
};

#[test]
fn remote_lane_listing_keeps_visible_heads_and_drops_hidden_updates() {
    let id = lane::Id { scope: "remote.scope".into(), name: "dev".into() };
    let head = "1".repeat(40);
    let hidden = "2".repeat(40);
    let hash = "3".repeat(40);
    let value = json!({
        "scope":id.scope,"name":id.name,
        "components":[{"id":{"scope":id.scope,"name":"alpha"},"head":head}],
        "updateDependents":[format!("remote.scope/beta@{hidden}")],
    });
    let compressed = outbound::encode_object(&hash, "Lane", &value).unwrap();
    let item = ObjectItem { hash: hash.clone(), compressed, scope: None };
    let (found, entries) = remote_lane(&id, std::slice::from_ref(&item)).unwrap();
    assert_eq!(found, hash);
    assert_eq!(entries.len(), 2);
    let rows = lane_list::visible(entries).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id(), format!("remote.scope/alpha@{head}"));
    assert!(!rows[0].deprecated);
    assert!(remote_lane(&id, &[item.clone(), item]).is_err());
    assert!(remote_lane(&lane::Id { scope: "wrong".into(), name: "dev".into() }, &[]).is_err());
}

#[test]
fn http_lane_wildcard_listing_fetches_only_lane_objects() {
    let id = lane::Id { scope: "remote.scope".into(), name: "dev".into() };
    let head = "1".repeat(40);
    let hash = "3".repeat(40);
    let value = json!({
        "scope":id.scope,"name":id.name,
        "components":[{"id":{"scope":id.scope,"name":"alpha"},"head":head}],
        "updateDependents":[],
    });
    let item = ObjectItem {
        hash: hash.clone(),
        compressed: outbound::encode_object(&hash, "Lane", &value).unwrap(),
        scope: None,
    };
    let archive = tar::pack(&[item], 1024 * 1024).unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut request = String::new();
        let mut length = 0;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse().unwrap();
            }
            request.push_str(&line);
            if line == "\r\n" {
                break;
            }
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body).unwrap();
        request.push_str(&String::from_utf8(body).unwrap());
        let mut stream = stream;
        write!(
            stream,
            "HTTP/1.1 200 OK\r\n\
             content-type: application/octet-stream\r\n\
             content-length: {}\r\n\
             connection: close\r\n\
             \r\n",
            archive.len(),
        )
        .unwrap();
        stream.write_all(&archive).unwrap();
        request
    });
    let network = Network::new(&GlobalConfig::new(), "2.2.94", Some("local.scope"), None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let rows = runtime
        .block_on(http_lane(&network, &url, &id))
        .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id(), format!("remote.scope/alpha@{head}"));
    let request = server.join().unwrap();
    assert!(request.starts_with("POST /api/scope/fetch "), "{request}");
    assert!(request.contains(r#""ids":["remote.scope/dev"]"#), "{request}");
    assert!(request.contains(r#""type":"lane""#), "{request}");
}

#[test]
fn fork_file_listing_orders_model_names_before_versions_and_prefix_children() {
    let mut rows = ["comp1/ui", "comp2", "comp1"].map(|name| bit_client_transfer::http::Listed {
        scope: "remote.scope".into(),
        name: name.into(),
        version: Some("0.0.1".into()),
        deprecated: false,
    });
    super::list_order::file_order(&mut rows);
    assert_eq!(rows.map(|row| row.name), ["comp1", "comp1/ui", "comp2"]);
}

#[test]
fn file_list_id_helpers_accept_both_object_and_string_id_shapes() {
    let obj_row = json!({"id": {"scope": "my.scope", "name": "ui/button"}});
    let str_row = json!({"id": "my.scope/ui/button@0.0.1"});
    let unscoped_row = json!({"id": {"name": "ui/button"}});
    let unscoped_str_row = json!({"id": "button"});
    assert_eq!(super::file_list::row_id_parts(&obj_row), Some((Some("my.scope"), "ui/button")));
    assert_eq!(super::file_list::row_id_parts(&str_row), Some((Some("my.scope"), "ui/button")));
    assert_eq!(super::file_list::row_id_parts(&unscoped_row), Some((None, "ui/button")));
    assert_eq!(super::file_list::row_id_parts(&unscoped_str_row), Some((None, "button")));
    assert_eq!(super::file_list::row_scoped_id_parts(&str_row), Some(("my.scope", "ui/button")));
    assert_eq!(super::file_list::row_scoped_id_parts(&unscoped_row), None);
    let lane_obj = json!({"id": {"scope": "my.scope", "name": "dev"}});
    let lane_str = json!({"id": "my.scope/dev"});
    assert!(super::file_list::row_lane_matches(&lane_obj, "my.scope", "dev"));
    assert!(super::file_list::row_lane_matches(&lane_str, "my.scope", "dev"));
    assert!(!super::file_list::row_lane_matches(&lane_str, "my.scope", "other"));
}
