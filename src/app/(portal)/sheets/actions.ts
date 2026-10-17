'use server';

import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { z } from 'zod';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { assertInScope, requirePermission, type CurrentUser } from '@/lib/auth';
import { assertCanEdit } from '@/lib/sheet-access';
import { audit } from '@/lib/audit';
import { fail, missing } from '@/lib/errors';
import { withTxn } from '@/lib/txn';
import { FLOW, type FlowStage } from '@/lib/workflow';
import { checkRow, notifySheet, refreshCount, snapshotRows, upsertGraduand } from '@/lib/sheets';
import { parseTemplate } from '@/lib/template';
import { boxDepartmentIds } from '@/lib/boxes';
import { parseBoardList, resolveBoardRows } from '@/lib/board-list';
import { GraduandRowSchema, objectId } from '@/lib/validators';
import type { ActionState, CellError } from '@/lib/action-state';
import { AcademicSession, DigitizationBatch, GraduandRecord, Programme, ResultSheet, StoredFile, nextSheetReference } from '@/models';
import type { ResultSheetDoc } from '@/models/ResultSheet';

type Sheet = ResultSheetDoc;

async function loadSheet(id: string) {
  if (!Types.ObjectId.isValid(id)) missing('Sheet not found');
  await db();
  const sheet = await ResultSheet.findById(id);
  if (!sheet) missing('Sheet not found');
  return sheet!;
}

function stamp(sheet: Sheet, user: CurrentUser, stage: string, action: 'SUBMIT' | 'APPROVE' | 'RETURN' | 'LOCK', comment?: string) {
  sheet.approvals.push({ stage, action, by: new Types.ObjectId(user.id), byName: user.name, at: new Date(), comment });
  sheet.statusSince = new Date();
}

// ---------------------------------------------------------------- create

const CreateOnline = z.object({ programme: objectId, session: objectId });

export async function createOnlineSheet(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = '';
  const res = await run(async () => {
    const user = await requirePermission('submission:create');
    const { programme, session } = CreateOnline.parse(Object.fromEntries(fd));
    const prog = await Programme.findById(programme).lean();
    if (!prog || !user.department || !prog.department.equals(user.department)) fail('Pick a programme in your department');
    const open = await ResultSheet.findOne({ origin: 'ONLINE', programme, session, status: { $nin: ['SENATE_APPROVED'] } }).lean();
    if (open) fail(`There is already an open sheet for this programme and session (${open.reference})`);
    const sheet = await ResultSheet.create({
      origin: 'ONLINE', reference: await nextSheetReference(), department: prog!.department,
      programme, session, status: 'DRAFT', createdBy: user.id,
    });
    await audit(user, 'sheet.create', 'ResultSheet', sheet.id, undefined, { origin: 'ONLINE', reference: sheet.reference });
    id = sheet.id;
  });
  // Portal forms go to the new item; REST API calls (fd __api=1) get its id instead.
  if (id && fd.get('__api') !== '1') redirect(`/sheets/${id}`);
  return id ? { ...res, data: { id } } : res;
}

const CreateLegacy = z.object({ batch: objectId, programme: objectId, session: objectId });

export async function createLegacySheet(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = '';
  const res = await run(async () => {
    const user = await requirePermission('legacy:upload');
    const { batch, programme, session } = CreateLegacy.parse(Object.fromEntries(fd));
    const b = await DigitizationBatch.findById(batch);
    if (!b) missing('Box not found');
    if (user.role === 'INDEXER' && !b!.indexer?.equals(user.id)) fail('This box is not assigned to you');
    const prog = await Programme.findById(programme).lean();
    if (!prog) missing('Programme not found');
    const allowed = boxDepartmentIds(b!);
    if (allowed && !allowed.some((d) => d.equals(prog!.department))) fail('Programme must belong to one of the box departments');
    const sheet = await ResultSheet.create({
      origin: 'LEGACY', reference: await nextSheetReference(), department: prog!.department,
      programme, session, batch, status: 'DRAFT', createdBy: user.id,
    });
    if (b!.status === 'INVENTORIED') { b!.status = 'IN_PROGRESS'; await b!.save(); }
    await audit(user, 'sheet.create', 'ResultSheet', sheet.id, undefined, { origin: 'LEGACY', reference: sheet.reference, batch: b!.boxCode });
    id = sheet.id;
  });
  // Portal forms go to the new item; REST API calls (fd __api=1) get its id instead.
  if (id && fd.get('__api') !== '1') redirect(`/sheets/${id}`);
  return id ? { ...res, data: { id } } : res;
}

