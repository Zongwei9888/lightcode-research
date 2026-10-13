import { nativeSearchProjection } from '../native-output.ts';
export function project(input) {
  if (input.kind !== 'native' || input.toolName !== 'glob') return null;
  return nativeSearchProjection(input.toolName, input.value, input.raw);
}
