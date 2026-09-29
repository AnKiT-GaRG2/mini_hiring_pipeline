import { getActingUserId } from './actingUser'
import type { FieldIssue } from './types'

// Unset in dev: the Vite proxy forwards /api and /health to the local backend, so a
// relative path is enough. Set for a production build where the frontend and backend
// are deployed as separate origins — Vite inlines it at build time.
const API_BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  details?: FieldIssue[]

  constructor(message: string, status: number, details?: FieldIssue[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

/** True when the server said the request conflicts with (or no longer matches) its state. */
export function isStaleStateError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 409 || err.status === 404)
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

export type RequestOptions = {
  /** Give up after this long and fail with a timeout error. */
  timeoutMs?: number
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

export async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const actingUserId = getActingUserId()
  if (actingUserId) headers.set('x-user-id', actingUserId)

  // One controller lets both the caller's signal and our timeout cancel the fetch.
  const controller = new AbortController()
  let timedOut = false
  const timer =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true
          controller.abort()
        }, options.timeoutMs)
  const callerSignal = init.signal
  if (callerSignal?.aborted) controller.abort()
  else callerSignal?.addEventListener('abort', () => controller.abort(), { once: true })

  const timeoutError = () => new ApiError('The server took too long to respond. Please try again.', 0)

  try {
    let res: Response
    try {
      res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal })
    } catch (err) {
      if (timedOut) throw timeoutError()
      if (isAbortError(err)) throw err // cancelled by the caller: not a failure to report
      throw new ApiError("Can't reach the server. Check your connection and try again.", 0)
    }

    const body: unknown = await res.json().catch(() => null)
    if (timedOut) throw timeoutError()

    if (!res.ok) {
      const parsed = (body ?? {}) as { error?: string; details?: FieldIssue[] }
      throw new ApiError(parsed.error ?? `Request failed (${res.status})`, res.status, parsed.details)
    }

    return body as T
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Builds "?a=1&b=2" from the defined values, skipping undefined/empty ones so
 * callers can pass optional filters straight through.
 */
export function queryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/**
 * Downloads a file the API generates. Goes through fetch (rather than a plain
 * link) so the request carries the same acting-user header as every other call.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const headers = new Headers()
  const actingUserId = getActingUserId()
  if (actingUserId) headers.set('x-user-id', actingUserId)

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers })
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0)
  }
  if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status)

  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * The server's per-field validation messages as { fieldName: message }, for
 * showing each next to its input. Empty for any other kind of error.
 */
export function fieldErrorsOf(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.details) return {}
  const out: Record<string, string> = {}
  for (const issue of err.details) {
    const key = issue.path.split('.')[0]
    if (key && !(key in out)) out[key] = issue.message
  }
  return out
}