// ---------------------------------------------------------------- files

export async function attachFile(sheetId: string, fileId: string): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('legacy:upload', 'submission:create');
    const sheet = await loadSheet(sheetId);
    await assertCanEdit(user, sheet);
    const file = await StoredFile.findById(fileId).lean();
    if (!file || !file.uploadedBy.equals(user.id)) missing('File not found');
    if (!file!.department?.equals(sheet.department)) fail('File belongs to another department');
    if (!sheet.files.some((f) => f.equals(fileId))) sheet.files.push(new Types.ObjectId(fileId));
    await sheet.save();
    await audit(user, 'sheet.file_attach', 'ResultSheet', sheetId, undefined, { file: fileId, sha256: file!.sha256 });
  });
}

export async function detachFile(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('legacy:upload', 'submission:create');
    const sheet = await loadSheet(sheetId);
    await assertCanEdit(user, sheet);
    const fileId = String(fd.get('fileId'));
    if (await GraduandRecord.exists({ sheet: sheet._id, sourceFile: fileId })) fail('Rows are linked to this scan; relink them first');
    sheet.files = sheet.files.filter((f) => !f.equals(fileId));
    await sheet.save();
    await audit(user, 'sheet.file_detach', 'ResultSheet', sheetId, { file: fileId });
  });
}

// ---------------------------------------------------------------- online: workbook

export async function uploadWorkbook(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('submission:create');
    const sheet = await loadSheet(sheetId);
    await assertCanEdit(user, sheet);
    const file = fd.get('workbook');
    if (!(file instanceof File) || !file.size) fail('Choose the filled result template (.xlsx or .csv)');
    if (!/.(xlsx|csv)$/i.test((file as File).name)) fail('Upload the template as an Excel (.xlsx) or CSV (.csv) file');
    if ((file as File).size > 5 * 1024 * 1024) fail('File is larger than 5 MB');

    const { rows, errors } = parseTemplate(await (file as File).arrayBuffer(), { fileName: (file as File).name });
    if (errors.length) return { ok: false, message: `${errors.length} problem(s) found. Nothing was saved.`, errors };

    const prog = await Programme.findById(sheet.programme).lean();
    const checkErrors: CellError[] = [];
    const warnings: string[] = [];
    for (const [i, row] of rows.entries()) {
      const c = await checkRow(sheet, row, prog?.degreeType);
      c.errors.forEach((m) => checkErrors.push({ sheet: 'Graduands', row: i + 2, column: 'Matric No', message: m }));
      c.warnings.forEach((w) => warnings.push(`${row.matricNo}: ${w}`));
    }
    if (checkErrors.length) return { ok: false, message: `${checkErrors.length} problem(s) found. Nothing was saved.`, errors: checkErrors, warnings };

    const before = sheet.recordCount;
    await withTxn(async () => {
      const keep = new Set(rows.map((r) => r.matricNo));
      const existing = await GraduandRecord.find({ sheet: sheet._id }).populate<{ student: { matricNo: string } }>('student', 'matricNo');
      const stale = existing.filter((r) => !keep.has(r.student.matricNo)).map((r) => r._id);
      if (stale.length) await GraduandRecord.deleteMany({ _id: { $in: stale }, locked: false });
      for (const row of rows) await upsertGraduand(sheet, row);
    });
    await refreshCount(sheet._id);
    await audit(user, 'sheet.workbook_upload', 'ResultSheet', sheetId, { rows: before }, { rows: rows.length, file: (file as File).name });
    return { ok: true, message: `${rows.length} graduand row(s) saved from ${(file as File).name}.`, warnings };
  });
}

