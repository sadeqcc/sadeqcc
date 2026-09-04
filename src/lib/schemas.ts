import { z } from 'zod';
import { CASH_ENTRY_KINDS, DIFFERENCE_REASONS, HOLDER_TYPES } from './types';
import { parseCash, parseGold } from './num';

const numish = z.union([z.string(), z.number()]);

/** Positive-only money field: direction/kind decides the sign, never the input. */
export const cashAmount = numish.transform((v, ctx) => {
  const f = parseCash(v);
  if (f === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_amount' });
    return z.NEVER;
  }
  if (f < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'negative_amount' });
    return z.NEVER;
  }
  return f;
});

export const cashAmountSigned = numish.transform((v, ctx) => {
  const f = parseCash(v);
  if (f === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_amount' });
    return z.NEVER;
  }
  return f;
});

export const goldWeight = numish.transform((v, ctx) => {
  const mg = parseGold(v);
  if (mg === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_weight' });
    return z.NEVER;
  }
  if (mg < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'negative_weight' });
    return z.NEVER;
  }
  return mg;
});

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');
const optText = z.string().trim().max(500).optional().nullable();

export const dayPatchSchema = z.object({
  date: dateStr,
  shift: z.string().trim().max(32).default('main'),
  employeeName: z.string().trim().max(120).optional().nullable(),
  systemCashFils: cashAmount.optional().nullable(),
  physicalMode: z.enum(['total', 'count']).optional(),
  physicalCashFils: cashAmount.optional(),
  denominations: z.record(z.string(), z.number().int().min(0).max(1_000_000)).optional(),
  notes: optText,
  differenceReasons: z.array(z.enum(DIFFERENCE_REASONS as [string, ...string[]])).optional(),
  reasonText: optText,
});

const clientId = z.string().uuid().optional();

export const cashEntrySchema = z.object({
  id: clientId,
  dayId: z.string().min(1),
  kind: z.enum(CASH_ENTRY_KINDS as [string, ...string[]]),
  amountFils: cashAmount,
  personName: optText,
  description: optText,
  refNo: optText,
  entryDate: dateStr,
  dueDate: dateStr.optional().nullable(),
  note: optText,
  attachmentId: z.string().optional().nullable(),
});

export const cashEntryPatchSchema = cashEntrySchema.partial().omit({ dayId: true, id: true });

export const adjustmentSchema = z.object({
  id: clientId,
  dayId: z.string().min(1),
  name: z.string().trim().min(1, 'name_required').max(120),
  amountFils: cashAmount,
  direction: z.enum(['add_physical', 'sub_physical', 'add_system', 'sub_system']),
  note: optText,
  entryDate: dateStr,
  attachmentId: z.string().optional().nullable(),
});

export const adjustmentPatchSchema = adjustmentSchema.partial().omit({ dayId: true, id: true });

export const movementSchema = z.object({
  id: clientId,
  karat: z.string().trim().min(1).max(16),
  direction: z.enum(['out', 'in']),
  holderType: z.enum(HOLDER_TYPES as [string, ...string[]]),
  holderName: z.string().trim().min(1, 'name_required').max(120),
  weightMg: goldWeight.refine((v) => v > 0, 'weight_required'),
  deliveryDate: dateStr,
  expectedReturnDate: dateStr.optional().nullable(),
  reason: optText,
  refNo: optText,
  note: optText,
  attachmentId: z.string().optional().nullable(),
});

export const movementPatchSchema = movementSchema.partial().extend({
  returnedMg: goldWeight.optional(),
  status: z.enum(['outstanding', 'partially_returned', 'returned', 'overdue']).optional(),
  returnedAt: z.string().optional().nullable(),
});

export const goldRowSchema = z.object({
  dayId: z.string().min(1),
  karat: z.string().trim().min(1).max(16),
  systemMg: goldWeight.optional(),
  drawerMg: goldWeight.optional(),
});

export const personSchema = z.object({
  id: clientId,
  name: z.string().trim().min(1, 'name_required').max(120),
  type: z.enum(HOLDER_TYPES as [string, ...string[]]).default('person'),
  phone: optText,
  note: optText,
});

export const locationSchema = z.object({
  id: clientId,
  name: z.string().trim().min(1, 'name_required').max(120),
  kind: z.string().trim().max(40).default('office'),
  note: optText,
});

export const settingsSchema = z.object({
  language: z.enum(['ar', 'en']).optional(),
  theme: z.enum(['dark', 'light']).optional(),
  palette: z.enum(['black_gold', 'navy_gold', 'white_gold', 'emerald', 'burgundy', 'high_contrast']).optional(),
  employeeName: z.string().trim().max(120).optional(),
  shopName: z.string().trim().max(120).optional(),
  goldPrecision: z.union([z.literal(1), z.literal(10), z.literal(100)]).optional(),
  karats: z.array(z.string().trim().min(1).max(16)).max(24).optional(),
  tolerances: z.record(z.string(), z.number().int().min(0)).optional(),
  cashTolerance: z.number().int().min(0).optional(),
  pinEnabled: z.boolean().optional(),
  tipsEnabled: z.boolean().optional(),
  alertsEnabled: z.boolean().optional(),
  multiShift: z.boolean().optional(),
  autoBackup: z.boolean().optional(),
});

export const finalizeSchema = z.object({
  dayId: z.string().min(1),
  reasonText: z.string().trim().max(1000).optional().nullable(),
  differenceReasons: z.array(z.enum(DIFFERENCE_REASONS as [string, ...string[]])).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  confirm: z.literal(true),
});

export const unlockSchema = z.object({
  dayId: z.string().min(1),
  pin: z.string().min(3).max(32),
  reason: z.string().trim().min(3, 'reason_required').max(500),
});

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(200),
  displayName: z.string().trim().max(120).optional(),
});

export const pinSchema = z.object({
  pin: z.string().min(4).max(32).nullable(),
  currentPin: z.string().max(32).optional().nullable(),
});
