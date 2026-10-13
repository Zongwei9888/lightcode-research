import { gitDiffFilter } from "./git-diff.js";
import { grepFilter } from "./grep.js";
import { pytestFilter } from "./pytest.js";
import { tscFilter } from "./tsc.js";
import { eslintJsonFilter } from "./eslint-json.js";
import { viteBuildFilter } from "./vite-build.js";
import { pnpmInstallFilter } from "./pnpm-install.js";
import { ruffJsonFilter } from "./ruff-json.js";
import { goTestJsonFilter } from "./go-test-json.js";
import { gitStatusFilter } from "./git-status.js";
import { searchLayoutFilter } from "./search-layout.js";
import { RTK_FILTERS } from "../rtk/filters.js";
import { pathListFilter } from "./path-list.js";
import { testProgressFilter } from "./test-progress.js";
import { lsListingFilter } from "./ls-listing.js";
import { testReportFilter } from "./test-report.js";
import { cargoBuildFilter } from "./cargo-build.js";
export const STATIC_FILTERS = Object.freeze([
    pytestFilter, grepFilter, gitDiffFilter, tscFilter, eslintJsonFilter, viteBuildFilter, pnpmInstallFilter,
    ruffJsonFilter, goTestJsonFilter, gitStatusFilter, searchLayoutFilter, pathListFilter, testProgressFilter, lsListingFilter, testReportFilter, cargoBuildFilter, ...RTK_FILTERS,
]);
export function projectStaticFilter(input) {
    for (const filter of STATIC_FILTERS) {
        const projection = filter.projectMapped(input);
        if (projection !== undefined)
            return { filter: filter.name, transformation: filter.transformation, ...projection };
    }
    return undefined;
}
export { gitDiffFilter, grepFilter, pytestFilter };
export { tscFilter, eslintJsonFilter, viteBuildFilter, pnpmInstallFilter };