export async function submitSheet(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('submission:create');
    const sheet = await loadSheet(sheetId);
    if (sheet.origin !== 'ONLINE') fail('Not an online submission');
    await assertCanEdit(user, sheet);
    if (!sheet.recordCount) fail('Upload the result workbook first');
    if (!sheet.files.length) fail('Attach the signed and stamped result sheet scan first');
    if (fd.get('attest') !== 'on') fail('Confirm that the rows match the signed result sheet');

    const before = sheet.status;
    sheet.previousSubmittedRows = sheet.lastSubmittedRows;
    sheet.lastSubmittedRows = await snapshotRows(sheet._id);
    sheet.status = 'SUBMITTED';
    stamp(sheet, user, before === 'RETURNED' ? 'RESUBMITTED' : 'SUBMITTED', 'SUBMIT');
    await sheet.save();
    await audit(user, 'sheet.submit', 'ResultSheet', sheetId, { status: before }, { status: 'SUBMITTED' });
    await notifySheet(sheet._id);
    return { ok: true, message: 'Submitted to the Head of Department.' };
  });
}

// ---------------------------------------------------------------- online: approvals

export async function decideSheet(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('submission:approve');
    const approve = fd.get('decision') === 'approve';
    const comment = String(fd.get('comment') ?? '').trim();
    const senateRaw = String(fd.get('senateDate') ?? '');
    if (!approve && comment.length < 5) fail('Give a reason so the department knows what to correct');

    let next = '';
    await withTxn(async (session) => {
      const sheet = await ResultSheet.findById(sheetId).session(session);
      if (!sheet || sheet.origin !== 'ONLINE') missing('Sheet not found');
      const step = FLOW[sheet!.status as FlowStage];
      if (!step || step.role !== user.role) fail('This sheet is not at your stage');
      await assertInScope(user, sheet!.department);

      let senateDate: Date | undefined;
      if (approve && step.next === 'SENATE_APPROVED') {
        senateDate = new Date(senateRaw);
        if (!senateRaw || isNaN(senateDate.getTime()) || senateDate > new Date()) fail('Enter the date Senate approved these results');
      }

      const before = sheet!.status;
      sheet!.status = approve ? step.next : 'RETURNED';
      stamp(sheet!, user, before, approve ? 'APPROVE' : 'RETURN', comment || undefined);
      if (sheet!.status === 'SENATE_APPROVED') {
        sheet!.senateApprovalDate = senateDate;
        await GraduandRecord.updateMany({ sheet: sheet!._id },
          { $set: { senateApprovalDate: senateDate, locked: true } }, { session: session ?? undefined });
      }
      await sheet!.save({ session });
      next = sheet!.status;
      await audit(user, approve ? 'sheet.approve' : 'sheet.return', 'ResultSheet', sheetId, { status: before }, { status: next, comment });
    });
    await notifySheet(sheetId, comment);
    return { ok: true, message: approve ? 'Approved and sent to the next stage.' : 'Returned to the department.' };
  });
}

// ---------------------------------------------------------------- legacy: indexing

function parseCourses(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const [code, title, units, score, grade, semester] = line.split('|').map((s) => s.trim());
    return { code, title, units, score: score || undefined, grade: grade || undefined, semester: semester || undefined };
  });
}

