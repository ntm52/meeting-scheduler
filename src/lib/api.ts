async function req<T>(method: string, url: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`)
  return data as T
}

export const api = {
  get: <T>(url: string, token?: string) => req<T>('GET', url, undefined, token),
  post: <T>(url: string, body?: unknown, token?: string) => req<T>('POST', url, body ?? {}, token),
  put: <T>(url: string, body?: unknown) => req<T>('PUT', url, body ?? {}),
}
