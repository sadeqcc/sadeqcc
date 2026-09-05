import { z } from 'zod';
import {
  CANCEL_REASONS,
  ORDER_STATUSES,
  QUALITY_CHECKS,
} from './types';

/** Every server input is validated here. Nothing writes straight from a body. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');
const optionalDate = isoDate.nullable().optional();
const text = (max = 200) => z.string().trim().max(max);
const optionalText = (max = 200) => text(max).nullable().optional();
const fils = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000);
const positiveFils = z.number().int().min(0).max(1_000_000_000_000);
const mg = z.number().int().min(0).max(1_000_000_000);
const id = z.string().min(1).max(64);

export const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(40),
  password: z.string().min(6).max(200),
});

export const registerSchema = credentialsSchema.extend({
  displayName: text(80).optional().default(''),
});

export const createStaffSchema = credentialsSchema.extend({
  displayName: text(80).optional().default(''),
  role: z.enum(['manager', 'employee']),
});

export const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4–8 digits').nullable(),
  currentPin: z.string().max(8).optional(),
});

export const customerSchema = z.object({
  id: id.optional(),
  name: text(120).min(1, 'Customer name is required'),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  country: optionalText(60),
  city: optionalText(60),
  customerType: optionalText(30),
  customerRef: optionalText(40),
  instagram: optionalText(60),
  email: z.string().trim().email('Enter a valid email').max(120).nullable().optional().or(z.literal('')),
  tags: z.array(text(30)).max(20).optional(),
  notes: optionalText(2000),
});

export const makerSchema = z.object({
  id: id.optional(),
  name: text(120).min(1, 'Maker name is required'),
  company: optionalText(120),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  location: optionalText(120),
  specialty: optionalText(60),
  notes: optionalText(2000),
});

export const travelerSchema = z.object({
  id: id.optional(),
  name: text(120).min(1, 'Traveler name is required'),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  frequentRoute: optionalText(80),
  idReference: optionalText(60),
  notes: optionalText(2000),
});

export const tagSchema = z.object({
  id: id.optional(),
  name: text(40).min(1, 'Tag name is required'),
  color: optionalText(20),
});

export const orderCreateSchema = z
  .object({
    id: id.optional(),
    /** Either an existing customer or a new one created inline. */
    customerId: id.optional(),
    customer: customerSchema.optional(),
    orderNumber: optionalText(40),
    referenceNo: optionalText(40),
    category: text(40).default('Other'),
    productName: text(120).min(1, 'Product name is required'),
    style: optionalText(40),
    karat: text(10).default('21K'),

    expectedWeightMg: mg,
    minimumWeightMg: mg.nullable().optional(),
    maximumWeightMg: mg.nullable().optional(),
    actualWeightMg: mg.nullable().optional(),

    goldRateFilsPerGram: positiveFils.default(0),
    goldRateMode: z.enum(['per_gram', 'per_ounce', 'manual']).default('per_gram'),
    goldValueOverrideFils: positiveFils.nullable().optional(),
    makingChargeMode: z.enum(['per_gram', 'fixed']).default('per_gram'),
    makingChargeFils: positiveFils.default(0),
    otherChargesFils: positiveFils.default(0),
    discountFils: positiveFils.default(0),
    vatBp: z.number().int().min(0).max(10_000).default(0),

    depositFils: positiveFils.optional(),
    depositMethod: optionalText(30),

    makerId: id.nullable().optional(),
    makerReference: optionalText(60),
    makerCostFils: positiveFils.default(0),
    makerNotes: optionalText(2000),
    sentToMakerDate: optionalDate,

    travelerId: id.nullable().optional(),
    destination: optionalText(80),

    orderDate: isoDate.optional(),
    expectedReadyDate: optionalDate,
    expectedDeliveryDate: optionalDate,

    coverMediaId: id.nullable().optional(),
    mediaIds: z.array(id).max(30).optional(),
    notes: optionalText(4000),
    tags: z.array(text(30)).max(20).optional(),
    status: z.enum(ORDER_STATUSES).optional(),
    acknowledgeDuplicate: z.boolean().optional(),
  })
  .refine((v) => v.customerId || v.customer, { message: 'Choose or create a customer', path: ['customerId'] })
  .refine(
    (v) => v.minimumWeightMg == null || v.maximumWeightMg == null || v.minimumWeightMg <= v.maximumWeightMg,
    { message: 'Minimum weight cannot exceed the maximum', path: ['minimumWeightMg'] },
  );