export async function saveLegacyRow(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('legacy:upload');
    const sheet = await loadSheet(sheetId);
    if (sheet.origin !== 'LEGACY') fail('Not a legacy sheet');
    await assertCanEdit(user, sheet);

    const raw = Object.fromEntries(fd);
    const blank = (v: FormDataEntryValue | undefined) => (v === '' ? undefined : v);
    // Semester GPAs come as repeated "semesterGpas" fields; trailing blanks are unused semesters.
    const sems = fd.getAll('semesterGpas').map((v) => String(v).trim());
    while (sems.length && !sems[sems.length - 1]) sems.pop();
    if (sems.some((v) => !v)) fail('Fill semester GPAs in order, with no gaps');
    const row = GraduandRowSchema.parse({
      ...raw,
      sex: raw.sex || undefined,
      cgpa: blank(raw.cgpa),
      classOfDegree: blank(raw.classOfDegree),
      semesterGpas: sems,
      projectGrade: blank(raw.projectGrade),
      effectiveDate: blank(raw.effectiveDate),
      sourcePage: blank(raw.sourcePage),
      illegible: raw.illegible === 'on',
      courses: parseCourses(String(raw.courses ?? '')),
    });
    const sourceFile = String(raw.sourceFile ?? '');
    if (sourceFile && !sheet.files.some((f) => f.equals(sourceFile))) fail('Pick a scan attached to this sheet');

    const prog = await Programme.findById(sheet.programme).lean();
    const { errors, warnings } = await checkRow(sheet, row, prog?.degreeType);
    if (errors.length) return { ok: false, message: errors.join('. ') };

    const rec = await upsertGraduand(sheet, row, { sourceFile: sourceFile || undefined });
    await audit(user, 'record.index', 'GraduandRecord', rec.id, undefined, { matricNo: row.matricNo, sheet: sheet.reference, illegible: row.illegible });
    return { ok: true, message: `${row.matricNo} saved${row.illegible ? ' and flagged as illegible for the Head of Records' : ''}.`, warnings };
  });
}

/**
 * Bulk-indexes a legacy sheet from the CRR template (Excel or CSV). Rows go through the same
 * checks as single-row entry; nothing is saved if any row fails. Rows whose matric number is
 * already on the sheet are updated, new ones added, and existing rows are never deleted.
 */
export async function importLegacyRows(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('legacy:upload');
    const sheet = await loadSheet(sheetId);
    if (sheet.origin !== 'LEGACY') fail('Not a legacy sheet');
    await assertCanEdit(user, sheet);

    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) fail('Choose the filled template (.xlsx or .csv)');
    const f = file as File;
    if (!/\.(xlsx|csv)$/i.test(f.name)) fail('Upload the template as an Excel (.xlsx) or CSV (.csv) file');
    if (f.size > 5 * 1024 * 1024) fail('File is larger than 5 MB');

    let sourceFile = String(fd.get('sourceFile') ?? '');
    if (!sourceFile && sheet.files.length === 1) sourceFile = sheet.files[0].toString();
    if (sourceFile && !sheet.files.some((x) => x.equals(sourceFile))) fail('Pick a scan attached to this sheet');

    const { rows, errors } = parseTemplate(await f.arrayBuffer(), { fileName: f.name, legacy: true });
    if (errors.length) return { ok: false, message: `${errors.length} problem(s) found. Nothing was saved.`, errors };

    const prog = await Programme.findById(sheet.programme).lean();
    const checkErrors: CellError[] = [];
    const warnings: string[] = [];
    for (const [i, row] of rows.entries()) {
      const c = await checkRow(sheet, row, prog?.degreeType);
      c.errors.forEach((m) => checkErrors.push({ sheet: 'Graduands', row: i + 2, column: 'Matric No', message: m }));
      c.warnings.forEach((w) => warnings.push(`${row.matricNo}: ${w}`));
    }
    if (checkErrors.length) return { ok: false, message: `${checkErrors.length} problem(s) found. Nothing was saved.`, errors: checkErrors, warnings };

    const onSheet = new Set((await GraduandRecord.find({ sheet: sheet._id })
      .populate<{ student: { matricNo: string } }>('student', 'matricNo').lean()).map((r) => r.student.matricNo));
    const updated = rows.filter((r) => onSheet.has(r.matricNo)).length;
    await withTxn(async () => {
      for (const row of rows) await upsertGraduand(sheet, row, { sourceFile: sourceFile || undefined });
    });
    await refreshCount(sheet._id);
    const illegible = rows.filter((r) => r.illegible).length;
    await audit(user, 'record.import', 'ResultSheet', sheetId, undefined,
      { file: f.name, rows: rows.length, added: rows.length - updated, updated, illegible, sourceFile: sourceFile || null });

    return {
      ok: true,
      message: `${rows.length} row(s) imported from ${f.name}: ${rows.length - updated} added, ${updated} updated` +
        `${illegible ? `, ${illegible} flagged illegible` : ''}. Check them against the scan, then send the sheet to QA.`,
      warnings,
    };
  });
}

