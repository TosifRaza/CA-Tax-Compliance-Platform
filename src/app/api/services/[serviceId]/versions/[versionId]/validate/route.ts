import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/auth'
import { validateServiceVersion } from '@/lib/validation'
import { jsonError, ok } from '@/lib/api-utils'

// POST /api/services/[serviceId]/versions/[versionId]/validate
export async function POST(req: NextRequest, { params }: { params: Promise<{ serviceId: string; versionId: string }> }) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CA_REVIEWER', 'KNOWLEDGE_MANAGER'])
    const { versionId } = await params
    const report = await validateServiceVersion(versionId)
    return ok(report)
  } catch (e) {
    return jsonError(e)
  }
}
