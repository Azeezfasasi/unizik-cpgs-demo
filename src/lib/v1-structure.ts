import 'server-only';
import type { Model } from 'mongoose';
import { db } from './db';
import { requirePermission } from './auth';
import { describeUsage, usageMap, type StructureKind } from './structure';
import { apiError, assertId, fromAction, json, out, param, readJson, toForm, v1, type RouteCtx } from './v1';
import type { ActionState } from './action-state';
import { AcademicSession, Department, Faculty, Programme } from '@/models';
import {
  createDepartment, createFaculty, createProgramme, createSession, deleteDepartment, deleteFaculty, deleteProgramme,
  deleteSession, updateDepartment, updateFaculty, updateProgramme, updateSession,
} from '@/app/(portal)/admin/actions';

type Create = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type Update = (id: string, prev: ActionState, fd: FormData) => Promise<ActionState>;
type Remove = (id: string) => Promise<ActionState>;

const KINDS: Record<StructureKind, {
  model: Model<never>; label: string; sort: Record<string, 1 | -1>; fields: string[]; filters: string[];
  create: Create; update: Update; remove: Remove;
}> = {
  faculty: { model: Faculty as never, label: 'Faculty', sort: { name: 1 }, fields: ['name', 'code'], filters: [], create: createFaculty, update: updateFaculty, remove: deleteFaculty },
  department: { model: Department as never, label: 'Department', sort: { name: 1 }, fields: ['name', 'code', 'faculty', 'matricPattern'], filters: ['faculty'], create: createDepartment, update: updateDepartment, remove: deleteDepartment },
  programme: { model: Programme as never, label: 'Programme', sort: { name: 1 }, fields: ['name', 'code', 'degreeType', 'department'], filters: ['department'], create: createProgramme, update: updateProgramme, remove: deleteProgramme },
  session: { model: AcademicSession as never, label: 'Session', sort: { startYear: -1 }, fields: ['startYear'], filters: [], create: createSession, update: updateSession, remove: deleteSession },
};

const withUsage = (doc: Record<string, unknown>, usage?: Record<string, number>) =>
  ({ ...doc, usage: usage ?? {}, deletable: !usage || Object.keys(usage).length === 0, usageSummary: usage && Object.keys(usage).length ? describeUsage(usage) : null });

/** GET list and POST create for a structure collection. */
export function collectionRoutes(kind: StructureKind) {
  const k = KINDS[kind];
  return {
    GET: v1(async (req: Request) => {
      await requirePermission();
      await db();
      const url = new URL(req.url);
      const filter = Object.fromEntries(k.filters.flatMap((f) => (url.searchParams.get(f) ? [[f, url.searchParams.get(f)]] : [])));
      const [docs, usage] = await Promise.all([k.model.find(filter).sort(k.sort).lean(), usageMap(kind)]);
      return json({ data: docs.map((d) => withUsage(out(d), usage.get(String((d as { _id: unknown })._id)))) });
    }),
    POST: v1(async (req: Request) => {
      await requirePermission('structure:manage');
      const body = await readJson(req);
      const res = await k.create({}, toForm(body));
      if (!res.ok) return fromAction(res);
      await db();
      const created = kind === 'session'
        ? await AcademicSession.findOne({ startYear: Number(body.startYear) }).lean()
        : await k.model.findOne({ code: String(body.code ?? '').trim().toUpperCase() }).lean();
      return json({ ok: true, message: res.message, data: created ? withUsage(out(created)) : null }, 201);
    }),
  };
}

/** GET one, PATCH (partial update) and DELETE for a structure item. */
export function itemRoutes(kind: StructureKind) {
  const k = KINDS[kind];
  const load = async (id: string) => {
    assertId(id, k.label);
    await db();
    return k.model.findById(id).lean() as Promise<Record<string, unknown> | null>;
  };
  return {
    GET: v1(async (_req: Request, ctx: RouteCtx) => {
      await requirePermission();
      const id = await param(ctx);
      const doc = await load(id);
      if (!doc) return apiError(404, `${k.label} not found`);
      const usage = (await usageMap(kind, [doc._id as never])).get(id);
      return json({ data: withUsage(out(doc), usage) });
    }),
    PATCH: v1(async (req: Request, ctx: RouteCtx) => {
      await requirePermission('structure:manage');
      const id = await param(ctx);
      const doc = await load(id);
      if (!doc) return apiError(404, `${k.label} not found`);
      const body = await readJson(req);
      // Unspecified fields keep their current values.
      const merged = Object.fromEntries(k.fields.map((f) => [f, f in body ? body[f] : doc[f] == null ? '' : String(doc[f])]));
      const res = await k.update(id, {}, toForm(merged));
      if (!res.ok) return fromAction(res);
      return json({ ok: true, message: res.message, data: withUsage(out(await load(id))) });
    }),
    DELETE: v1(async (_req: Request, ctx: RouteCtx) => {
      await requirePermission('structure:manage');
      const id = await param(ctx);
      if (!(await load(id))) return apiError(404, `${k.label} not found`);
      return fromAction(await k.remove(id));
    }),
  };
}
