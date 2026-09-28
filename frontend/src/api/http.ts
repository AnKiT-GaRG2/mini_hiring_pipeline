import type { FieldIssue } from './types'

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
      res = await fetch(path, { ...init, headers, signal: controller.signal })
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
