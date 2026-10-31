//! Core diagnoses in `DoctorRegistrarBuilder` registration order.
use serde_json::{Value, json};
pub(super) struct Diagnosis {
    pub name: &'static str,
    pub description: &'static str,
    pub category: &'static str,
}
pub(super) const DIAGNOSES: &[Diagnosis] = &[
    Diagnosis {
        name: "validate workspace's bit config",
        description: "validate workspace configuration object",
        category: "configuration",
    },
    Diagnosis {
        name: "validate git exec",
        description: "validate that git executable found",
        category: "vendors",
    },
    Diagnosis {
        name: "check orphan refs",
        description: "checks for empty internal refs in local workspace",
        category: "internal store",
    },
    Diagnosis {
        name: "check environment symlinks",
        description: "validate generated symlinks for workspace environments",
        category: "local environments",
    },
    Diagnosis {
        name: "validate npm exec",
        description: "validate that npm executable found",
        category: "vendors",
    },
    Diagnosis {
        name: "validate yarn exec",
        description: "validate that yarn executable found",
        category: "vendors",
    },
    Diagnosis {
        name: "validate bit version",
        description: "validate that bit version is up to date",
        category: "core",
    },
    Diagnosis {
        name: "validate scope objects",
        description: "check if all components have their head version objects",
        category: "scope integrity",
    },
];
impl Diagnosis {
    pub fn listing(&self) -> Value {
        json!({"name":self.name,"description":self.description,"category":self.category})
    }
    pub fn result(&self, bare: Value, symptoms: String, treatment: &str) -> Value {
        let valid = is_valid(&bare);
        let mut result = json!({"diagnosisMetaData":{"category":self.category,"name":self.name,"description":self.description},
            "bareResult":null,"formattedSymptoms":if valid {String::new()} else {symptoms},
            "formattedManualTreat":if valid {""} else {treatment}});
        result["bareResult"] = bare;
        result
    }
}

fn is_valid(bare: &Value) -> bool {
    ["valid", "pass", "passed"]
        .into_iter()
        .find_map(|key| bare.get(key))
        .is_some_and(|value| {
            value.as_bool().unwrap_or(false)
                || value.as_u64() == Some(1)
                || value
                    .as_str()
                    .is_some_and(|text| {
                        let trimmed = text.trim();
                        trimmed.eq_ignore_ascii_case("true") || trimmed == "1"
                    })
        })
}