export const orderUpdateSchema = z.object({
  referenceNo: optionalText(40),
  customerId: id.optional(),
  category: text(40).optional(),
  productName: text(120).min(1).optional(),
  style: optionalText(40),
  karat: text(10).optional(),

  expectedWeightMg: mg.optional(),
  minimumWeightMg: mg.nullable().optional(),
  maximumWeightMg: mg.nullable().optional(),
  actualWeightMg: mg.nullable().optional(),

  goldRateFilsPerGram: positiveFils.optional(),
  goldRateMode: z.enum(['per_gram', 'per_ounce', 'manual']).optional(),
  goldValueOverrideFils: positiveFils.nullable().optional(),
  makingChargeMode: z.enum(['per_gram', 'fixed']).optional(),
  makingChargeFils: positiveFils.optional(),
  otherChargesFils: positiveFils.optional(),
  discountFils: positiveFils.optional(),
  vatBp: z.number().int().min(0).max(10_000).optional(),

  makerId: id.nullable().optional(),
  makerReference: optionalText(60),
  makerCostFils: positiveFils.optional(),
  makerNotes: optionalText(2000),
  sentToMakerDate: optionalDate,

  travelerId: id.nullable().optional(),
  destination: optionalText(80),

  orderDate: isoDate.optional(),
  expectedReadyDate: optionalDate,
  readyDate: optionalDate,
  expectedDeliveryDate: optionalDate,
  arrivalDate: optionalDate,
  deliveredDate: optionalDate,

  qualityCheck: z.enum(QUALITY_CHECKS).nullable().optional(),
  receivedBy: optionalText(120),
  deliveryMethod: optionalText(40),

  coverMediaId: id.nullable().optional(),
  notes: optionalText(4000),
  tags: z.array(text(30)).max(20).optional(),
  reason: optionalText(300),
});

export const statusChangeSchema = z.object({
  toStatus: z.enum(ORDER_STATUSES),
  note: optionalText(2000),
  mediaId: id.nullable().optional(),
  occurredAt: z.string().datetime().optional(),

  makerId: id.nullable().optional(),
  makerReference: optionalText(60),
  makerCostFils: positiveFils.nullable().optional(),
  makerNotes: optionalText(2000),
  sentToMakerDate: optionalDate,
  expectedReadyDate: optionalDate,

  actualWeightMg: mg.nullable().optional(),
  readyDate: optionalDate,
  qualityCheck: z.enum(QUALITY_CHECKS).nullable().optional(),

  travelerId: id.nullable().optional(),
  shipmentId: id.nullable().optional(),
  destination: optionalText(80),
  departureDate: optionalDate,
  expectedArrival: optionalDate,
  flightNumber: optionalText(20),
  airline: optionalText(60),
  packageRef: optionalText(60),

  arrivalDate: optionalDate,
  arrivalTime: optionalText(10),
  receivedBy: optionalText(120),

  deliveredDate: optionalDate,
  deliveredTime: optionalText(10),
  deliveryMethod: optionalText(40),
  finalPaymentFils: positiveFils.nullable().optional(),
  finalPaymentMethod: optionalText(30),
  acknowledgeBalance: z.boolean().optional(),

  cancelReason: z.enum(CANCEL_REASONS).nullable().optional(),
  cancelNote: optionalText(2000),
});

