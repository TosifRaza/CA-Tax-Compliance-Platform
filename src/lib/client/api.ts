'use client'

// Thin API client for the SPA. All requests are same-origin relative paths.

export interface ApiError {
  code: string
  message: string
}

export class RequestError extends Error {
  status: number
  code: string
  constructor(status: number, err: ApiError) {
    super(err.message)
    this.status = status
    this.code = err.code
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const err = (data as { error?: ApiError })?.error || { code: 'UNKNOWN', message: `Request failed (${res.status}).` }
    throw new RequestError(res.status, err)
  }
  return data as T
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' })
  return handle<T>(res)
}

export async function apiSend<T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return handle<T>(res)
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', body: formData })
  return handle<T>(res)
}

export function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
