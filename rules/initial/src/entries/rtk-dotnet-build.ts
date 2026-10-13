import { RTK_FILTERS } from '../rtk/filters.ts';
const filter = RTK_FILTERS.find(f => f.name === "rtk/dotnet-build");
export function project(input) {
  if (input.kind !== 'shell') return null;
  return filter.projectMapped({ command: input.command, stdout: input.raw, exitCode: input.exitCode, options: input.options });
}
