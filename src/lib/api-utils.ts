import { NextRequest } from 'next/server'
import { HttpError } from './types'

export function jsonError(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status })
  }
  console.error('[api] unexpected error:', err)
  return Response.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } },
    { status: 500 },
  )
}

export function ok(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

export async function parseJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'Request body must be valid JSON.')
  }
}

export function parsePagination(req: NextRequest): { take: number; skip: number; page: number } {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') || 25)))
  return { take: pageSize, skip: (page - 1) * pageSize, page }
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback
}

export function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}
