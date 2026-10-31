use super::Projection;
use serde_json::{Map, Value, json};
use std::io;

impl Projection<'_> {
    pub(super) fn finish(self) -> io::Result<Value> {
        let issues = self.collect_issues()?;
        let detected = json!({"allPackagesDependencies":{"packageDependencies":self.packages[0],"devPackageDependencies":self.packages[1],"peerPackageDependencies":self.packages[2]},"coreAspects":self.metadata.core_aspects,"issues":issues,"allDependencies":{"dependencies":self.dependencies[0],"devDependencies":self.dependencies[1],"peerDependencies":self.dependencies[2]},"overridesDependencies":{"manuallyRemovedDependencies":{},"manuallyAddedDependencies":{},"missingPackageDependencies":[]}});
        Ok(
            json!({"identity":self.request.identity,"detected":detected,"componentVersions":self.versions,"grammarInputs":self.grammar,"readSet":self.reader.proofs}),
        )
    }

    fn collect_issues(&self) -> io::Result<Vec<Value>> {
        let mut issues = Vec::new();
        for (kind, data) in [
            ("SelfReference", &self.metadata.issues.self_reference),
            ("ImportNonMainFiles", &self.metadata.issues.non_main),
            ("ParseErrors", &self.metadata.issues.parse_errors),
            ("ImportFromDirectory", &self.metadata.issues.directory_imports),
            ("RelativeComponentsAuthored", &self.metadata.relative.authored),
            ("UntrackedDependencies", &self.metadata.relative.untracked),
            ("MissingDependenciesOnFs", &self.metadata.issues.missing_files),
        ] {
            if !data.is_empty() {
                issues.push(serialized_issue(kind, data)?);
            }
        }
        if !self.metadata.issues.missing_packages.is_empty() {
            issues.push(json!({"type":"MissingPackagesDependenciesOnFs",
                "data":serde_json::to_string(&self.metadata.issues.missing_packages).map_err(io::Error::other)?}));
        }
        Ok(issues)
    }
}
fn serialized_issue(kind: &str, data: &Map<String, Value>) -> io::Result<Value> {
    Ok(json!({"type":kind,"data":serde_json::to_string(&data).map_err(io::Error::other)?}))
}
