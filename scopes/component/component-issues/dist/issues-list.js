"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssuesList = exports.IssuesClasses = void 0;
const import_non_main_files_1 = require("./import-non-main-files");
const missing_components_1 = require("./missing-components");
const missing_dependencies_on_fs_1 = require("./missing-dependencies-on-fs");
const missing_dists_1 = require("./missing-dists");
const missing_packages_dependencies_on_fs_1 = require("./missing-packages-dependencies-on-fs");
const missing_manually_configured_packages_1 = require("./missing-manually-configured-packages");
const parse_errors_1 = require("./parse-errors");
const relative_components_1 = require("./relative-components");
const relative_components_authored_1 = require("./relative-components-authored");
const resolve_errors_1 = require("./resolve-errors");
const untracked_dependencies_1 = require("./untracked-dependencies");
const legacy_inside_harmony_1 = require("./legacy-inside-harmony");
const multiple_envs_1 = require("./multiple-envs");
const missing_links_from_nm_to_src_1 = require("./missing-links-from-nm-to-src");
const circular_dependencies_1 = require("./circular-dependencies");
const duplicate_component_and_package_1 = require("./duplicate-component-and-package");
const merge_config_has_conflict_1 = require("./merge-config-has-conflict");
const non_loaded_env_1 = require("./non-loaded-env");
const external_env_without_version_1 = require("./external-env-without-version");
const removed_dependencies_1 = require("./removed-dependencies");
exports.IssuesClasses = {
    MissingPackagesDependenciesOnFs: missing_packages_dependencies_on_fs_1.MissingPackagesDependenciesOnFs,
    MissingManuallyConfiguredPackages: missing_manually_configured_packages_1.MissingManuallyConfiguredPackages,
    MissingComponents: missing_components_1.MissingComponents,
    UntrackedDependencies: untracked_dependencies_1.UntrackedDependencies,
    ResolveErrors: resolve_errors_1.ResolveErrors,
    RelativeComponents: relative_components_1.RelativeComponents,
    RelativeComponentsAuthored: relative_components_authored_1.RelativeComponentsAuthored,
    ParseErrors: parse_errors_1.ParseErrors,
    MissingDists: missing_dists_1.MissingDists,
    LegacyInsideHarmony: legacy_inside_harmony_1.LegacyInsideHarmony,
    MissingDependenciesOnFs: missing_dependencies_on_fs_1.MissingDependenciesOnFs,
    ImportNonMainFiles: import_non_main_files_1.ImportNonMainFiles,
    MultipleEnvs: multiple_envs_1.MultipleEnvs,
    MissingLinksFromNodeModulesToSrc: missing_links_from_nm_to_src_1.MissingLinksFromNodeModulesToSrc,
    CircularDependencies: circular_dependencies_1.CircularDependencies,
    DuplicateComponentAndPackage: duplicate_component_and_package_1.DuplicateComponentAndPackage,
    MergeConfigHasConflict: merge_config_has_conflict_1.MergeConfigHasConflict,
    NonLoadedEnv: non_loaded_env_1.NonLoadedEnv,
    ExternalEnvWithoutVersion: external_env_without_version_1.ExternalEnvWithoutVersion,
    RemovedDependencies: removed_dependencies_1.RemovedDependencies,
};
class IssuesList {
    constructor(issues = []) {
        this.issues = issues;
    }
    get count() {
        return this.issues.length;
    }
    isEmpty() {
        return this.issues.length === 0;
    }
    outputForCLI() {
        return this.issues.map((issue) => issue.outputForCLI()).join('');
    }
    toObject() {
        return this.issues.map((issue) => issue.toObject());
    }
    toObjectWithDataAsString() {
        return this.issues.map((issue) => (Object.assign(Object.assign({}, issue.toObject()), { data: issue.dataToString().trim() })));
    }
    add(issue) {
        this.issues.push(issue);
    }
    delete(IssueClass) {
        this.issues = this.issues.filter((issue) => issue.constructor.name !== IssueClass.name);
    }
    /**
     * Use getIssueByName to prevent issues when getting different instances while using both bit from bvm and from the repo
     * @param IssueClass
     * @returns
     */
    getIssue(IssueClass) {
        return this.issues.find((issue) => issue instanceof IssueClass);
    }
    getIssueByName(issueType) {
        return this.issues.find((issue) => issue.constructor.name === issueType);
    }
    getAllIssues() {
        return this.issues;
    }
    getAllIssueNames() {
        return this.issues.map((issue) => issue.constructor.name);
    }
    createIssue(IssueClass) {
        const newIssue = new IssueClass();
        this.add(newIssue);
        return newIssue;
    }
    getOrCreate(IssueClass) {
        return this.getIssue(IssueClass) || this.createIssue(IssueClass);
    }
    shouldBlockSavingInCache() {
        return this.issues.some((issue) => issue.isCacheBlocker);
    }
    shouldBlockTagging() {
        return this.issues.some((issue) => issue.isTagBlocker);
    }
    filterNonTagBlocking() {
        return new IssuesList(this.issues.filter((issue) => issue.isTagBlocker));
    }
    toReadableByIDE() {
        return this.issues.map((issue) => ({
            type: issue.constructor.name,
            description: issue.description,
            solution: issue.solution,
            isTagBlocker: issue.isTagBlocker,
            data: issue.dataToString(),
        }));
    }
    serialize() {
        return this.issues.map((issue) => ({ type: issue.constructor.name, data: issue.serialize() }));
    }
    static deserialize(data) {
        if (!Array.isArray(data)) {
            // probably old format, ignore it and return an empty IssuesList
            return new IssuesList();
        }
        const issues = data.map((issue) => {
            const ClassName = issue.type;
            if (!Object.keys(exports.IssuesClasses).includes(ClassName)) {
                throw new Error(`issue type "${ClassName}" is not recognized.
the following are permitted ${Object.keys(exports.IssuesClasses).join(', ')}`);
            }
            const issueInstance = new exports.IssuesClasses[ClassName]();
            issueInstance.data = issueInstance.deserialize(issue.data);
            return issueInstance;
        });
        return new IssuesList(issues);
    }
}
exports.IssuesList = IssuesList;
//# sourceMappingURL=issues-list.js.map