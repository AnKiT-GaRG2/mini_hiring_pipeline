const KEY = 'hiring-pipeline.actingUserId'

/**
 * There is no sign-in yet, so "who am I" is a choice made in the user menu and
 * remembered here. The API reads it from the x-user-id header; without one it
 * uses its default team member.
 */
export function getActingUserId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null // storage can be blocked (private windows); fall back to the default
  }
}

export function setActingUserId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    // Nothing to do: the choice just won't survive a reload.
  }
}
