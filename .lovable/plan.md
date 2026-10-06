## Goal

Give each assessment a live **Controls** list drawn from a catalog (ISO/IEC 27002:2022, NIST SP 800-53 Rev 5, and crosswalks to the other frameworks already in `FRAMEWORKS`), let the vCISO track status per control, and surface the controls that would close the assessment's priority gaps in the report.

## What we build

### 1. Controls catalog (global, read-only)

New table `public.controls` — one row per control, framework-agnostic identity plus cross-mappings.

Fields: `id`, `key` (unique, e.g. `iso27002:5.1`), `framework` (source-of-truth standard: `iso27002` or `nist_800_53`), `ref` (`5.1`, `AC-2`, …), `title`, `description`, `category` (Organisational / People / Physical / Technological for ISO; family for 800-53), `mappings jsonb` (crosswalk to every `FrameworkKey` in `FRAMEWORKS`, values are arrays of external refs).

Seeded via migration:
- **ISO/IEC 27002:2022** — all 93 controls (4 themes) parsed from the uploaded PDF.
- **NIST SP 800-53 Rev 5** — all control identifiers + titles (families AC, AT, AU, CA, CM, CP, IA, IR, MA, MP, PE, PL, PM, PS, PT, RA, SA, SC, SI, SR). Enhancements collapsed into base controls to keep the list workable; note added on each.
- **Crosswalks** to CSF 2.0, CE v3.3, IASME v13, CAF v4.0, ISO 27001:2022 Annex A, ISO 42001, NIST AI RMF, NIST 800-37, EU NIS2 (Art. 21), EU AI Act — populated from the official mapping tables (ISO 27002↔27001 is 1:1; CSF↔800-53 uses the NIST informative refs; the rest use published crosswalks including the uploaded `Cybersecurity_Framework_v2.0_Concept_Crosswalk_Template` and `CFS-ICA-to-27001-2-Mappings`).

RLS: `SELECT` to `authenticated` (read-only catalog). `service_role` full access.

### 2. Per-assessment control status

New table `public.assessment_controls`:

- `id`, `assessment_id` (FK → assessments, cascade), `control_id` (FK → controls), unique together.
- `status` enum: `not_started` (default), `in_progress`, `implemented`, `not_required`.
- `implemented_at date` — set when marked implemented.
- `target_date date` — due date when not yet implemented.
- `owner text` — free-text owner / role.
- `reason text` — used for "not required" justification or general notes.
- `created_at`, `updated_at` (+ trigger).

RLS: user can manage rows only where the parent assessment's `owner_id = auth.uid()` (mirrors `answers`).

### 3. Question ↔ control linkage

Questions already carry `mappings.iso27001` / `mappings.nist_800_53` / etc. We derive **which controls address which question** by looking up controls where `framework = 'iso27002'` and `ref ∈ mappings.iso27001`, or `framework = 'nist_800_53'` and `ref ∈ mappings.nist_800_53`, unioned. No schema change needed on `questions`.

### 4. UI — Controls tab per assessment

New route `src/routes/_authenticated/assessments.$id_.controls.tsx` (sibling of `report`), linked from the assessment header:

- Filter bar: framework (all / ISO 27002 / 800-53 / …), status, "only relevant to my gaps".
- Grouped list by category / family. Each row shows control ref, title, mapped frameworks (badges), current status.
- Row expands to inline editor: status radio (Not started / In progress / Implemented / Not required), owner input, implemented-date (shadcn DatePicker, shown when status = implemented), target-date (shown when status ∈ not_started/in_progress), reason textarea.
- Auto-save on blur / change via `assessment_controls` upsert.
- Summary strip at top: totals by status, % implemented.

### 5. Report — "Controls to implement"

In `assessments.$id_.report.tsx`, after **Priority gaps**, add **Recommended controls**:

- For each gap question, resolve its mapped controls (see §3), take the union across the top 10 gaps, subtract any control already `implemented` or `not_required` on this assessment.
- Chart: horizontal bar chart (recharts) — X axis = number of priority gaps a control would help close, Y axis = control ref + title, colour by framework. Caps at top 15.
- Table beneath: control, frameworks it covers, gaps addressed (chips linking back to the question), current status, quick "Mark implemented / target date" action that opens a dialog and writes to `assessment_controls`.
- New chart is included in PDF/DOCX/XLSX exports (extend `exports.functions.ts` payload and `exports.server.ts` builders).

### 6. Scoring implications

`frameworkCoverage` remains question-driven. We add a **control implementation rate** shown alongside coverage: `implemented / (total mapped to that framework - not_required)`. Purely additive; no change to existing scores.

## Technical notes

- Seed data lives in the migration itself as static SQL. NIST 800-53 base list is ~280 rows; ISO 27002 is 93; crosswalks fit in each control's `mappings` jsonb. Total < 400 rows.
- Sources: ISO 27002:2022 PDF (uploaded), NIST 800-53 Rev 5 OSCAL catalog (public), CSF 2.0 informative references (public), CFS-ICA→27001 mapping (uploaded), CE/IASME question packs (uploaded), CAF v4.0 (uploaded). Values are captured at migration time — no runtime fetch.
- Uses existing `requireSupabaseAuth`, `AppShell`, shadcn primitives (`DatePicker`, `Select`, `Textarea`, `RadioGroup`).
- No changes to `answers` or existing question flow.

## Files touched

New:
- `supabase/migrations/<ts>_controls_catalog.sql` — tables, RLS, grants, seed.
- `src/lib/controls.ts` — types, status enum, helpers (resolve controls for a question, recommended-controls calc).
- `src/routes/_authenticated/assessments.$id_.controls.tsx` — controls tab.
- `src/components/controls/*` — row editor, filter bar, recommendation chart.

Edited:
- `src/routes/_authenticated/assessments.$id.tsx` — add "Controls" link in header.
- `src/routes/_authenticated/assessments.$id_.report.tsx` — Recommended controls section + chart.
- `src/lib/exports.functions.ts` + `exports.server.ts` — include controls in export payload.

## Open question

I'll seed the **ISO 27002 (93)** and **NIST 800-53 Rev 5 base** controls plus crosswalks to every framework already in your `FRAMEWORKS` list. Say the word if you'd rather I also expand 800-53 **enhancements** (adds ~700 rows and much longer control lists) — otherwise I'll keep to base controls with a note.
