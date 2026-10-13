import { viteBuildFilter as filter } from '../filters/vite-build.ts';
export function project(input) {
  if (input.kind !== 'shell') return null;
  return filter.projectMapped({ command: input.command, stdout: input.raw, exitCode: input.exitCode, options: input.options });
}
