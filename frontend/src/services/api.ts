type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown }

function csrfCookie() {
  return document.cookie.split('; ').find((cookie) => cookie.startsWith('csrftoken='))?.split('=')[1]
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  const formBody = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (options.body !== undefined && !formBody) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrfCookie()) await fetch('/api/auth/csrf/', { credentials: 'include' })
    const token = csrfCookie()
    if (token) headers.set('X-CSRFToken', decodeURIComponent(token))
  }
  const response = await fetch(`/api${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : formBody ? options.body as FormData : JSON.stringify(options.body),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message = payload?.detail ?? Object.values(payload ?? {}).flat().join(' ') ?? 'Request failed.'
    throw new Error(String(message))
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function apiUrl(path: string) {
  return `/api${path}`
}