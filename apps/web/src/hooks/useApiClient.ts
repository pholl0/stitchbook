'use client'

import { useCallback } from 'react'
import { useAuthStore } from '@/stores/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  token?: string
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    credentials: 'include',
  })

  const data = await res.json()

  if (!res.ok) {
    throw new ApiError(
      data.error?.message ?? 'Request failed',
      res.status,
      data.error?.code
    )
  }

  return data
}

export function useApiClient() {
  const token = useAuthStore(s => s.token)

  const get = useCallback(
    (path: string) => request('GET', path, undefined, token ?? undefined),
    [token]
  )
  const post = useCallback(
    (path: string, body: unknown) => request('POST', path, body, token ?? undefined),
    [token]
  )
  const patch = useCallback(
    (path: string, body: unknown) => request('PATCH', path, body, token ?? undefined),
    [token]
  )
  const del = useCallback(
    (path: string) => request('DELETE', path, undefined, token ?? undefined),
    [token]
  )

  return { get, post, patch, delete: del }
}
