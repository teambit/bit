#[path = "../src/js_json.rs"]
pub mod js_json;
#[path = "../src/snapshot_projection.rs"]
pub mod snapshot_projection;

use std::process::Command;

#[test]
fn real_component_lane_and_history_serializers_and_ids_match() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else {
        return;
    };
    let script = r"
const{createRequire}=require('node:module');const path=require('node:path');
const load=createRequire(path.join(process.argv[1],'package.json'));
const{ModelComponent,Lane,VersionHistory,Ref}=load('@teambit/objects');
function ast(v){if(v===undefined)return{kind:'undefined'};if(v===null)return{kind:'null'};if(typeof v==='boolean')return{kind:'boolean',value:v};if(typeof v==='number'){const b=Buffer.alloc(8);b.writeDoubleBE(v);return{kind:'number',value:b.toString('hex')}};if(typeof v==='string')return{kind:'string',value:Array.from({length:v.length},(_,i)=>v.charCodeAt(i))};if(Array.isArray(v))return{kind:'array',value:v.map(ast)};return{kind:'object',value:Object.keys(v).map(k=>[ast(k).value,ast(v[k])])};}
const rows=[];const h='a'.repeat(40),p='b'.repeat(40);
for(let i=0;i<100;i++){
 const m=ModelComponent.parse(JSON.stringify({name:'component',scope:'qualification.scope',versions:{'2':h,'1.0.0':p},deprecated:!!(i%2),state:i%3?{}:{versions:{'1.0.0':{local:true}}},orphanedVersions:i%2?{}:{'0.0.1':h},local:!!(i%4),head:i%2?h:undefined,detachedHeads:i%3?undefined:{heads:[h],deleted:[p],current:h},remotes:[{name:'qualification.scope',url:'file:///scope',date:String(i)}]}));
 const fields={...m,versions:Object.fromEntries(Object.entries(m.versions).map(([k,v])=>[k,v.toString()])),orphanedVersions:Object.fromEntries(Object.entries(m.orphanedVersions||{}).map(([k,v])=>[k,v.toString()])),head:m.head?.toString(),detachedHeads:{heads:m.detachedHeads.heads.map(x=>x.toString()),deleted:m.detachedHeads.deleted.map(x=>x.toString()),current:m.detachedHeads.current?.toString()}};
 rows.push({type:'Component',fields:ast(fields),hash:m.hash().toString(),body:JSON.stringify(m.toObject())});
 const lane=Lane.parse(JSON.stringify({name:'feature',scope:'qualification.scope',schema:'1.0.0',components:[{id:{scope:'qualification.scope',name:'component'},head:h,isDeleted:!!(i%2)}],log:{date:String(i)},readmeComponent:i%2?undefined:{id:{scope:'qualification.scope',name:'component'},head:null},updateDependents:[],overrideUpdateDependents:!!(i%3)}),p);
 const lf={...lane,components:lane.components.map(c=>({id:c.id.toObject(),head:c.head.toString(),isDeleted:c.isDeleted})),readmeComponent:lane.readmeComponent&&{id:lane.readmeComponent.id.toObject(),head:lane.readmeComponent.head?.toString()},updateDependents:lane.updateDependents?.map(c=>c.toString())};
 rows.push({type:'Lane',fields:ast(lf),hash:p,body:JSON.stringify(lane.toObject())});
 const history=new VersionHistory({name:'component',scope:'qualification.scope',versions:[{hash:Ref.from(h),parents:[Ref.from(p)],unrelated:i%2?Ref.from(p):undefined,squashed:i%3?undefined:[Ref.from(p)]}],graphCompleteRefs:[p]});
 const hf={name:history.name,scope:history.scope,versions:history.versions.map(v=>({hash:v.hash.toString(),parents:v.parents.map(p=>p.toString()),unrelated:v.unrelated?.toString(),squashed:v.squashed?.map(p=>p.toString())})),graphCompleteRefs:history.graphCompleteRefs};
 rows.push({type:'VersionHistory',fields:ast(hf),hash:history.hash().toString(),body:JSON.stringify(history.toObject())});
}
process.stdout.write(JSON.stringify(rows));
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let rows: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout).unwrap();
    for (index, row) in rows.iter().enumerate() {
        let fields: js_json::Value = serde_json::from_value(row["fields"].clone()).unwrap();
        let kind = row["type"].as_str().unwrap();
        let bytes = snapshot_projection::serialize(kind, &fields, false).unwrap();
        assert_eq!(
            String::from_utf8(bytes).unwrap(),
            row["body"].as_str().unwrap(),
            "{kind} case{index}",
        );
        let hash =
            snapshot_projection::identity(kind, &fields, Some(row["hash"].as_str().unwrap()))
                .unwrap();
        assert_eq!(hash, row["hash"].as_str().unwrap());
    }
}
