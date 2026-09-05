import type { DictKey, Lang } from '@/i18n/dict';

/**
 * GOLD ORDERS — domain model.
 *
 * Money is stored as an integer number of fils (1 AED = 100 fils).
 * Gold weight is stored as an integer number of milligrams (1 g = 1000 mg).
 * Rates are stored as fils per gram. Nothing monetary is ever a float.
 */

/* ------------------------------------------------------------------ status */

export const ORDER_STATUSES = [
  'ordered',
  'maker',
  'ready',
  'traveler',
  'arrived',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The normal happy path, in order. `cancelled` is deliberately not part of it. */
export const STATUS_FLOW: OrderStatus[] = ['ordered', 'maker', 'ready', 'traveler', 'arrived', 'delivered'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  ordered: 'Ordered',
  maker: 'Maker',
  ready: 'Ready',
  traveler: 'Traveler',
  arrived: 'Arrived',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_ICON: Record<OrderStatus, string> = {
  ordered: '📝',
  maker: '🔨',
  ready: '✅',
  traveler: '✈️',
  arrived: '📍',
  delivered: '🎁',
  cancelled: '⛔',
};

/** Tailwind token names (see globals.css) — never colour alone, always paired with text. */
export const STATUS_TONE: Record<OrderStatus, string> = {
  ordered: 'st-ordered',
  maker: 'st-maker',
  ready: 'st-ready',
  traveler: 'st-traveler',
  arrived: 'st-arrived',
  delivered: 'st-delivered',
  cancelled: 'st-cancelled',
};

/** Translation keys for the status names, so a badge reads in the chosen language. */
export const STATUS_KEY: Record<OrderStatus, DictKey> = {
  ordered: 'status_ordered',
  maker: 'status_maker',
  ready: 'status_ready',
  traveler: 'status_traveler',
  arrived: 'status_arrived',
  delivered: 'status_delivered',
  cancelled: 'status_cancelled',
};

export const CLOSED_STATUSES: OrderStatus[] = ['delivered', 'cancelled'];
export const isClosed = (s: OrderStatus): boolean => CLOSED_STATUSES.includes(s);

/* ---------------------------------------------------------------- urgency */

export const URGENCY_LEVELS = [
  'critical',
  'high',
  'late',
  'due_today',
  'due_tomorrow',
  'upcoming',
  'no_date',
  'delivered',
  'cancelled',
] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const URGENCY_LABEL: Record<Urgency, string> = {
  critical: 'Critical',
  high: 'High Priority',
  late: 'Late',
  due_today: 'Due Today',
  due_tomorrow: 'Due Tomorrow',
  upcoming: 'On Schedule',
  no_date: 'No Delivery Date',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const URGENCY_KEY: Record<Urgency, DictKey> = {
  critical: 'urgency_critical',
  high: 'urgency_high',
  late: 'urgency_late',
  due_today: 'urgency_due_today',
  due_tomorrow: 'urgency_due_tomorrow',
  upcoming: 'urgency_upcoming',
  no_date: 'urgency_no_date',
  delivered: 'urgency_delivered',
  cancelled: 'urgency_cancelled',
};

export const URGENCY_ICON: Record<Urgency, string> = {
  critical: '🚨',
  high: '🔴',
  late: '🔴',
  due_today: '🟡',
  due_tomorrow: '🟠',
  upcoming: '🟢',
  no_date: '⚪',
  delivered: '✅',
  cancelled: '⛔',
};

/* ------------------------------------------------------------- catalogues */

export const CATEGORIES = [
  'Necklace',
  'Bracelet',
  'Ring',
  'Earrings',
  'Pendant',
  'Chain',
  'Bangle',
  'Set',
  'Anklet',
  'Custom',
  'Other',
] as const;

export const STYLES = ['Dubai', 'Indian', 'Italian', 'Turkish', 'Custom', 'Other'] as const;

export const KARATS = ['24K', '22K', '21K', '18K', '16K', '14K'] as const;

export const CUSTOMER_TYPES = ['Regular', 'VIP', 'Wholesale', 'Retail', 'New Customer'] as const;

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'PayPal', 'Exchange Gold', 'Other'] as const;

export const DELIVERY_METHODS = ['Shop Pickup', 'Representative', 'Traveler', 'Courier', 'Other'] as const;

export const MEDIA_CATEGORIES = [
  'Reference Photo',
  'Customer Photo',
  'Maker Progress',
  'Ready Product',
  'Traveler Proof',
  'Arrival Proof',
  'Delivery Proof',
  'Other',
] as const;

export const CANCEL_REASONS = [
  'Customer Cancelled',
  'Maker Unable',
  'Payment Issue',
  'Unavailable',
  'Duplicate Order',
  'Other',
] as const;

export const QUALITY_CHECKS = ['Passed', 'Needs Adjustment', 'Rejected'] as const;

export const DEFAULT_TAGS = [
  'VIP',
  'Wedding',
  'Urgent',
  'Special Order',
  'Paid',
  'Balance',
  'Replacement',
  'Repair',
  'Exchange',
] as const;

/** Route suggestions come from the shop's own destination list in Settings. */
export const COMMON_ROUTES: readonly string[] = [];

export const MAKER_SPECIALTIES = ['Dubai Style', 'Indian Style', 'Italian Style', 'Repair', 'Custom Work'] as const;

/* ------------------------------------------------------------------ roles */

export const ROLES = ['owner', 'manager', 'employee'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'order.create',
  'order.edit',
  'order.status',
  'order.cancel',
  'order.delete',
  'customer.manage',
  'payment.create',
  'payment.edit',
  'payment.delete',
  'directory.manage',
  'reports.view',
  'finance.view',
  'settings.manage',
  'backup.manage',
  'audit.view',
  'user.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: Permission[] = [
  'order.create',
  'order.edit',
  'order.status',
  'order.cancel',
  'customer.manage',
  'payment.create',
  'payment.edit',
  'payment.delete',
  'directory.manage',
  'reports.view',
  'finance.view',
  'audit.view',
];

const EMPLOYEE: Permission[] = [
  'order.create',
  'order.edit',
  'order.status',
  'customer.manage',
  'payment.create',
  'directory.manage',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: MANAGER,
  employee: EMPLOYEE,
};

export function can(role: string | null | undefined, p: Permission): boolean {
  const r = (role ?? 'employee') as Role;
  const list = ROLE_PERMISSIONS[r] ?? EMPLOYEE;
  return list.includes(p);
}

/* --------------------------------------------------------------- settings */

export interface AppSettings {
  language: Lang;
  shopName: string;
  shopLogo: string | null;
  shopPhone: string;
  shopAddress: string;
  employeeName: string;
  currency: string;
  timezone: string;
  theme: 'dark' | 'light' | 'system';
  karats: string[];
  styles: string[];
  categories: string[];
  paymentMethods: string[];
  destinations: string[];
  weightPrecision: 1 | 2 | 3;
  defaultToleranceMg: number;
  defaultGoldRateFilsPerGram: Record<string, number>;
  defaultMakingChargeFilsPerGram: number;
  vatPercent: number;
  orderNumberPrefix: string;
  orderNumberPadding: number;
  notifications: {
    overdue: boolean;
    dueToday: boolean;
    dueTomorrow: boolean;
    makerDeadline: boolean;
    travelerDeparture: boolean;
    travelerArrival: boolean;
    balance: boolean;
    ready: boolean;
    arrived: boolean;
  };
}

/** What a settings update may carry: any field, and any subset of the toggles. */
export type SettingsPatch = Partial<Omit<AppSettings, 'notifications'>> & {
  notifications?: Partial<AppSettings['notifications']>;
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'ar',
  shopName: '',
  shopLogo: null,
  shopPhone: '',
  shopAddress: '',
  employeeName: '',
  currency: 'AED',
  timezone: 'Asia/Dubai',
  theme: 'dark',
  karats: [...KARATS],
  styles: [...STYLES],
  categories: [...CATEGORIES],
  paymentMethods: [...PAYMENT_METHODS],
  destinations: [],
  weightPrecision: 3,
  defaultToleranceMg: 2000,
  defaultGoldRateFilsPerGram: {},
  defaultMakingChargeFilsPerGram: 0,
  vatPercent: 0,
  orderNumberPrefix: 'GO',
  orderNumberPadding: 4,
  notifications: {
    overdue: true,
    dueToday: true,
    dueTomorrow: true,
    makerDeadline: true,
    travelerDeparture: true,
    travelerArrival: true,
    balance: true,
    ready: true,
    arrived: true,
  },
};

/* ------------------------------------------------------------------ rows */

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  city: string | null;
  customerType: string | null;
  customerRef: string | null;
  instagram: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Maker {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  location: string | null;
  specialty: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Traveler {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  frequentRoute: string | null;
  idReference: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  amountFils: number;
  paidOn: string;
  paidAt: string | null;
  method: string;
  reference: string | null;
  note: string | null;
  mediaId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
}

export interface GoldExchange {
  id: string;
  orderId: string;
  karat: string;
  weightMg: number;
  rateFilsPerGram: number;
  valueFils: number;
  mediaId: string | null;
  notes: string | null;
  receivedOn: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderNote {
  id: string;
  orderId: string;
  text: string;
  pinned: number;
  createdByName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderMedia {
  id: string;
  orderId: string | null;
  name: string;
  mime: string;
  size: number;
  kind: 'photo' | 'video' | 'file';
  category: string;
  thumb: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface StatusEvent {
  id: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  mediaId: string | null;
  detail: Record<string, unknown> | null;
  actor: string;
  occurredAt: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  referenceNo: string | null;
  customerId: string;
  category: string;
  productName: string;
  style: string | null;
  karat: string;

  expectedWeightMg: number;
  minimumWeightMg: number | null;
  maximumWeightMg: number | null;
  actualWeightMg: number | null;

  goldRateFilsPerGram: number;
  goldRateMode: 'per_gram' | 'per_ounce' | 'manual';
  goldValueOverrideFils: number | null;
  makingChargeMode: 'per_gram' | 'fixed';
  makingChargeFils: number;
  otherChargesFils: number;
  discountFils: number;
  vatBp: number;
  totalAmountFils: number;
  totalPaidFils: number;
  remainingBalanceFils: number;

  makerId: string | null;
  makerReference: string | null;
  makerCostFils: number;
  makerNotes: string | null;
  sentToMakerDate: string | null;

  travelerId: string | null;
  travelerShipmentId: string | null;
  destination: string | null;

  orderDate: string;
  expectedReadyDate: string | null;
  readyDate: string | null;
  expectedDeliveryDate: string | null;
  arrivalDate: string | null;
  deliveredDate: string | null;

  qualityCheck: string | null;
  receivedBy: string | null;
  deliveryMethod: string | null;
  cancelReason: string | null;
  cancelNote: string | null;

  status: OrderStatus;
  coverMediaId: string | null;
  notes: string | null;
  tags: string[];

  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  deletedAt: string | null;
}

/** An order plus everything the list and card views need, computed server-side. */
export interface OrderView extends Order {
  customerName: string;
  customerPhone: string | null;
  customerWhatsapp: string | null;
  makerName: string | null;
  travelerName: string | null;
  urgency: Urgency;
  daysLate: number;
  daysRemaining: number | null;
  priority: number;
  isOverdue: boolean;
  progressPercent: number;
  balanceStatus: 'paid' | 'partial' | 'unpaid' | 'credit';
  weightDifferenceMg: number | null;
  weightVerdict: 'within' | 'slight' | 'outside' | null;
}

export interface Shipment {
  id: string;
  travelerId: string;
  destination: string;
  departureDate: string | null;
  expectedArrival: string | null;
  arrivedAt: string | null;
  flightNumber: string | null;
  airline: string | null;
  packageRef: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}