// ---------------------------------------------------------------- legacy: PG Board result lists

/**
 * Imports a PG Board result list into a box: one legacy sheet per programme (and session), each
 * filled with its graduands. Every row is matched and checked first; nothing is saved unless all
 * pass. Sheets in this box for the same programme and session that are still being indexed are
 * reused (rows updated, none deleted). mode=check only reports what would happen.
 */
export async function importBoardList(batchId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('legacy:upload');
    await db();
    const b = await DigitizationBatch.findById(batchId);
    if (!b) missing('Box not found');
    if (user.role === 'INDEXER' && !b!.indexer?.equals(user.id)) fail('This box is not assigned to you');
    if (b!.status === 'COMPLETED') fail('This box is completed');

    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) fail('Choose the PG Board result list (.xlsx, .xls or .csv)');
    const f = file as File;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) fail('Upload the board list as an Excel (.xlsx or .xls) or CSV file');
    if (f.size > 10 * 1024 * 1024) fail('File is larger than 10 MB');
    const sessionId = String(fd.get('session') ?? '');
    if (!Types.ObjectId.isValid(sessionId)) fail('Choose the session of the final defence');
    const session = await AcademicSession.findById(sessionId).lean();
    if (!session) missing('Session not found');
    const checkOnly = fd.get('mode') === 'check';

    const parsed = parseBoardList(await f.arrayBuffer(), f.name);
    if (!parsed.rows.length) return { ok: false, message: `${parsed.errors.length} problem(s) found. Nothing was saved.`, errors: parsed.errors };

    // Keep going after row problems so one upload lists everything to fix (matching included).
    // A Session column, when present, overrides the session chosen in the form for that row.
    const sessionsByLabel = new Map((await AcademicSession.find().lean()).map((s) => [s.label.replace(/\s+/g, ''), s._id]));
    const errors: CellError[] = [...parsed.errors];
    const sessionOf = new Map<number, Types.ObjectId>();
    for (const r of parsed.rows) {
      if (!r.sessionText) { sessionOf.set(r.line, session!._id); continue; }
      const s = sessionsByLabel.get(r.sessionText.replace(/\s+/g, '').replace('-', '/'));
      if (s) sessionOf.set(r.line, s);
      else errors.push({ sheet: 'Board list', row: r.line, column: 'SESSION', message: `Unknown session "${r.sessionText}"` });
    }
    const resolved = await resolveBoardRows(parsed.rows, boxDepartmentIds(b!));
    errors.push(...resolved.errors);
    errors.sort((x, y) => x.row - y.row);
    if (errors.length) return { ok: false, message: `${errors.length} problem(s) found. Nothing was saved.`, errors };

    // One sheet per programme and session: reuse this box's sheet if it is still being indexed.
    type Group = {
      departmentId: Types.ObjectId; programmeId: Types.ObjectId; programmeName: string; degreeType: string;
      sessionId: Types.ObjectId; rows: typeof parsed.rows; sheet?: ResultSheetDoc;
    };
    const groups = new Map<string, Group>();
    for (const r of parsed.rows) {
      const t = resolved.targets.get(r.line)!;
      const sid = sessionOf.get(r.line)!;
      const key = `${t.programmeId}|${sid}`;
      const g = groups.get(key) ?? { ...t, sessionId: sid, rows: [] };
      g.rows.push(r);
      groups.set(key, g);
    }
    const existing = await ResultSheet.find({ batch: b!._id, origin: 'LEGACY', programme: { $in: [...groups.values()].map((g) => g.programmeId) } });
    for (const g of groups.values()) {
      const s = existing.find((x) => x.programme.equals(g.programmeId) && x.session.equals(g.sessionId));
      if (!s) continue;
      if (!['DRAFT', 'RETURNED'].includes(s.status)) {
        errors.push({ sheet: 'Board list', row: g.rows[0].line, column: 'PROG.', message: `Sheet ${s.reference} (${g.programmeName}) in this box is already ${s.status === 'LOCKED' ? 'locked' : 'with QA'}; its rows can no longer change` });
      } else g.sheet = s;
    }

    // The same checks as single-row indexing (matric format, student in another department, duplicates).
    const warnings: string[] = [];
    for (const g of groups.values()) {
      const like = g.sheet ?? { _id: new Types.ObjectId(), department: g.departmentId, programme: g.programmeId, session: g.sessionId, origin: 'LEGACY' as const };
      for (const r of g.rows) {
        const c = await checkRow(like, r.row, g.degreeType);
        c.errors.forEach((m) => errors.push({ sheet: 'Board list', row: r.line, column: 'NAME/REG. NO.', message: m }));
        c.warnings.forEach((w) => warnings.push(`Row ${r.line} (${r.row.matricNo}): ${w}`));
      }
    }
    if (errors.length) return { ok: false, message: `${errors.length} problem(s) found. Nothing was saved.`, errors, warnings };

    const list = [...groups.values()].sort((a, c) => a.programmeName.localeCompare(c.programmeName));
    const newSheets = list.filter((g) => !g.sheet).length;
    const summary = list.map((g) => `${g.programmeName}: ${g.rows.length}`).join('; ');
    const meeting = parsed.meeting ? ` (${parsed.meeting} PG Board meeting)` : '';
    if (checkOnly) {
      return {
        ok: true,
        message: `Check passed${meeting}: ${parsed.rows.length} graduands in ${list.length} programme sheet(s), ${newSheets} new. ${summary}. Nothing was saved yet.`,
        warnings,
      };
    }

    const refs: string[] = [];
    await withTxn(async () => {
      for (const g of list) {
        const sheet = g.sheet ?? await ResultSheet.create({
          origin: 'LEGACY', reference: await nextSheetReference(), department: g.departmentId,
          programme: g.programmeId, session: g.sessionId, batch: b!._id, status: 'DRAFT', createdBy: user.id,
        });
        for (const r of g.rows) await upsertGraduand(sheet, r.row);
        await refreshCount(sheet._id);
        refs.push(sheet.reference);
      }
    });
    if (b!.status === 'INVENTORIED') { b!.status = 'IN_PROGRESS'; await b!.save(); }
    await audit(user, 'batch.board_import', 'DigitizationBatch', batchId, undefined, {
      file: f.name, meeting: parsed.meeting ?? null, session: session!.label, rows: parsed.rows.length, sheets: refs, newSheets,
    });
    return {
      ok: true,
      message: `Imported ${parsed.rows.length} graduands${meeting} into ${list.length} sheet(s) (${newSheets} new): ${refs.join(', ')}. Attach the scanned board list to each sheet, check the rows, then send them to QA.`,
      warnings,
    };
  });
}

