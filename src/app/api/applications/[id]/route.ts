import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { HttpError, isStaff } from '@/lib/types'
import { saveDraftAnswers, loadApplicationFor } from '@/lib/applications'
import { jsonError, ok, parseJson } from '@/lib/api-utils'
import type { Answers } from '@/lib/types'

// Access rules are enforced in loadApplicationFor (src/lib/applications.ts).

// GET /api/applications/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    const app = await loadApplicationFor(ctx, id)
    const isOwner = ctx.role === 'CLIENT'
    const snapshot = JSON.parse(app.configSnapshot)
    const version = await db.serviceVersion.findUnique({ where: { id: app.serviceVersionId }, select: { id: true, version: true } })
    return ok({
      application: {
        id: app.id,
        referenceNo: app.referenceNo,
        status: app.status,
        currentStageCode: app.currentStageCode,
        serviceVersion: version,
        service: app.service,
        business: app.business,
        periodType: app.periodType,
        periodLabel: app.periodLabel,
        periodStart: app.periodStart,
        periodEnd: app.periodEnd,
        client: isStaff(ctx.role) ? { name: app.client.user.name, email: app.client.user.email } : undefined,
        formData: JSON.parse(app.formData),
        checklist: JSON.parse(app.checklist),
        workflowStages: snapshot?.workflow?.stages ?? [],
        formSchema: snapshot?.formSchema ?? null,
        documents: app.documents.map((d) => ({
          id: d.id, requirementCode: d.requirementCode, documentTypeCode: d.documentTypeCode,
          fileName: d.fileName, sizeBytes: d.sizeBytes, mimeType: d.mimeType,
          status: d.status, versionNo: d.versionNo, reviewNotes: d.reviewNotes,
          reviewedAt: d.reviewedAt, createdAt: d.createdAt,
        })),
        tasks: isOwner
          ? app.tasks.map((t) => ({ id: t.id, name: t.name, stageCode: t.stageCode, status: t.status }))
          : app.tasks.map((t) => ({
              id: t.id, templateCode: t.templateCode, name: t.name, description: t.description,
              stageCode: t.stageCode, responsibleRole: t.responsibleRole, status: t.status,
              assignedTo: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
              department: t.department?.name ?? null,
              unassignedReason: t.unassignedReason, priority: t.priority, slaDueAt: t.slaDueAt,
              evidenceNote: t.evidenceNote, evidenceRequired: t.evidenceRequired,
              approvalRequired: t.approvalRequired, approvalStatus: t.approvalStatus,
              completedAt: t.completedAt, dependsOnCodes: JSON.parse(t.dependsOnCodes || '[]'),
            })),
        quotation: app.quotations[0]
          ? {
              id: app.quotations[0].id,
              professionalFee: app.quotations[0].professionalFee,
              govtFee: app.quotations[0].govtFee,
              taxAmount: app.quotations[0].taxAmount,
              discount: app.quotations[0].discount,
              total: app.quotations[0].total,
              items: JSON.parse(app.quotations[0].items),
              pricingNote: app.quotations[0].pricingNote,
              demoMarked: app.quotations[0].demoMarked,
              status: app.quotations[0].status,
              payments: app.quotations[0].payments.map((p) => ({
                id: p.id, amount: p.amount, status: p.status, method: p.method, gatewayRef: p.gatewayRef,
                createdAt: p.createdAt, confirmedAt: p.confirmedAt,
              })),
            }
          : null,
        filings: app.filings,
        taxPayments: app.taxPayments.map((t) => ({
          id: t.id, liabilityType: t.liabilityType, periodLabel: t.periodLabel, amount: t.amount,
          status: t.status, dueDate: t.dueDate, paidOn: t.paidOn, challanRef: t.challanRef,
          evidenceNote: t.evidenceNote, recordedByName: t.recordedByName, verifiedAt: t.verifiedAt,
          createdAt: t.createdAt,
        })),
        events: isOwner
          ? app.events.filter((e) => ['SUBMITTED', 'STAGE_ADVANCED', 'DOC_REQUESTED', 'INFO_REQUESTED', 'COMPLETED'].includes(e.type)).slice(0, 20)
              .map((e) => ({ id: e.id, type: e.type, actorName: e.actorName, createdAt: e.createdAt, payload: e.payload ? JSON.parse(e.payload) : null }))
          : app.events.map((e) => ({ id: e.id, type: e.type, actorName: e.actorName, createdAt: e.createdAt, payload: e.payload ? JSON.parse(e.payload) : null })),
        statusHistory: app.statusHistory.map((h) => ({ id: h.id, fromStatus: h.fromStatus, toStatus: h.toStatus, actorName: h.actorName, remarks: h.remarks, createdAt: h.createdAt })),
        createdAt: app.createdAt,
        submittedAt: app.submittedAt,
        completedAt: app.completedAt,
        updatedAt: app.updatedAt,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}

// PATCH /api/applications/[id] — save draft answers {answers: {...}}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(req)
    const { id } = await params
    const body = await parseJson<{ answers?: Answers }>(req)
    const result = await saveDraftAnswers(ctx, id, body.answers || {})
    return ok(result)
  } catch (e) {
    return jsonError(e)
  }
}

