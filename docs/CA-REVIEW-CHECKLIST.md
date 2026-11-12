# CA Review Checklist — before any service configuration goes live

This checklist is for the appropriately qualified professional (CA / authorised compliance reviewer) who approves service configurations in the platform. **The software enforces the gates below, but software approval does not constitute legal verification — only your professional sign-off does.**

## 1. Official source verification (per service configuration version)

- [ ] Open every source reference attached to the version (Configuration → "Source references & applicability"; the registry lives under Masters data with authority/URL/verification status)
- [ ] Confirm the official service name, responsible authority, and portal URL against the current official portal (e.g. gst.gov.in, incometax.gov.in, mca.gov.in, udyamregistration.gov.in, foscos.fssai.gov.in, ipindia.gov.in, state municipal portals)
- [ ] Record the date you verified (`verifiedOn` in the source registry) and change status from VERIFICATION_REQUIRED to VERIFIED where satisfied
- [ ] Check the applicable legislation/rules/notifications are current **as of the effective-from date** of the version

## 2. Legal configuration values

- [ ] **Government fee:** confirm against the official fee schedule. A zero fee must be genuinely correct (e.g. GST registration and Udyam registration attract no government fee on their official portals). The provenance note must be factually accurate.
- [ ] **Professional fee:** confirm the firm's authorised pricing; confirm it is presented as a private professional charge and never as a government charge.
- [ ] **Tax on professional services:** confirm the applicable rate and the firm's own registration obligations.
- [ ] **Form/statutory references:** where the configuration names statutory forms (e.g. GSTR-1, GSTR-3B), confirm the current form version and period applicability. For income-tax services, confirm the framework split: legacy Income-tax Act, 1961 for earlier periods (e.g. FY 2025-26 / AY 2026-27), Income-tax Act, 2025 from Tax Year 2026-27 onwards.
- [ ] **Jurisdiction:** confirm state/municipality-specific rules are scoped correctly (never apply one state's trade licence rule to another).

## 3. Statutory due-date master (new — verify before relying on generated deadlines)

- [ ] For every obligation the configuration generates, confirm a **StatutoryDueDate** row exists for the relevant period with a due date you have verified against the current official notification/circular
- [ ] Each verified row must carry a **source reference** (the platform refuses verification without one) — check the source yourself
- [ ] Confirm the **effective period** (effectiveFrom/effectiveTo) matches the legal validity of the date
- [ ] Where an official **extension** has been notified, record it (`extensionNotified` + note) instead of silently shifting dates
- [ ] Rows remain **demo-marked** until verified — do not let the firm rely on demo-marked dates for real deadlines; obligation notes expose this flag to staff
- [ ] Verify the **period label convention** (e.g. "November 2026" for monthly, "Q2 FY 2026-27" for quarterly, "AY 2027-28" for annual) matches your firm's working convention

## 4. Applicability & eligibility screening (new — verify thresholds)

- [ ] Where a version sets `requires` (PAN/GSTIN/TAN/CIN presence), confirm the precondition is legally correct for the service (e.g. which registrations are genuinely prerequisites vs. helpful)
- [ ] Where `minTurnover`/`maxTurnover` bounds are set, confirm every threshold against the current statutory scheme it is modelling (composition limits, audit thresholds, etc.) — the platform treats them as configuration facts, not legal truths
- [ ] Confirm the demo-note wording is retained wherever a threshold has not been professionally verified
- [ ] Confirm constitution restrictions still match the service's legal applicability

## 5. Form & rule review (professional review of questions)

- [ ] Every question is legally relevant; no question solicits data the service does not need
- [ ] Conditional rules produce the correct question set for each business constitution and premises status (use Preview tab scenarios: proprietorship/rented, partnership/owned, private limited/rented)
- [ ] Required fields and validators (PAN/GSTIN/CIN/PIN) match portal expectations
- [ ] No circular or contradictory rules (run **Run validation** — zero errors required)

## 6. Document requirements

- [ ] Each ALWAYS/CONDITIONAL/OPTIONAL document is actually required (or legitimately optional) for the service
- [ ] Condition rules match the premises/constitution logic of the questions
- [ ] The client-facing `conditionSummary` explains *why* the document is needed in plain language
- [ ] File format/size limits are practical

## 7. Workflow, tasks & SLAs

- [ ] Stage order matches the real process (completeness → documents → preparation → **professional review** → government submission → acknowledgement → query handling → final QC → delivery)
- [ ] Professional review (CA approval) is a mandatory gate before any government submission stage
- [ ] Evidence-required flags are set on government stages (submission evidence, acknowledgement recording)
- [ ] SLAs are realistic for the firm

## 8. Pricing & quotation

- [ ] Quotation breakdown (professional fee / government fee / tax) matches what the client will be told and charged
- [ ] Zero government fee is shown as "Nil" with the correct explanation

## 9. Compliance obligations (post-registration)

- [ ] Recurring obligations generated from the configuration (e.g. GSTR-1 / GSTR-3B / GSTR-9) have correct frequency and due-rule notes for the specific taxpayer profile
- [ ] Obligations inherit the case's chosen statutory period where meaningful (assessment year for annual, tax period for event-based) — confirm the mapping is right for the service
- [ ] Demo-marked obligations must be re-configured with verified values before relying on them for deadline management

## 10. Reminder policy (new — confirm cadence is operationally safe)

- [ ] Early reminder intervals (e.g. 15/7/2 days), repeat cadence and escalation delay reflect the firm's actual follow-up practice
- [ ] The escalation target role is someone who can actually act on an overdue statutory deadline
- [ ] Reminder notifications never imply filing — confirm staff and client messaging keeps this distinction

## 11. Approval discipline

- [ ] Only approve in the **Review Queue → Configuration approvals** tab after physically checking items 1–10
- [ ] Your approval records your name and timestamp permanently and is shown in the audit trail
- [ ] Publishing is a separate admin action — confirm the approved version is the one published
- [ ] Any later change requires a new version; published versions cannot be silently altered
- [ ] Two-person review is recommended for high-impact legal configurations (the platform records both decisions)

## 12. Ongoing duties

- [ ] Re-verify each published configuration whenever the underlying law, form, fee or portal behaviour changes; use the Regulatory Updates intake so rule changes are tracked to affected cases
- [ ] Keep the statutory due-date master current — a verified date for one period does not verify the next
- [ ] Treat platform reminders and readiness indicators as internal targets; only official portal acknowledgements prove filing
- [ ] Record objections/queries raised by the department against the application so the audit trail reflects reality