export async function deleteRow(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('legacy:upload', 'submission:create');
    const sheet = await loadSheet(sheetId);
    await assertCanEdit(user, sheet);
    const recordId = String(fd.get('recordId'));
    const rec = await GraduandRecord.findOne({ _id: recordId, sheet: sheet._id, locked: false });
    if (!rec) missing('Row not found');
    await rec!.deleteOne();
    await refreshCount(sheet._id);
    await audit(user, 'record.delete', 'GraduandRecord', recordId, { sheet: sheet.reference, cgpa: rec!.cgpa, classOfDegree: rec!.classOfDegree });
  });
}

export async function markIndexed(sheetId: string): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('legacy:upload');
    const sheet = await loadSheet(sheetId);
    if (sheet.origin !== 'LEGACY') fail('Not a legacy sheet');
    await assertCanEdit(user, sheet);
    if (!sheet.files.length) fail('Attach the scan first');
    if (!sheet.recordCount) fail('Index at least one graduand first');
    const before = sheet.status;
    sheet.status = 'INDEXED';
    stamp(sheet, user, 'INDEXING', 'SUBMIT');
    await sheet.save();
    await audit(user, 'sheet.indexed', 'ResultSheet', sheetId, { status: before }, { status: 'INDEXED' });
    return { ok: true, message: 'Sent for QA review.' };
  });
}

