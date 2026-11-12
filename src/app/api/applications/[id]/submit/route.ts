import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { submitApplication } from '@/lib/applications'
import { jsonError, ok } from '@/lib/api-utils'

// POST /api/applications/[id]/submit
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    const result = await submitApplication(ctx, id)
    return ok(result)
  } catch (e) {
    return jsonError(e)
  }
}
