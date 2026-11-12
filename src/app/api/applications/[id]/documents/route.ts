import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import path from 'path'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { audit } from '@/lib/audit'
import { loadApplicationFor } from '@/lib/applications'
import { basicMalwareScan, writeDocumentFile } from '@/lib/filestore'
import { jsonError, ok } from '@/lib/api-utils'

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_BYTES = 15 * 1024 * 1024

// GET /api/applications/[id]/documents — list documents (authorized).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    const app = await loadApplicationFor(ctx, id)
    return ok({
      documents: app.documents.map((d) => ({
        id: d.id, requirementCode: d.requirementCode, documentTypeCode: d.documentTypeCode,
        fileName: d.fileName, sizeBytes: d.sizeBytes, mimeType: d.mimeType,
        status: d.status, versionNo: d.versionNo, reviewNotes: d.reviewNotes,
        reviewedAt: d.reviewedAt, createdAt: d.createdAt,
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/applications/[id]/documents — multipart upload for a requirement.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    const app = await loadApplicationFor(ctx, id)

    const form = await req.formData().catch(() => null)
    if (!form) throw new HttpError(400, 'BAD_REQUEST', 'Expected multipart form data.')
    const file = form.get('file')
    const requirementCode = String(form.get('requirementCode') || '')
    if (!(file instanceof File)) throw new HttpError(400, 'BAD_REQUEST', 'No file provided.')
    if (!requirementCode) throw new HttpError(400, 'BAD_REQUEST', 'requirementCode is required.')

    // Requirement must exist in the application's computed checklist and be REQUIRED/OPTIONAL.
    const checklist = JSON.parse(app.checklist) as { requirementCode: string; status: string; formats: string[]; maxSizeMb: number; maxFiles: number }[]
    const item = checklist.find((c) => c.requirementCode === requirementCode)
    if (!item || item.status === 'NOT_APPLICABLE') {
      throw new HttpError(422, 'REQUIREMENT_NOT_APPLICABLE', 'This document is not required for your current answers.')
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new HttpError(422, 'BAD_FILE_TYPE', 'Allowed file types: PDF, JPG, PNG.')
    }
    if (file.size > MAX_BYTES || file.size > item.maxSizeMb * 1024 * 1024) {
      throw new HttpError(422, 'FILE_TOO_LARGE', `File exceeds the ${item.maxSizeMb} MB limit for this document.`)
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    // R-10: basic content screen before the file is accepted (signature pass,
    // not a full antivirus engine — documented limitation).
    const scan = basicMalwareScan(bytes, file.type)
    if (scan) throw new HttpError(422, 'FILE_REJECTED', scan)

    // Enforce maxFiles (count active versions of this requirement).
    const activeCount = (await db.uploadedDocument.findMany({ where: { applicationId: id, requirementCode, status: { in: ['PENDING', 'APPROVED'] } } })).length
    if (activeCount >= item.maxFiles) {
      throw new HttpError(422, 'MAX_FILES', `Only ${item.maxFiles} file(s) allowed for this requirement. Contact support to replace an approved file.`)
    }

    // R-10: the file is encrypted (AES-256-GCM) before it is written; the disk
    // never holds plaintext client documents.
    const storedName = `${randomBytes(16).toString('hex')}${path.extname(file.name).toLowerCase()}`
    const filePath = await writeDocumentFile(id, storedName, bytes)

    const doc = await db.uploadedDocument.create({
      data: {
        applicationId: id,
        requirementCode,
        fileName: file.name.slice(0, 200),
        storedName,
        filePath,
        sizeBytes: file.size,
        mimeType: file.type,
        uploadedById: ctx.userId,
        status: 'PENDING',
      },
    })
    await db.applicationEvent.create({
      data: { applicationId: id, type: 'DOC_UPLOADED', actorId: ctx.userId, actorName: ctx.name, payload: JSON.stringify({ requirementCode, fileName: file.name }) },
    })
    await audit({ actor: ctx, action: 'DOCUMENT_UPLOADED', entity: 'UploadedDocument', entityId: doc.id, details: { applicationId: id, requirementCode } })
    return ok({ document: { id: doc.id, fileName: doc.fileName, status: doc.status } }, 201)
  } catch (e) {
    return jsonError(e)
  }
}
