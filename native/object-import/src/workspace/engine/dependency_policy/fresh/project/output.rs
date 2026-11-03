//! Fresh dependency detection output assembly and issue serialization on [`Projection`].

use super::Projection;
use serde_json::{Map, Value, json};
use std::io;

impl Projection<'_> {
    /// Finalizes the [`Projection`] into the wire response payload and [`collect_issues`](Self::collect_issues) list.
    pub(super) fn finish(self) -> io::Result<Value> {
        let issues = self.collect_issues()?;
        let mut grammar = Vec::with_capacity(self.grammar.len());
        for item in self.grammar {
            let trimmed = item.trim();
            if !trimmed.is_empty()
                && !grammar
                    .iter()
                    .any(|existing| existing == trimmed)
            {
                grammar.push(trimmed.to_owned());
            }
        }
        let detected = json!({"allPackagesDependencies":{"packageDependencies":self.packages[0],"devPackageDependencies":self.packages[1],"peerPackageDependencies":self.packages[2]},"coreAspects":self.metadata.core_aspects,"issues":issues,"allDependencies":{"dependencies":self.dependencies[0],"devDependencies":self.dependencies[1],"peerDependencies":self.dependencies[2]},"overridesDependencies":{"manuallyRemovedDependencies":{},"manuallyAddedDependencies":{},"missingPackageDependencies":[]}});
        Ok(
            json!({"identity":self.request.identity.trim(),"detected":detected,"componentVersions":self.versions,"grammarInputs":grammar,"readSet":self.reader.proofs}),
        )
    }

    /// Serializes non-empty issue maps and missing-package lists into wire issue records via [`serialized_issue`].
    fn collect_issues(&self) -> io::Result<Vec<Value>> {
        let mut issues = Vec::with_capacity(8);
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
            if self.metadata.issues.missing_packages.len() > 4096 {
                return Err(super::invalid("fresh detection missing packages"));
            }
            issues.push(json!({"type":"MissingPackagesDependenciesOnFs",
                "data":serde_json::to_string(&self.metadata.issues.missing_packages).map_err(io::Error::other)?}));
        }
        Ok(issues)
    }
}
/// Serializes `data` into a `{type, data}` wire issue object for `kind` within the 4,096-entry budget.
#[inline]
fn serialized_issue(kind: &str, data: &Map<String, Value>) -> io::Result<Value> {
    if data.len() > 4096 {
        return Err(super::invalid("fresh detection issue data"));
    }
    Ok(json!({"type":kind,"data":serde_json::to_string(&data).map_err(io::Error::other)?}))
}
