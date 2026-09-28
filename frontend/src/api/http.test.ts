import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError, downloadFile, errorMessage, fieldErrorsOf, isStaleStateError, queryString, request } from './http'
import { setActingUserId } from './actingUser'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  setActingUserId(null)
})

describe('request', () => {
  it('sends JSON.stringify-d bodies with a Content-Type header, and returns the parsed body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }))
    const result = await request<{ ok: boolean }>('/api/thing', { method: 'POST', body: JSON.stringify({ a: 1 }) })

    expect(result).toEqual({ ok: true })
    const [, init] = fetchMock.mock.calls[0]
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(init!.body).toBe('{"a":1}')
    fetchMock.mockRestore()
  })

  it('adds the acting-user header only when one has been chosen', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}))
    await request('/api/thing')
    expect((fetchMock.mock.calls[0][1]!.headers as Headers).get('x-user-id')).toBeNull()

    setActingUserId('user-42')
    await request('/api/thing')
    expect((fetchMock.mock.calls[1][1]!.headers as Headers).get('x-user-id')).toBe('user-42')
    fetchMock.mockRestore()
  })

  it('throws an ApiError carrying the server message, status and field details on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'Validation failed', details: [{ path: 'name', message: 'required' }] }, 400),
    )
    await expect(request('/api/thing')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Validation failed',
      status: 400,
      details: [{ path: 'name', message: 'required' }],
    })
    vi.restoreAllMocks()
  })

  it('falls back to a generic message when the error body has none', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 500 }))
    await expect(request('/api/thing')).rejects.toMatchObject({ message: 'Request failed (500)', status: 500 })
    vi.restoreAllMocks()
  })

  it('reports a network failure distinctly from a cancelled request', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(request('/api/thing')).rejects.toMatchObject({ message: expect.stringMatching(/can.t reach the server/i) })
    vi.restoreAllMocks()

    const controller = new AbortController()
    controller.abort()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    await expect(request('/api/thing', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    vi.restoreAllMocks()
  })

  it('fails with a timeout error when the response is slower than the given timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 5)),
    )
    await expect(request('/api/thing', {}, { timeoutMs: 1 })).rejects.toMatchObject({ message: expect.stringMatching(/took too long/i) })
    vi.restoreAllMocks()
  })
})

describe('isStaleStateError', () => {
  it('is true for 409 and 404 ApiErrors, false otherwise', () => {
    expect(isStaleStateError(new ApiError('x', 409))).toBe(true)
    expect(isStaleStateError(new ApiError('x', 404))).toBe(true)
    expect(isStaleStateError(new ApiError('x', 400))).toBe(false)
    expect(isStaleStateError(new Error('x'))).toBe(false)
  })
})

describe('errorMessage', () => {
  it('uses the Error message, and a generic fallback for anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('a string')).toMatch(/something went wrong/i)
    expect(errorMessage(undefined)).toMatch(/something went wrong/i)
  })
})

describe('fieldErrorsOf', () => {
  it('maps the first issue per top-level field', () => {
    const err = new ApiError('Validation failed', 400, [
      { path: 'name', message: 'required' },
      { path: 'name', message: 'too long' },
      { path: 'email', message: 'invalid' },
      { path: 'experiences.0.title', message: 'required' },
    ])
    expect(fieldErrorsOf(err)).toEqual({ name: 'required', email: 'invalid', experiences: 'required' })
  })

  it('is empty for a non-ApiError or one without details', () => {
    expect(fieldErrorsOf(new Error('x'))).toEqual({})
    expect(fieldErrorsOf(new ApiError('x', 409))).toEqual({})
  })
})

describe('queryString', () => {
  it('builds a query string, skipping undefined, null and empty values', () => {
    expect(queryString({ a: 1, b: 'x', c: undefined, d: null, e: '', f: false })).toBe('?a=1&b=x&f=false')
  })

  it('is empty when nothing is left', () => {
    expect(queryString({ a: undefined })).toBe('')
  })
})

describe('downloadFile', () => {
  const realCreateObjectURL = URL.createObjectURL
  const realRevokeObjectURL = URL.revokeObjectURL

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    URL.createObjectURL = realCreateObjectURL
    URL.revokeObjectURL = realRevokeObjectURL
  })

  it('fetches the file and triggers a browser download', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('a,b\n1,2\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }))
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadFile('/api/candidates/export.csv', 'candidates.csv')

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    vi.restoreAllMocks()
  })

  it('throws an ApiError when the download fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
    await expect(downloadFile('/api/candidates/export.csv', 'candidates.csv')).rejects.toMatchObject({ status: 500 })
    vi.restoreAllMocks()
  })
})
