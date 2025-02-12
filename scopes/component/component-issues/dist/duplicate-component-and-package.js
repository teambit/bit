"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuplicateComponentAndPackage = void 0;
const component_issue_1 = require("./component-issue");
class DuplicateComponentAndPackage extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'tracked component added as a package';
        this.solution = 'either remove the package from the workspace.jsonc (bit uninstall) or remove the component (bit remove)';
        this.isTagBlocker = true;
    }
    dataToString() {
        return component_issue_1.ISSUE_FORMAT_SPACE + this.data;
    }
}
exports.DuplicateComponentAndPackage = DuplicateComponentAndPackage;
//# sourceMappingURL=duplicate-component-and-package.js.map