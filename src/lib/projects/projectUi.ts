export function buildProjectBadgeLabel(project: { name: string } | null | undefined) {
  return project?.name ?? "";
}