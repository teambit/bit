use super::encode;
use flate2::read::ZlibDecoder;
use serde_json::Value;
use std::{io::Read, process::Command};

#[test]
fn seeded_invalid_utf8_source_headers_match_node_buffer_decoding() {
    let script = r"
let seed=0x71aab;function next(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const rows=[];
for(let i=0;i<4096;i++){const b=Buffer.alloc(next()%64);for(let j=0;j<b.length;j++)b[j]=next()%256;rows.push({bytes:Array.from(b),length:b.toString().length});}
for(const bytes of [[0xe0,0x80,0x80],[0xf0,0x80,0x80,0x80],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xf0,0x90,0x80]]){const b=Buffer.from(bytes);rows.push({bytes,length:b.toString().length});}
process.stdout.write(JSON.stringify(rows));
";
    let output = Command::new("node")
        .args(["-e", script])
        .output()
        .unwrap();
    assert!(output.status.success());
    let rows: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    for row in rows {
        let bytes: Vec<u8> = row["bytes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|byte| u8::try_from(byte.as_u64().unwrap()).unwrap())
            .collect();
        let object = encode("Source".into(), "a".repeat(40), &bytes).unwrap();
        let mut inflated = Vec::new();
        ZlibDecoder::new(object.compressed.as_slice()).read_to_end(&mut inflated).unwrap();
        let length = row["length"].as_u64().unwrap();
        let header = format!("Source {} {length}\0", "a".repeat(40));
        assert!(inflated.starts_with(header.as_bytes()), "{bytes:?}");
        assert_eq!(&inflated[header.len()..], bytes);
    }
}
