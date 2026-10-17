use super::bitmap::normalize;
use serde_json::Value;
use std::process::Command;
#[test]
fn seeded_root_bitmap_normalization_matches_actual_canonical_function() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else {
        return;
    };
    let script = r"
const{createRequire}=require('node:module'),path=require('node:path');const load=createRequire(path.join(process.argv[1],'package.json'));
const{normalizeBitmapContentForVersioning}=load('@teambit/legacy.bit-map');
let seed=0x40ad;function next(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const rows=[];
for(let i=0;i<400;i++){const map={_bit_lane:{id:{scope:'q.s',name:'lane'},exported:true},'$schema-version':'17.0.0',version:'legacy'};for(let j=0;j<8;j++){const n=next();map[j%2?String(j):'scope/component'+j]={rootDir:'components/'+j,scope:n&1?'q.s':'',defaultScope:'q.s',version:'1.0.0',nextVersion:{version:'patch'},onLanesOnly:!!(n&2),isAvailableOnCurrentLane:!(n&4),config:n&8?{'teambit.component/remove':{removed:true}}:{env:{id:'env'}},numeric:1e-7};}const input='// bitmap\n'+JSON.stringify(map).replace(/}$/,',}');rows.push({input,expected:normalizeBitmapContentForVersioning(input)});}
process.stdout.write(JSON.stringify(rows));
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let rows: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    for row in rows {
        assert_eq!(
            String::from_utf8(
                normalize(
                    row["input"]
                        .as_str()
                        .unwrap()
                        .as_bytes()
                )
                .unwrap()
            )
            .unwrap(),
            row["expected"].as_str().unwrap(),
        );
    }
}
