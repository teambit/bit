"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingPackagesDependenciesOnFs = void 0;
const component_issue_1 = require("./component-issue");
class MissingPackagesDependenciesOnFs extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = `missing packages or links from node_modules to the source`;
        this.solution = `run "bit install --add-missing-deps" to fix both issues`;
        this.data = {};
    }
}
exports.MissingPackagesDependenciesOnFs = MissingPackagesDependenciesOnFs;
//# sourceMappingURL=missing-packages-dependencies-on-fs.js.map