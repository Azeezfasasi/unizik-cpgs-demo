import 'server-only';
import { Types } from 'mongoose';

type BoxDepts = {
  department?: Types.ObjectId | { _id: Types.ObjectId; name?: string; code?: string } | null;
  departments?: (Types.ObjectId | { _id: Types.ObjectId; name?: string; code?: string })[] | null;
  allDepartments?: boolean | null;
};

const idOf = (d: Types.ObjectId | { _id: Types.ObjectId }) => (d instanceof Types.ObjectId ? d : d._id);

/** Departments whose files a box holds; null when it holds any department's (e.g. PG Board lists). */
export function boxDepartmentIds(b: BoxDepts): Types.ObjectId[] | null {
  if (b.allDepartments) return null;
  const ids = [...(b.departments ?? []), ...(b.department ? [b.department] : [])].map(idOf);
  return ids.filter((id, i) => ids.findIndex((x) => x.equals(id)) === i);
}

/** Short description of a box's departments for lists and labels (departments populated with name/code). */
export function boxDepartmentLabel(b: BoxDepts, style: 'name' | 'code' = 'name') {
  if (b.allDepartments) return style === 'name' ? 'All departments (PG Board list)' : 'ALL';
  const list = [...(b.departments ?? []), ...(b.department ? [b.department] : [])]
    .filter((d): d is { _id: Types.ObjectId; name?: string; code?: string } => !(d instanceof Types.ObjectId))
    .filter((d, i, arr) => arr.findIndex((x) => x._id.equals(d._id)) === i);
  if (!list.length) return '—';
  if (style === 'code') return list.map((d) => d.code).join(', ');
  return list.length <= 2 ? list.map((d) => d.name).join(' and ') : `${list[0].name} and ${list.length - 1} more departments`;
}

/** Filter for boxes that may hold a department's files. */
export function boxesForDepartment(departmentId: string | Types.ObjectId) {
  const id = new Types.ObjectId(String(departmentId));
  return { $or: [{ department: id }, { departments: id }, { allDepartments: true }] };
}
