use super::{lines, show};
use serde_json::json;

#[test]
fn topological_order_matches_reverse_cleargraph_depth_first_walk() {
    let input = json!({"nodes":["a","b","c","d"],"edges":[{"source":"a","target":"b"},{"source":"a","target":"c"},{"source":"b","target":"d"},{"source":"c","target":"d"}]});
    assert_eq!(show::toposort(input).unwrap(), json!({"order":[0,1,2,3]}));
    assert!(show::toposort(json!({"nodes":["a","b"],"edges":[{"source":"a","target":"b"},{"source":"b","target":"a"}]})).is_err());
}
#[test]
fn line_tokenizer_retains_carriage_returns_and_final_newline_identity() {
    let parts = lines::diff("a\r\nb\n", "a\r\nc\n").unwrap();
    assert_eq!(
        parts
            .iter()
            .map(|part| (part.kind, part.value.as_str()))
            .collect::<Vec<_>>(),
        vec![(0, "a\r\n"), (2, "b\n"), (1, "c\n")],
    );
    let parts = lines::diff("a", "a\n").unwrap();
    assert_eq!(
        parts
            .iter()
            .map(|part| part.kind)
            .collect::<Vec<_>>(),
        vec![2, 1],
    );
}
#[test]
fn seeded_line_paths_match_real_jsdiff_default_tie_breaks() {
    let Some(cli) = std::env::var_os("BIT_TEST_HISTORY_QUERY_CLI") else { return };
    let script = r"
const{createRequire}=require('node:module');const{diffLines}=createRequire(process.argv[1]+'/package.json')('diff');let seed=731;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};const rows=[];for(let i=0;i<256;i++){const text=()=>Array.from({length:rand()%12},()=>['a\n','b\n','\n','a\r\n','same','astral😀\n'][rand()%6]).join('');const old=text(),newText=text();rows.push({old,newText,parts:diffLines(old,newText).map(p=>({kind:p.added?1:p.removed?2:0,value:p.value}))})}process.stdout.write(JSON.stringify(rows));
";
    let output = std::process::Command::new("node")
        .arg("-e")
        .arg(script)
        .arg(cli)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let rows: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    for (index, row) in rows
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
    {
        let actual =
            lines::diff(row["old"].as_str().unwrap(), row["newText"].as_str().unwrap()).unwrap();
        let actual = actual
            .into_iter()
            .map(|part| json!({"kind":part.kind,"value":part.value}))
            .collect::<Vec<_>>();
        assert_eq!(json!(actual), row["parts"], "jsdiff case {index}");
    }
}

#[test]
fn bfs_global_lane_marker_and_head_stop_keep_tag_cache_order() {
    let head = "a".repeat(40);
    let main = "b".repeat(40);
    let other = "c".repeat(40);
    let overlay = |hash: &str, parents: Vec<&str>| json!({"hash":hash,"parents":parents,"log":{}});
    let mut state = super::State::default();
    let input = json!({"objectsDirectory":std::env::temp_dir(),"start":head,"mainHead":main,"throws":true,"tags":[{"label":"1.0.0","hash":head}],"overlays":[overlay(&head,vec![&main,&other]),overlay(&main,vec![]),overlay(&other,vec![])]});
    let result = super::apply("historyQueryBegin", input.clone(), &mut state).unwrap();
    assert_eq!(
        result["rows"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["onLane"].as_bool().unwrap())
            .collect::<Vec<_>>(),
        vec![true, false, false],
    );
    let mut stopped = input;
    stopped["stopAt"] = json!([head]);
    let result = super::apply("historyQueryBegin", stopped, &mut state).unwrap();
    assert_eq!(result["rows"], json!([]));
    assert_eq!(result["lastFoundTag"], "1.0.0");
}

