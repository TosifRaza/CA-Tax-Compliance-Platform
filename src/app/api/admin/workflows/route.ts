import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { jsonError, ok } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const workflows = await db.workflowDefinition.findMany({
      where: { isActive: true },
      include: { stages: { orderBy: { sequence: 'asc' } } },
    })
    return ok({
      workflows: workflows.map((w) => ({
        id: w.id, code: w.code, name: w.name,
        stages: w.stages.map((s) => ({ code: s.code, name: s.name, sequence: s.sequence, responsibleRole: s.responsibleRole, stageType: s.stageType, slaHours: s.slaHours })),
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}
