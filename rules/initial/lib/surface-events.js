/** Privacy-safe Token Economy activity emitted for browser and session projections. */
import { RTK_FILTER_IDS } from "./rtk/catalog.js";
export const ECONOMY_FILTER_NAMES = ['pytest', 'grep', 'git-diff', 'tsc', 'eslint-json', 'vite-build', 'pnpm-install', 'native-grep', 'native-glob', 'ruff-json', 'go-test-json', 'git-status', 'search-layout', 'path-list', 'test-progress', 'ls-listing', 'test-report', 'cargo-build', 'learned-rule', ...RTK_FILTER_IDS];
/** Product-facing rule name. Durable IDs remain unchanged for historical evidence and policies. */
export function economyRuleDisplayName(name) {
    return name.startsWith('rtk/') ? name.slice(4) : name;
}
export const ECONOMY_ACTIVITY_EVENT = 'lightcode/economy-activity';