#[test]
fn bfs_uses_newest_tag_even_when_an_older_tag_was_cached() {
    let hash = "a".repeat(40);
    let mut state = super::State::default();
    let result = super::apply("historyQueryBegin", json!({"objectsDirectory":std::env::temp_dir(),"start":hash,"throws":false,"lastFoundTag":"old","tags":[{"label":"old","hash":hash},{"label":"new","hash":hash}],"orphaned":[{"label":"orphan","hash":hash}],"overlays":[{"hash":hash,"parents":[],"log":{}}]}), &mut state).unwrap();
    assert_eq!(result["rows"][0]["tag"], "new");
}
#[test]
fn populate_full_traversal_deduplicates_diamond_in_first_visit_order() {
    let head = "a".repeat(40);
    let main = "b".repeat(40);
    let other = "c".repeat(40);
    let base = "d".repeat(40);
    let row = |hash: &str, parents: Vec<&str>| json!({"hash":hash,"parents":parents});
    let input = json!({"objectsDirectory":std::env::temp_dir(),"head":head,"headExists":false,"exitWhenFind":false,"existing":[],"headData":row(&head,vec![&main,&other]),"overlays":[row(&main,vec![&base]),row(&other,vec![&base]),row(&base,vec![])]});
    let mut state = super::State::default();
    let result = super::apply("historyQueryPopulateBegin", input, &mut state).unwrap();
    assert_eq!(
        result["added"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["hash"].as_str().unwrap())
            .collect::<Vec<_>>(),
        vec![head.as_str(), main.as_str(), base.as_str(), other.as_str()],
    );
}

#[test]
fn finished_query_cannot_read_sources_and_directory_owner_is_bound() {
    let mut state = super::State::default();
    let owner = super::apply(
        "historyQueryBegin",
        json!({"objectsDirectory":std::env::temp_dir(),"start":null,"throws":false}),
        &mut state,
    )
    .unwrap();
    let other = std::env::temp_dir().join("different-repository");
    assert!(
        super::apply(
            "historyQueryBlame",
            json!({"token":owner["token"],"objectsDirectory":other,"logs":[]}),
            &mut state
        )
        .is_err(),
    );
    assert_eq!(
        super::apply("historyQueryFinish", json!({"token":owner["token"]}), &mut state).unwrap(),
        json!({"finished":true}),
    );
    assert!(
        super::apply(
            "historyQueryBlame",
            json!({"token":owner["token"],"objectsDirectory":std::env::temp_dir(),"logs":[]}),
            &mut state
        )
        .is_err(),
    );
}
#[test]
fn orphaned_tag_lookup_does_not_change_normal_tag_cache() {
    let head = "a".repeat(40);
    let parent = "b".repeat(40);
    let mut state = super::State::default();
    let result = super::apply("historyQueryBegin",json!({"objectsDirectory":std::env::temp_dir(),"start":head,"throws":false,"lastFoundTag":"1.0.0","tags":[{"label":"1.0.0","hash":head}],"orphaned":[{"label":"orphan","hash":parent}],"overlays":[{"hash":head,"parents":[parent],"log":{}},{"hash":parent,"parents":[],"log":{}}]}),&mut state).unwrap();
    assert_eq!(result["rows"][1]["tag"], "orphan");
    assert_eq!(result["lastFoundTag"], "1.0.0");
    assert_eq!(result["reads"]["versionObjects"], 0);
    assert_eq!(result["reads"]["overlayVersions"], 2);
}

