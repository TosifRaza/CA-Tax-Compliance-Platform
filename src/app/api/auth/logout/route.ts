import { NextRequest } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'
import { jsonError, ok } from '@/lib/api-utils'

export async function POST(_req: NextRequest) {
  try {
    const res = ok({ success: true })
    return clearSessionCookie(res)
  } catch (e) {
    return jsonError(e)
  }
}
