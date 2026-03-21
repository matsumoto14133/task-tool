export type UserLike = {
  user_id?: string
  email?: string
  display_name?: string | null
}

export function profileLabel(
  profile: UserLike | undefined,
  fallbackUserId?: string
) {
  if (!profile) return fallbackUserId ?? "不明なユーザー"
  if (profile.display_name?.trim()) return profile.display_name
  return profile.email ?? fallbackUserId ?? "不明なユーザー"
}

export function profileLabelWithEmail(
  profile: UserLike | undefined,
  fallbackUserId?: string
) {
  if (!profile) return fallbackUserId ?? "不明なユーザー"
  if (profile.display_name?.trim()) {
    return `${profile.display_name}（${profile.email}）`
  }
  return profile.email ?? fallbackUserId ?? "不明なユーザー"
}

export function buildProfileMap(profiles: any[]) {
  const m = new Map<string, any>()
  for (const p of profiles) {
    m.set(p.user_id, p)
  }
  return m
}