#[test]
fn built_version_artifacts_are_query_only_and_metadata_bytes_remain_exact() {
    use std::io::Write;
    let root = std::env::temp_dir().join(format!("bit-history-query-built-{}", std::process::id()));
    let reference = "e".repeat(40);
    std::fs::create_dir_all(root.join(&reference[..2])).unwrap();
    let payload = json!({"mainFile":"index.js","files":[],"log":{"message":"built"},"parents":[],"extensions":[{"name":"teambit.pipelines/builder","data":{"artifacts":[{"files":[{"relativePath":"dist/index.js","file":"f".repeat(40),"url":"https://example.test/file"}]}]}}]});
    let body = serde_json::to_string(&payload).unwrap();
    let raw = format!("Version {reference} {}\0{body}", body.len());
    let mut zipped = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    zipped.write_all(raw.as_bytes()).unwrap();
    std::fs::write(
        root.join(&reference[..2])
            .join(&reference[2..]),
        zipped.finish().unwrap(),
    )
    .unwrap();
    assert!(
        crate::read_version::Reader::new(&root)
            .unwrap()
            .read(&reference)
            .is_err(),
    );
    let mut state = super::State::default();
    let response = super::apply(
        "historyQueryBegin",
        json!({"objectsDirectory":root,"start":reference,"throws":true}),
        &mut state,
    )
    .unwrap();
    assert_eq!(response["rows"][0]["versionJSON"], body);
    assert_eq!(response["rows"][0]["inflatedSize"], raw.len());
    assert_eq!(response["reads"]["versionObjects"], 1);
    let mut malformed = payload;
    malformed["extensions"][0]["data"]["artifacts"][0]["files"] = json!({});
    assert!(super::validate_version(&malformed).is_err());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn blame_reads_current_before_parent_when_both_inputs_fail() {
    use sha1::Digest;
    let root = std::env::temp_dir().join(format!("bit-history-query-order-{}", std::process::id()));
    let good = crate::validate::hexadecimal(&sha1::Sha1::digest(b"same\n"));
    let current = "c".repeat(40);
    let parent = "d".repeat(40);
    for corrupt_current in [true, false] {
        std::fs::create_dir_all(&root).unwrap();
        put_source(&root, &good, b"same\n");
        let broken = if corrupt_current { &current } else { &parent };
        std::fs::create_dir_all(root.join(&broken[..2])).unwrap();
        std::fs::write(
            root.join(&broken[..2])
                .join(&broken[2..]),
            b"invalid zlib stream",
        )
        .unwrap();
        let mut state = super::State::default();
        let owner = super::apply(
            "historyQueryBegin",
            json!({"objectsDirectory":root,"start":null,"throws":false}),
            &mut state,
        )
        .unwrap();
        let result = super::apply(
            "historyQueryBlame",
            json!({"token":owner["token"],"objectsDirectory":root,"logs":[{"fileHash":good,"parentFileHash":good},{"fileHash":current,"parentFileHash":parent}]}),
            &mut state,
        );
        let expected = if corrupt_current {
            std::io::ErrorKind::InvalidData
        } else {
            std::io::ErrorKind::NotFound
        };
        assert_eq!(result.unwrap_err().kind(), expected);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
fn put_source(root: &std::path::Path, hash: &str, bytes: &[u8]) {
    use std::io::Write;
    let mut zipped = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    zipped
        .write_all(format!("Source {hash} {}\0", bytes.len()).as_bytes())
        .unwrap();
    zipped.write_all(bytes).unwrap();
    std::fs::create_dir_all(root.join(&hash[..2])).unwrap();
    std::fs::write(root.join(&hash[..2]).join(&hash[2..]), zipped.finish().unwrap()).unwrap();
}

#[test]
fn source_capsules_preserve_compressed_snapshot_and_repeated_load_order() {
    use sha1::Digest;
    let root =
        std::env::temp_dir().join(format!("bit-history-query-capsule-{}", std::process::id()));
    let snapshots = root.join("snapshots");
    std::fs::create_dir_all(&snapshots).unwrap();
    let body = b"\xef\xbb\xbftext\r\n\xff";
    let hash = crate::validate::hexadecimal(&sha1::Sha1::digest(body));
    put_source(&root, &hash, body);
    let object_path = root.join(&hash[..2]).join(&hash[2..]);
    let compressed = std::fs::read(&object_path).unwrap();
    let mut cache = super::sources::Cache::default();
    cache.limit = 32 * 1024 * 1024;
    let mut sources =
        super::sources::Sources::new(root.clone(), Some(snapshots), &mut cache).unwrap();
    assert_eq!(sources.read(&hash).unwrap(), body);
    std::fs::remove_file(object_path).unwrap();
    assert_eq!(sources.read(&hash).unwrap(), body);
    let mut response = json!({});
    sources.response(&mut response);
    assert_eq!(response["sourceLoads"], json!([0, 0]));
    assert_eq!(response["reads"]["sourceObjects"], 1);
    let descriptor = &response["sources"][0];
    assert_eq!(descriptor["compressedSize"], compressed.len());
    assert_eq!(
        descriptor["inflatedSize"],
        format!("Source {hash} {}\0", body.len()).len() + body.len(),
    );
    assert_eq!(std::fs::read(descriptor["privatePath"].as_str().unwrap()).unwrap(), compressed);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn blame_source_loads_include_newest_and_current_before_parent() {
    use sha1::Digest;
    let root = std::env::temp_dir().join(format!("bit-history-query-loads-{}", std::process::id()));
    let hash = crate::validate::hexadecimal(&sha1::Sha1::digest(b"same\n"));
    put_source(&root, &hash, b"same\n");
    let mut state = super::State::default();
    let owner = super::apply(
        "historyQueryBegin",
        json!({"objectsDirectory":root,"throws":false}),
        &mut state,
    )
    .unwrap();
    let result = super::apply("historyQueryBlame", json!({"token":owner["token"],"objectsDirectory":root,"logs":[{"fileHash":hash,"parentFileHash":hash}]}), &mut state).unwrap();
    assert_eq!(result["sourceLoads"], json!([0, 0, 0]));
    assert_eq!(result["reads"]["sourceObjects"], 1);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn diff_reuses_token_source_snapshot_after_repository_deletion() {
    use sha1::Digest;
    let root =
        std::env::temp_dir().join(format!("bit-history-query-frozen-{}", std::process::id()));
    let left = crate::validate::hexadecimal(&sha1::Sha1::digest(b"original\n"));
    let right = crate::validate::hexadecimal(&sha1::Sha1::digest(b"modified\n"));
    put_source(&root, &left, b"original\n");
    put_source(&root, &right, b"modified\n");
    let mut state = super::State::default();
    let owner = super::apply(
        "historyQueryBegin",
        json!({"objectsDirectory":root,"throws":false}),
        &mut state,
    )
    .unwrap();
    let mut request = json!({"token":owner["token"],"objectsDirectory":root,"relativePath":"index.js","left":left,"right":right,"color":false});
    let identity = super::apply("historyQueryDiff", request.clone(), &mut state).unwrap();
    assert_eq!(identity["needsDiff"], true);
    assert_eq!(identity["reads"]["sourceObjects"], 2);
    std::fs::remove_file(root.join(&left[..2]).join(&left[2..])).unwrap();
    std::fs::remove_file(root.join(&right[..2]).join(&right[2..])).unwrap();
    request["gitExecutable"] = json!("git");
    let patch = super::apply("historyQueryDiff", request.clone(), &mut state).unwrap();
    assert_eq!(patch["reads"]["sourceObjects"], 0);
    assert_eq!(patch["sourceLoads"], json!([0, 1]));
    assert!(
        patch["files"][0]["rawDiff"]
            .as_str()
            .unwrap()
            .contains("+modified"),
    );
    super::apply("historyQueryFinish", json!({"token":owner["token"]}), &mut state).unwrap();
    assert!(super::apply("historyQueryDiff", request, &mut state).is_err());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn indexed_version_walk_keeps_first_duplicate_and_stop_boundary() {
    let head = "a".repeat(40);
    let parent = "b".repeat(40);
    let row = |hash: &str, parents: Vec<&str>| json!({"hash":hash,"parents":parents,"log":{}});
    let mut state = super::State::default();
    let input = json!({"objectsDirectory":std::env::temp_dir(),"start":head,"mainHead":head,"throws":true,"overlays":[row(&head,vec![&parent]),row(&head,vec![]),row(&parent,vec![])]});
    let result = super::apply("historyQueryBegin", input.clone(), &mut state).unwrap();
    assert_eq!(result["rows"][0]["overlayIndex"], 0);
    assert_eq!(result["rows"][1]["overlayIndex"], 2);
    assert_eq!(result["rows"].as_array().unwrap().len(), 2);
    let mut stopped = input;
    stopped["stopAt"] = json!([parent]);
    let result = super::apply("historyQueryBegin", stopped, &mut state).unwrap();
    assert_eq!(result["rows"].as_array().unwrap().len(), 1);
    assert_eq!(result["rows"][0]["hash"], head);
}

#[test]
fn indexed_population_keeps_first_overlay_and_reports_missing_parent() {
    let directory = tempfile::tempdir().unwrap();
    let head = "a".repeat(40);
    let parent = "b".repeat(40);
    let missing = "c".repeat(40);
    let row = |hash: &str, parents: Vec<&str>| json!({"hash":hash,"parents":parents});
    let input = json!({"objectsDirectory":directory.path(),"head":head,"headExists":false,"exitWhenFind":true,"existing":[],"headData":row(&head,vec![&parent]),"overlays":[row(&parent,vec![&missing]),row(&parent,vec![])],"lastFoundTag":"old","tags":[{"label":"old","hash":missing},{"label":"new","hash":missing}]});
    let mut state = super::State::default();
    let result = super::apply("historyQueryPopulateBegin", input, &mut state).unwrap();
    assert_eq!(result["complete"], false);
    assert_eq!(
        result["added"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(result["added"][0]["hash"], head);
    assert_eq!(result["added"][1]["hash"], parent);
    assert_eq!(result["missing"][0]["tag"], "new");
    assert_eq!(result["added"][1]["overlayIndex"], 0);
    assert_eq!(
        result["missing"],
        json!([{"hash":missing,"parentOf":parent,"kind":"tag","tag":"new"}]),
    );
}
