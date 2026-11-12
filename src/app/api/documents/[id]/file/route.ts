import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError } from '@/lib/types'
import { readDocumentFile } from '@/lib/filestore'
import { jsonError } from '@/lib/api-utils'

// GET /api/documents/[id]/file — authorized download/preview of a private upload.
// Clients may only access their own application's files; staff only files of
// applications they can access (assigned task or staff role).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    const doc = await db.uploadedDocument.findUnique({
      where: { id },
      include: { application: { include: { client: { include: { user: true } }, tasks: true } } },
    })
    if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Document not found.')

    const app = doc.application
    if (ctx.role === 'CLIENT') {
      if (app.client.user.id !== ctx.userId) throw new HttpError(403, 'FORBIDDEN', 'You cannot access this document.')
    } else if (ctx.role === 'EMPLOYEE' || ctx.role === 'CA_REVIEWER') {
      const assigned = app.tasks.some((t) => t.assignedToId === ctx.userId)
      if (!assigned) throw new HttpError(403, 'FORBIDDEN', 'You cannot access this document.')
    } // MANAGER/ADMIN/SUPER_ADMIN allowed

    try {
      // R-10: transparent in-memory decryption (ENC1: sealed files); legacy
      // plaintext documents pass through unchanged.
      const buf = await readDocumentFile(doc.filePath)
      const body = new Uint8Array(buf)
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': doc.mimeType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName)}"`,
          'Cache-Control': 'private, no-store',
        },
      })
    } catch {
      throw new HttpError(410, 'FILE_MISSING', 'The stored file is no longer available.')
    }
  } catch (e) {
    return jsonError(e)
  }
}