export const paymentSchema = z.object({
  id: id.optional(),
  amountFils: fils.refine((v) => v !== 0, 'Enter an amount'),
  paidOn: isoDate,
  paidAt: z.string().datetime().nullable().optional(),
  method: text(30).default('Cash'),
  reference: optionalText(60),
  note: optionalText(500),
  mediaId: id.nullable().optional(),
  reason: optionalText(300),
});

export const exchangeSchema = z.object({
  id: id.optional(),
  karat: text(10).min(1),
  weightMg: mg.refine((v) => v > 0, 'Enter a weight'),
  rateFilsPerGram: positiveFils.default(0),
  valueFils: positiveFils,
  receivedOn: isoDate,
  mediaId: id.nullable().optional(),
  notes: optionalText(500),
});

export const ledgerSchema = z.object({
  id: id.optional(),
  kind: z.enum(['opening', 'charge', 'payment', 'writeoff']),
  amountFils: positiveFils.refine((v) => v > 0, 'Enter an amount'),
  entryDate: isoDate,
  method: optionalText(30),
  reference: optionalText(60),
  note: optionalText(500),
  mediaId: id.nullable().optional(),
  reason: optionalText(300),
});

export const noteSchema = z.object({
  id: id.optional(),
  text: z.string().trim().min(1, 'Write something').max(4000),
  pinned: z.boolean().optional(),
});

export const mediaSchema = z.object({
  id: id.optional(),
  orderId: id.nullable().optional(),
  name: text(200).min(1),
  mime: text(100).min(1),
  size: z.number().int().min(0).max(20_000_000),
  category: text(40).default('Other'),
  /** Data URL. Photos are compressed on the client before they get here. */
  data: z.string().min(10).max(24_000_000),
  thumb: z.string().max(400_000).nullable().optional(),
  setAsCover: z.boolean().optional(),
});

export const shipmentSchema = z.object({
  id: id.optional(),
  travelerId: id,
  destination: text(80).min(1),
  departureDate: optionalDate,
  expectedArrival: optionalDate,
  flightNumber: optionalText(20),
  airline: optionalText(60),
  packageRef: optionalText(60),
  notes: optionalText(1000),
});

export const settingsSchema = z.object({
  language: z.enum(['ar', 'en']).optional(),
  shopName: text(80).optional(),
  shopLogo: z.string().max(400_000).nullable().optional(),
  shopPhone: text(40).optional(),
  shopAddress: text(200).optional(),
  employeeName: text(80).optional(),
  currency: text(6).optional(),
  timezone: text(60).optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  karats: z.array(text(10)).max(30).optional(),
  styles: z.array(text(40)).max(40).optional(),
  categories: z.array(text(40)).max(40).optional(),
  paymentMethods: z.array(text(40)).max(30).optional(),
  destinations: z.array(text(80)).max(60).optional(),
  weightPrecision: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  defaultToleranceMg: mg.optional(),
  defaultGoldRateFilsPerGram: z.record(z.string(), positiveFils).optional(),
  defaultMakingChargeFilsPerGram: positiveFils.optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  orderNumberPrefix: text(8).optional(),
  orderNumberPadding: z.number().int().min(1).max(8).optional(),
  notifications: z
    .object({
      overdue: z.boolean(),
      dueToday: z.boolean(),
      dueTomorrow: z.boolean(),
      makerDeadline: z.boolean(),
      travelerDeparture: z.boolean(),
      travelerArrival: z.boolean(),
      balance: z.boolean(),
      ready: z.boolean(),
      arrived: z.boolean(),
    })
    .partial()
    .optional(),
});

export const restoreSchema = z.object({
  pin: z.string().max(8).optional(),
  backup: z.object({
    app: z.literal('gold-orders'),
    version: z.number().int().min(1),
    exportedAt: z.string(),
    tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;
export type StatusChangePayload = z.infer<typeof statusChangeSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type MediaInput = z.infer<typeof mediaSchema>;