// ---------------------------------------------------------------- legacy: QA and lock

export async function qaDecision(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('legacy:qa');
    const pass = fd.get('decision') === 'pass';
    const comment = String(fd.get('comment') ?? '').trim();
    const sheet = await loadSheet(sheetId);
    if (sheet.status !== 'INDEXED') fail('Sheet is not awaiting QA');
    // Maker-checker: the indexer can never pass their own work.
    if (sheet.createdBy.equals(user.id) || sheet.approvals.some((a) => a.stage === 'INDEXING' && a.by?.equals(user.id))) {
      fail('You cannot review your own indexing');
    }
    if (user.role === 'QA_REVIEWER') {
      const batch = await DigitizationBatch.findById(sheet.batch).lean();
      if (!batch?.reviewer?.equals(user.id)) fail('This box is not assigned to you for QA');
    }
    if (!pass && comment.length < 5) fail('Describe what the indexer must correct');
    if (pass && fd.get('attest') !== 'on') fail('Confirm you compared every row against the scan');

    const before = sheet.status;
    sheet.status = pass ? 'QA_PASSED' : 'RETURNED';
    stamp(sheet, user, 'QA', pass ? 'APPROVE' : 'RETURN', comment || undefined);
    await sheet.save();
    await audit(user, 'sheet.qa', 'ResultSheet', sheetId, { status: before }, { status: sheet.status, comment });
    if (!pass) await notifySheet(sheet._id, comment);
    return { ok: true, message: pass ? 'QA passed. The Head of Records can now lock this sheet.' : 'Returned to the indexer.' };
  });
}

export async function lockSheet(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('record:lock');
    const comment = String(fd.get('comment') ?? '').trim();
    await withTxn(async (session) => {
      const sheet = await ResultSheet.findById(sheetId).session(session);
      if (!sheet || sheet.status !== 'QA_PASSED') fail('Only QA-passed sheets can be locked');
      const illegible = await GraduandRecord.countDocuments({ sheet: sheet!._id, illegible: true }).session(session);
      if (illegible && fd.get('acceptIllegible') !== 'on') fail(`${illegible} row(s) are flagged illegible; resolve them or confirm to lock anyway`);
      sheet!.status = 'LOCKED';
      stamp(sheet!, user, 'RECORDS', 'LOCK', comment || undefined);
      await GraduandRecord.updateMany({ sheet: sheet!._id }, { $set: { locked: true } }, { session: session ?? undefined });
      await sheet!.save({ session });
    });
    await audit(user, 'sheet.lock', 'ResultSheet', sheetId, { status: 'QA_PASSED' }, { status: 'LOCKED' });
    return { ok: true, message: 'Sheet and all its records are locked.' };
  });
}

export async function returnFromRecords(sheetId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('record:lock');
    const comment = String(fd.get('comment') ?? '').trim();
    if (comment.length < 5) fail('Describe what must be corrected');
    const sheet = await loadSheet(sheetId);
    if (sheet.status !== 'QA_PASSED') fail('Only QA-passed sheets can be returned here');
    sheet.status = 'RETURNED';
    stamp(sheet, user, 'RECORDS', 'RETURN', comment);
    await sheet.save();
    await audit(user, 'sheet.return', 'ResultSheet', sheetId, { status: 'QA_PASSED' }, { status: 'RETURNED', comment });
    await notifySheet(sheet._id, comment);
  });
}

