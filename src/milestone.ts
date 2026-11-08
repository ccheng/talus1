export function describeMilestone(number: number): string {
  if (number === 0) return 'A working React, TypeScript, and Vite site with automated tests and deployment.';
  if (number === 1) return 'Author, save, generate, preview, and export test versions and answer keys.';
  return 'Future improvements to the test authoring workflow.';
}
