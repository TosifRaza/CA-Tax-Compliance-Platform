import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, requireRole, isStaffRole } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { jsonError, ok, parseJson, str } from '@/lib/api-utils'

// GET /api/services — catalogue, role-scoped.
// Clients see PUBLISHED services with client-facing fields; staff see everything.
export async function GET(req: NextRequest) {
  try {
    const ctx = await getSessionUser(req)
    const staff = ctx && isStaffRole(ctx.role)
    const category = req.nextUrl.searchParams.get('category')

    const where = staff ? {} : { status: 'PUBLISHED' }
    const services = await db.service.findMany({
      where: { ...where, ...(category ? { category: { code: category } } : {}) },
      include: {
        category: true,
        currentVersion: { select: { id: true, version: true, pricing: true, status: true, applicability: true } },
      },
      orderBy: [{ category: { displayOrder: 'asc' } }, { clientName: 'asc' }],
    })

    const data = services.map((s) => {
      const pricing = s.currentVersion ? (JSON.parse(s.currentVersion.pricing) as { professionalFee?: number; govtFee?: number; govtFeeNote?: string; demoMarked?: boolean }) : null
      const applicability = s.currentVersion ? (JSON.parse(s.currentVersion.applicability) as { periodMode?: string; applicantType?: string; notes?: string }) : null
      return {
        id: s.id,
        code: s.code,
        clientName: s.clientName,
        internalName: staff ? s.internalName : undefined,
        description: s.description,
        category: { id: s.category.id, code: s.category.code, name: s.category.name },
        authority: s.authority,
        officialUrl: s.officialUrl,
        status: s.status,
        verificationStatus: s.verificationStatus,
        demoMarked: s.demoMarked,
        currentVersion: s.currentVersion
          ? {
              id: s.currentVersion.id,
              version: s.currentVersion.version,
              status: s.currentVersion.status,
              applicability: applicability
                ? {
                    periodMode: applicability.periodMode,
                    applicantType: applicability.applicantType,
                    notes: applicability.notes,
                  }
                : null,
              pricing: pricing
                ? {
                    professionalFee: pricing.professionalFee,
                    govtFee: pricing.govtFee,
                    govtFeeNote: pricing.govtFeeNote,
                    demoMarked: pricing.demoMarked,
                  }
                : null,
            }
          : null,
      }
    })
    return ok({ services: data })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/services — create a new service (admin+). Starts in DRAFT with version 0.1.0.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ['SUPER_ADMIN', 'ADMIN'])
    const body = await parseJson<{
      code?: string; clientName?: string; internalName?: string; description?: string
      categoryId?: string; authority?: string; officialUrl?: string
    }>(req)
    const code = str(body.code).toUpperCase()
    const clientName = str(body.clientName)
    const categoryId = str(body.categoryId)
    if (!code || !clientName || !categoryId) {
      throw new HttpError(400, 'BAD_REQUEST', 'code, clientName and categoryId are required.')
    }
    const dup = await db.service.findUnique({ where: { code } })
    if (dup) throw new HttpError(409, 'DUPLICATE_CODE', 'A service with this code already exists.')
    const cat = await db.serviceCategory.findUnique({ where: { id: categoryId } })
    if (!cat) throw new HttpError(404, 'NOT_FOUND', 'Service category not found.')

    const service = await db.service.create({
      data: {
        code,
        clientName,
        internalName: str(body.internalName) || clientName,
        description: str(body.description) || null,
        categoryId,
        authority: str(body.authority) || null,
        officialUrl: str(body.officialUrl) || null,
        status: 'DRAFT',
        demoMarked: true,
      },
    })
    const version = await db.serviceVersion.create({
      data: {
        serviceId: service.id,
        version: '0.1.0',
        status: 'DRAFT',
        changeNotes: 'Initial draft created.',
        sourceReferences: '[]',
      },
    })
    await db.service.update({ where: { id: service.id }, data: { currentVersionId: version.id } })
    await audit({ actor: ctx, action: 'SERVICE_CREATED', entity: 'Service', entityId: service.id, details: { code } })
    return ok({ service: { id: service.id, code: service.code } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}
