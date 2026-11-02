//! Labels for snap and tag result reports.
//!
//! Defines [`Labels`] and [`SNAP`] static presets for snap, tag, soft-tag, and persist-tag reports.

/// Report key and message configuration differentiating snap and tag result reports.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Labels {
    /// `snappedComponents` or `taggedComponents`.
    pub(super) versioned: &'static str,
    /// `autoSnappedResults` or `autoTaggedResults`.
    pub(super) automatic: &'static str,
    /// The other keys a result may carry.
    pub(super) others: &'static [&'static str],
    /// `NOTHING_TO_SNAP_MSG` or `NOTHING_TO_TAG_MSG`.
    pub(super) nothing: &'static str,
    /// `AUTO_SNAPPED_MSG` or `AUTO_TAGGED_MSG`.
    pub(super) dependents: &'static str,
    /// `snapped` or `tagged`.
    pub(super) verb: &'static str,
    pub(super) explanation: &'static str,
    /// A tag: semver versions only, warnings, and uncounted dependents in
    /// the detailed listing.
    pub(super) tag: bool,
}

/// Report label preset for `bit snap`.
pub const SNAP: Labels = Labels {
    versioned: "snappedComponents",
    automatic: "autoSnappedResults",
    others: &[
        "newComponents",
        "removedComponents",
        "dependentsWithPinnedDeps",
        "laneName",
        "totalComponentsCount",
    ],
    nothing: "nothing to snap",
    dependents: "auto-snapped dependents",
    verb: "snapped",
    explanation: "(use \"bit export\" to push these components to a remote)\n(use \"bit reset\" to unstage all local versions, or \"bit reset --head\" to only unstage the latest local snap)",
    tag: false,
};

/// Report label preset for `bit tag`.
pub const TAG: Labels = Labels {
    versioned: "taggedComponents",
    automatic: "autoTaggedResults",
    others: &[
        "newComponents",
        "dependentsWithPinnedDeps",
        "warnings",
        "laneName",
        "totalComponentsCount",
    ],
    nothing: "nothing to tag",
    dependents: "auto-tagged dependents",
    verb: "tagged",
    explanation: "(use \"bit export\" to push these components to a remote)\n(use \"bit reset\" to unstage versions)",
    tag: true,
};

/// Report label preset for `bit tag --soft`.
pub const SOFT_TAG: Labels = Labels {
    verb: "soft-tagged",
    explanation: "(use \"bit tag --persist\" to persist the soft-tagged changes as a fully tagged version)\n(use \"bit reset --soft\" to remove the soft-tags)",
    ..TAG
};

/// Report label preset for `bit tag --persist`.
pub const PERSIST_TAG: Labels = Labels { nothing: "no soft-tag found", ..TAG };

impl Labels {
    /// Returns `true` when `self` represents a `bit tag --soft` report.
    #[must_use]
    #[inline]
    pub(super) fn soft(&self) -> bool {
        self.tag && self.verb == "soft-tagged"
    }
    /// Returns the `(section_title, section_description)` pair for `new` (`true`) or changed (`false`) components.
    #[must_use]
    #[inline]
    pub(super) fn section(&self, new: bool) -> (&'static str, &'static str) {
        match (self.soft(), new) {
            (true, true) => (
                "soft-tagged new components",
                "set to be tagged with first version for components when persisted",
            ),
            (true, false) => (
                "soft-tagged changed components",
                "components that are set to get a version bump when persisted",
            ),
            (false, true) => ("new components", "first version for components"),
            (false, false) => ("changed components", "components that got a version bump"),
        }
    }
}
