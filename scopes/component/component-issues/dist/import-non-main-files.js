"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportNonMainFiles = void 0;
const component_issue_1 = require("./component-issue");
class ImportNonMainFiles extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'importing non-main files';
        this.solution = 'the dependency should expose its API from the main file';
        this.data = {};
        this.isCacheBlocker = false;
    }
}
exports.ImportNonMainFiles = ImportNonMainFiles;
//# sourceMappingURL=import-non-main-files.js.map