import { RTK_FILTERS } from "../rtk/filters.js";
const filter = RTK_FILTERS.find(f => f.name === "rtk/ollama");
export function project(input) {
    if (input.kind !== 'shell')
        return null;
    return filter.projectMapped({ command: input.command, stdout: input.raw, exitCode: input.exitCode, options: input.options });
}
