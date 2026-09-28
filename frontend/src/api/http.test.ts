import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, isStaleStateError, request } from './http'

afterEach(() => vi.restoreAllMocks())

function mockFetch(response: Response | Error) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (response instanceof Error) throw response
    return response
  })
}

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('request', () => {
  it('returns the parsed body on success', async () => {
    mockFetch(jsonResponse({ ok: true }, 200))
    await expect(request('/x')).resolves.toEqual({ ok: true })
  })

  it("surfaces the server's own error message", async () => {
    mockFetch(jsonResponse({ error: 'Cannot skip stages' }, 409))
    await expect(request('/x')).rejects.toMatchObject({ name: 'ApiError', status: 409, message: 'Cannot skip stages' })
  })

  it('carries field-level validation details', async () => {
    const details = [{ path: 'email', message: 'email must be a valid email address' }]
    mockFetch(jsonResponse({ error: 'Validation failed', details }, 400))
    await expect(request('/x')).rejects.toMatchObject({ status: 400, details })
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(request('/x')).rejects.toMatchObject({ status: 502, message: 'Request failed (502)' })
  })

  it('reports an unreachable server as status 0 with a human message', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    const err = await request('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 0, message: expect.stringContaining("Can't reach the server") })
  })

  it('sends a JSON content type only when there is a body', async () => {
    const spy = mockFetch(jsonResponse({}, 200))
    await request('/get')
    await request('/post', { method: 'POST', body: '{}' })

    const headersOf = (call: number) => spy.mock.calls[call][1]?.headers as Headers
    expect(headersOf(0).get('Content-Type')).toBeNull()
    expect(headersOf(1).get('Content-Type')).toBe('application/json')
  })
})

describe('isStaleStateError', () => {
  it('is true for 409 and 404 only', () => {
    expect(isStaleStateError(new ApiError('x', 409))).toBe(true)
    expect(isStaleStateError(new ApiError('x', 404))).toBe(true)
    expect(isStaleStateError(new ApiError('x', 400))).toBe(false)
    expect(isStaleStateError(new ApiError('x', 500))).toBe(false)
    expect(isStaleStateError(new Error('x'))).toBe(false)
  })
})
