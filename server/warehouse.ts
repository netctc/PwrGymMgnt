import type { Express, NextFunction, Request, Response } from "express";
import type { Pool, PoolConnection } from "mysql2/promise";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { normalizeAppRole, requirePermission } from "./rbac";

export type WarehouseSaleItemInput = {
  productId?: string;
  sku?: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
};

export type WarehouseSaleTotalsInput = WarehouseSaleItemInput & {
  costPrice?: number;
  resolvedUnitPrice?: number;
};

type PoolProvider = () => Pool | null;
type Db = Pool | PoolConnection;

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
};

const MAX_PAGE_SIZE = 500;
const DEFAULT_TAX_RATE = 0;
const DEFAULT_WAREHOUSE_LOCATION = "main";

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) {
    const error = new Error("Database not connected");
    (error as any).status = 503;
    throw error;
  }
  return pool;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLower(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function normalizeDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeProductImageUrl(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;
  if (/^data:image\/(png|jpeg|jpg);base64,/i.test(raw)) {
    const approxBytes = Math.ceil((raw.length * 3) / 4);
    if (approxBytes > 1_500_000) {
      const error = new Error("Product image must be smaller than 1.5 MB");
      (error as any).status = 400;
      throw error;
    }
    return raw;
  }
  if (raw.length > 2000) {
    const error = new Error("Product image URL is too long");
    (error as any).status = 400;
    throw error;
  }
  if (/^https?:\/\//i.test(raw) && /\.(png|jpe?g)(?:[?#].*)?$/i.test(raw)) return raw;
  const error = new Error("Product image must be a JPEG/PNG data URL or HTTPS image URL");
  (error as any).status = 400;
  throw error;
}

function normalizeLimit(value: unknown, fallback = 100) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, parsed));
}

function numberOrDefault(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value: unknown, field: string, allowZero = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    const error = new Error(`${field} must be ${allowZero ? "zero or greater" : "greater than zero"}`);
    (error as any).status = 400;
    throw error;
  }
  return parsed;
}

function toMysqlJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function parseJsonField(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function rowDateToYmd(value: unknown) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function rowDateToIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function escapeCsv(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function sendCsv(res: Response, filename: string, columns: string[], rows: Array<Record<string, unknown>>) {
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

function sendPdf(res: Response, filename: string, title: string, columns: string[], rows: Array<Record<string, unknown>>) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(15);
  doc.text(title, 40, 42);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
  autoTable(doc, {
    head: [columns],
    body: rows.map((row) => columns.map((column) => String(row[column] ?? ""))),
    startY: 76,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [43, 43, 43] },
  });
  const buffer = Buffer.from(doc.output("arraybuffer"));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

export function deriveStockStatus(product: {
  stockQuantity?: number;
  minStock?: number;
  maxStock?: number;
  status?: string;
}) {
  const status = normalizeLower(product.status || "active");
  if (status && status !== "active") return status;
  const stock = numberOrDefault(product.stockQuantity, 0);
  const min = numberOrDefault(product.minStock, 0);
  const max = numberOrDefault(product.maxStock, 0);
  if (stock <= 0) return "out_of_stock";
  if (min > 0 && stock <= min) return "low_stock";
  if (max > 0 && stock >= max) return "overstock";
  return "active";
}

export function calculateSaleTotals(items: WarehouseSaleTotalsInput[], options: { discountTotal?: number; taxRate?: number } = {}) {
  const subtotal = items.reduce((sum, item) => {
    const quantity = positiveNumber(item.quantity, "Quantity");
    const price = numberOrDefault(item.resolvedUnitPrice ?? item.unitPrice, 0);
    const discount = Math.max(0, numberOrDefault(item.discount, 0));
    return sum + Math.max(0, quantity * price - discount);
  }, 0);
  const itemDiscount = items.reduce((sum, item) => sum + Math.max(0, numberOrDefault(item.discount, 0)), 0);
  const orderDiscount = Math.max(0, numberOrDefault(options.discountTotal, 0));
  const discountTotal = Math.min(subtotal, orderDiscount);
  const taxableSubtotal = Math.max(0, subtotal - discountTotal);
  const taxRate = Math.max(0, numberOrDefault(options.taxRate, DEFAULT_TAX_RATE));
  const taxTotal = taxableSubtotal * taxRate;
  const total = taxableSubtotal + taxTotal;
  const cogs = items.reduce((sum, item) => sum + positiveNumber(item.quantity, "Quantity") * Math.max(0, numberOrDefault(item.costPrice, 0)), 0);
  return {
    subtotal: roundMoney(subtotal),
    itemDiscount: roundMoney(itemDiscount),
    discountTotal: roundMoney(itemDiscount + discountTotal),
    taxTotal: roundMoney(taxTotal),
    total: roundMoney(total),
    cogs: roundMoney(cogs),
  };
}

export function validateWarehouseMoney(value: unknown, field: string, allowZero = true) {
  return roundMoney(positiveNumber(value, field, allowZero));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapProduct(row: any) {
  const product = {
    id: row.id,
    sku: row.sku || "",
    barcode: row.barcode || "",
    name: row.name || "",
    description: row.description || "",
    category: row.category_name || row.category || "General",
    categoryId: row.category_id || "",
    categoryParentId: row.category_parent_id || "",
    categoryParentName: row.category_parent_name || "",
    supplierId: row.supplier_id || "",
    supplierName: row.supplier_name || "",
    costPrice: Number(row.cost_price || 0),
    retailPrice: Number(row.retail_price || 0),
    wholesalePrice: Number(row.wholesale_price || 0),
    memberPrice: Number(row.member_price || 0),
    stockQuantity: Number(row.stock_quantity || 0),
    minStock: Number(row.min_stock || 0),
    maxStock: Number(row.max_stock || 0),
    unit: row.unit || "pcs",
    status: row.status || "active",
    stockStatus: "active",
    expiryDate: rowDateToYmd(row.expiry_date),
    location: row.location || DEFAULT_WAREHOUSE_LOCATION,
    imageUrl: row.image_url || parseJsonField(row.data).imageUrl || "",
    data: parseJsonField(row.data),
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
  };
  product.stockStatus = deriveStockStatus(product);
  return product;
}


function mapCategory(row: any) {
  return {
    id: row.id,
    name: row.name || '',
    slug: row.slug || '',
    parentId: row.parent_id || '',
    parentName: row.parent_name || '',
    description: row.description || '',
    status: row.status || 'active',
    productCount: Number(row.product_count || 0),
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
  };
}

function slugifyCategory(value: unknown) {
  const raw = normalizeString(value) || 'General';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'general';
}

async function ensureCategoryByName(db: Db, nameValue: unknown, parentIdValue?: unknown) {
  const name = normalizeString(nameValue) || 'General';
  const parentId = normalizeString(parentIdValue);
  const [existing]: any = await db.query(
    "SELECT id FROM warehouse_categories WHERE LOWER(name) = LOWER(?) AND status <> 'archived' LIMIT 1",
    [name],
  );
  if (existing.length) return existing[0].id as string;
  const id = createId('cat');
  let slug = slugifyCategory(name);
  const [slugRows]: any = await db.query('SELECT id FROM warehouse_categories WHERE slug = ? LIMIT 1', [slug]);
  if (slugRows.length) slug = `${slug}-${id.slice(-6)}`;
  await db.query(
    `INSERT INTO warehouse_categories (id, name, slug, parent_id, description, status)
     VALUES (?, ?, ?, ?, '', 'active')`,
    [id, name, slug, parentId || null],
  );
  return id;
}

function mapSupplier(row: any) {
  return {
    id: row.id,
    name: row.name || "",
    contactName: row.contact_name || "",
    email: row.email || "",
    phone: row.phone || "",
    paymentTerms: row.payment_terms || "",
    deliverySchedule: row.delivery_schedule || "",
    contractNotes: row.contract_notes || "",
    status: row.status || "active",
    data: parseJsonField(row.data),
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
  };
}

function mapPurchaseOrder(row: any) {
  return {
    id: row.id,
    poNumber: row.po_number || "",
    supplierId: row.supplier_id || "",
    supplierName: row.supplier_name || "",
    status: row.status || "pending",
    orderDate: rowDateToYmd(row.order_date),
    expectedDate: rowDateToYmd(row.expected_date),
    receivedDate: rowDateToYmd(row.received_date),
    subtotal: Number(row.subtotal || 0),
    taxTotal: Number(row.tax_total || 0),
    shippingTotal: Number(row.shipping_total || 0),
    total: Number(row.total || 0),
    notes: row.notes || "",
    shippedAt: rowDateToIso(row.shipped_at),
    invoicedAt: rowDateToIso(row.invoiced_at),
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
  };
}

function mapSale(row: any) {
  return {
    id: row.id,
    receiptNumber: row.receipt_number || "",
    saleDate: rowDateToIso(row.sale_date),
    status: row.status || "paid",
    cashier: row.cashier || "",
    memberId: row.member_id || "",
    customerName: row.customer_name || "",
    paymentMethod: row.payment_method || "cash",
    subtotal: Number(row.subtotal || 0),
    discountTotal: Number(row.discount_total || 0),
    taxTotal: Number(row.tax_total || 0),
    total: Number(row.total || 0),
    cogsTotal: Number(row.cogs_total || 0),
    createdAt: rowDateToIso(row.created_at),
  };
}

async function ensureFinanceTable(db: Db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(32) NOT NULL,
      category VARCHAR(120) NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      transaction_date DATE NOT NULL,
      source VARCHAR(120) NULL,
      reference_type VARCHAR(64) NOT NULL DEFAULT 'manual',
      reference_id VARCHAR(64) NULL,
      description TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'posted',
      attachment_url TEXT NULL,
      created_by VARCHAR(255) NULL,
      approved_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_finance_tx_date (transaction_date),
      INDEX idx_finance_tx_type (type),
      INDEX idx_finance_tx_category (category),
      INDEX idx_finance_tx_status (status),
      UNIQUE KEY uq_finance_reference (reference_type, reference_id)
    )
  `);
}

async function postFinanceTransaction(db: Db, payload: {
  type: "income" | "expense";
  category: string;
  amount: number;
  date?: string;
  source: string;
  referenceType: string;
  referenceId: string;
  description: string;
  createdBy?: string;
  data?: Record<string, unknown>;
}) {
  await ensureFinanceTable(db);
  const id = createId("ftx");
  const amount = validateWarehouseMoney(payload.amount, "Finance amount", false);
  const date = normalizeDate(payload.date) || new Date().toISOString().slice(0, 10);
  await db.query(
    `INSERT INTO finance_transactions
      (id, type, category, amount, transaction_date, source, reference_type, reference_id, description, status, created_by, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)
     ON DUPLICATE KEY UPDATE
       type = VALUES(type),
       category = VALUES(category),
       amount = VALUES(amount),
       transaction_date = VALUES(transaction_date),
       source = VALUES(source),
       description = VALUES(description),
       status = 'posted',
       data = VALUES(data)`,
    [
      id,
      payload.type,
      payload.category,
      amount,
      date,
      payload.source,
      payload.referenceType,
      payload.referenceId,
      payload.description,
      payload.createdBy || "system",
      toMysqlJson(payload.data || {}),
    ],
  );
}

async function ensureWarehouseTablesNow(db: Db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_categories (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      slug VARCHAR(180) NOT NULL,
      parent_id VARCHAR(64) NULL,
      description TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      UNIQUE KEY uq_wh_category_slug (slug),
      INDEX idx_wh_category_parent (parent_id),
      INDEX idx_wh_category_status (status),
      INDEX idx_wh_category_name (name)
    )
  `);

  await db.query(`
    INSERT IGNORE INTO warehouse_categories (id, name, slug, parent_id, description, status)
    VALUES
      ('cat_general', 'General', 'general', NULL, 'Default product category', 'active'),
      ('cat_apparel', 'Apparel', 'apparel', NULL, 'Clothing and branded merchandise', 'active'),
      ('cat_equipment', 'Equipment', 'equipment', NULL, 'Fitness equipment, accessories and replacement parts', 'active'),
      ('cat_supplements', 'Supplements', 'supplements', NULL, 'Nutrition, protein and recovery products', 'active')
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_suppliers (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      contact_name VARCHAR(180) NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(80) NULL,
      payment_terms VARCHAR(180) NULL,
      delivery_schedule VARCHAR(180) NULL,
      contract_notes TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_wh_supplier_status (status),
      INDEX idx_wh_supplier_name (name)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_products (
      id VARCHAR(64) PRIMARY KEY,
      sku VARCHAR(80) NOT NULL,
      barcode VARCHAR(120) NULL,
      name VARCHAR(180) NOT NULL,
      description TEXT NULL,
      category VARCHAR(120) NOT NULL DEFAULT 'General',
      category_id VARCHAR(64) NULL,
      supplier_id VARCHAR(64) NULL,
      cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      retail_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      wholesale_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      member_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      stock_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
      min_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
      max_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
      unit VARCHAR(32) NOT NULL DEFAULT 'pcs',
      location VARCHAR(120) NOT NULL DEFAULT 'main',
      expiry_date DATE NULL,
      image_url TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      UNIQUE KEY uq_wh_products_sku (sku),
      UNIQUE KEY uq_wh_products_barcode (barcode),
      INDEX idx_wh_products_category (category),
      INDEX idx_wh_products_category_id (category_id),
      INDEX idx_wh_products_supplier (supplier_id),
      INDEX idx_wh_products_status (status),
      INDEX idx_wh_products_expiry (expiry_date)
    )
  `);


  await db.query("ALTER TABLE warehouse_products ADD COLUMN category_id VARCHAR(64) NULL").catch(() => undefined);
  await db.query("ALTER TABLE warehouse_products ADD COLUMN image_url TEXT NULL").catch(() => undefined);
  await db.query("CREATE INDEX idx_wh_products_category_id ON warehouse_products (category_id)").catch(() => undefined);
  await db.query("UPDATE warehouse_products p LEFT JOIN warehouse_categories c ON LOWER(c.name) = LOWER(p.category) AND c.status <> 'archived' SET p.category_id = c.id WHERE p.category_id IS NULL AND c.id IS NOT NULL").catch(() => undefined);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_product_batches (
      id VARCHAR(64) PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL,
      batch_number VARCHAR(120) NULL,
      lot_number VARCHAR(120) NULL,
      serial_number VARCHAR(180) NULL,
      expiry_date DATE NULL,
      quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
      cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_wh_batches_product (product_id),
      INDEX idx_wh_batches_expiry (expiry_date),
      INDEX idx_wh_batches_serial (serial_number)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_stock_movements (
      id VARCHAR(64) PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL,
      movement_type VARCHAR(40) NOT NULL,
      quantity_delta DECIMAL(12,3) NOT NULL,
      unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      stock_before DECIMAL(12,3) NOT NULL DEFAULT 0,
      stock_after DECIMAL(12,3) NOT NULL DEFAULT 0,
      reference_type VARCHAR(80) NULL,
      reference_id VARCHAR(64) NULL,
      reason TEXT NULL,
      performed_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_wh_movements_product (product_id),
      INDEX idx_wh_movements_created (created_at),
      INDEX idx_wh_movements_ref (reference_type, reference_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_purchase_orders (
      id VARCHAR(64) PRIMARY KEY,
      po_number VARCHAR(80) NOT NULL,
      supplier_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      order_date DATE NOT NULL,
      expected_date DATE NULL,
      received_date DATE NULL,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      shipping_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      notes TEXT NULL,
      shipped_at DATETIME NULL,
      received_at DATETIME NULL,
      invoiced_at DATETIME NULL,
      created_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      UNIQUE KEY uq_wh_po_number (po_number),
      INDEX idx_wh_po_supplier (supplier_id),
      INDEX idx_wh_po_status (status),
      INDEX idx_wh_po_dates (order_date, expected_date)
    )
  `);

  await db.query("ALTER TABLE warehouse_purchase_orders ADD COLUMN shipped_at DATETIME NULL").catch(() => undefined);
  await db.query("ALTER TABLE warehouse_purchase_orders ADD COLUMN received_at DATETIME NULL").catch(() => undefined);
  await db.query("ALTER TABLE warehouse_purchase_orders ADD COLUMN invoiced_at DATETIME NULL").catch(() => undefined);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_purchase_order_status_history (
      id VARCHAR(64) PRIMARY KEY,
      purchase_order_id VARCHAR(64) NOT NULL,
      from_status VARCHAR(32) NULL,
      to_status VARCHAR(32) NOT NULL,
      changed_by VARCHAR(255) NULL,
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      notes TEXT NULL,
      data JSON NULL,
      INDEX idx_wh_po_history_po (purchase_order_id),
      INDEX idx_wh_po_history_status (to_status)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_purchase_order_items (
      id VARCHAR(64) PRIMARY KEY,
      purchase_order_id VARCHAR(64) NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      sku VARCHAR(80) NULL,
      description VARCHAR(255) NULL,
      quantity_ordered DECIMAL(12,3) NOT NULL DEFAULT 0,
      quantity_received DECIMAL(12,3) NOT NULL DEFAULT 0,
      unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_wh_po_items_po (purchase_order_id),
      INDEX idx_wh_po_items_product (product_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_pos_sales (
      id VARCHAR(64) PRIMARY KEY,
      receipt_number VARCHAR(80) NOT NULL,
      sale_date DATETIME NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'paid',
      cashier VARCHAR(255) NULL,
      member_id VARCHAR(64) NULL,
      customer_name VARCHAR(180) NULL,
      payment_method VARCHAR(40) NOT NULL DEFAULT 'cash',
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      cogs_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data JSON NULL,
      UNIQUE KEY uq_wh_sale_receipt (receipt_number),
      INDEX idx_wh_sales_date (sale_date),
      INDEX idx_wh_sales_status (status),
      INDEX idx_wh_sales_payment (payment_method)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_pos_sale_items (
      id VARCHAR(64) PRIMARY KEY,
      sale_id VARCHAR(64) NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      sku VARCHAR(80) NULL,
      description VARCHAR(255) NULL,
      quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
      unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      discount DECIMAL(12,2) NOT NULL DEFAULT 0,
      line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_wh_sale_items_sale (sale_id),
      INDEX idx_wh_sale_items_product (product_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warehouse_pricing_rules (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      product_id VARCHAR(64) NULL,
      category VARCHAR(120) NULL,
      price_tier VARCHAR(40) NOT NULL DEFAULT 'retail',
      discount_type VARCHAR(40) NOT NULL DEFAULT 'percentage',
      discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
      starts_at DATE NULL,
      ends_at DATE NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_wh_pricing_status_dates (status, starts_at, ends_at),
      INDEX idx_wh_pricing_product (product_id),
      INDEX idx_wh_pricing_category (category)
    )
  `);
}

async function auditWarehouse(db: Db, action: string, details: Record<string, unknown>, performedBy = "system") {
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(255) NOT NULL,
      details TEXT,
      performed_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query("INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)", [
    action,
    JSON.stringify(details),
    performedBy,
  ]).catch(() => undefined);
}

async function getProductForUpdate(db: Db, identifier: { id?: string; sku?: string; barcode?: string }) {
  const id = normalizeString(identifier.id);
  const sku = normalizeString(identifier.sku);
  const barcode = normalizeString(identifier.barcode);
  if (!id && !sku && !barcode) {
    const error = new Error("Product id, sku or barcode is required");
    (error as any).status = 400;
    throw error;
  }
  const where: string[] = [];
  const params: unknown[] = [];
  if (id) {
    where.push("id = ?");
    params.push(id);
  }
  if (sku) {
    where.push("sku = ?");
    params.push(sku);
  }
  if (barcode) {
    where.push("barcode = ?");
    params.push(barcode);
  }
  const [rows]: any = await db.query(`SELECT * FROM warehouse_products WHERE ${where.join(" OR ")} LIMIT 1 FOR UPDATE`, params);
  if (!rows.length) {
    const error = new Error("Product not found");
    (error as any).status = 404;
    throw error;
  }
  return rows[0];
}

async function insertStockMovement(db: Db, payload: {
  productId: string;
  movementType: string;
  quantityDelta: number;
  unitCost?: number;
  stockBefore: number;
  stockAfter: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  performedBy?: string;
  data?: Record<string, unknown>;
}) {
  await db.query(
    `INSERT INTO warehouse_stock_movements
      (id, product_id, movement_type, quantity_delta, unit_cost, stock_before, stock_after, reference_type, reference_id, reason, performed_by, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createId("wsm"),
      payload.productId,
      payload.movementType,
      payload.quantityDelta,
      numberOrDefault(payload.unitCost, 0),
      payload.stockBefore,
      payload.stockAfter,
      normalizeString(payload.referenceType),
      normalizeString(payload.referenceId),
      normalizeString(payload.reason),
      payload.performedBy || "system",
      toMysqlJson(payload.data || {}),
    ],
  );
}

async function recordPurchaseOrderStatus(db: Db, payload: { purchaseOrderId: string; fromStatus?: string; toStatus: string; changedBy?: string; notes?: string; data?: Record<string, unknown> }) {
  await db.query(
    `INSERT INTO warehouse_purchase_order_status_history (id, purchase_order_id, from_status, to_status, changed_by, notes, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [createId("poh"), payload.purchaseOrderId, payload.fromStatus || null, payload.toStatus, payload.changedBy || "system", payload.notes || "", toMysqlJson(payload.data || {})],
  );
}

function nextPurchaseOrderStatuses(status: string) {
  const current = normalizeLower(status) || "pending";
  if (current === "pending") return ["shipped"];
  if (current === "shipped") return ["received"];
  if (current === "received") return ["invoiced"];
  return [];
}

async function postPurchaseOrderExpense(db: Db, po: any, createdBy?: string) {
  await postFinanceTransaction(db, {
    type: "expense",
    category: "Inventory Purchase",
    amount: Number(po.total || 0),
    source: "warehouse_purchasing",
    referenceType: "warehouse_purchase_order",
    referenceId: po.id,
    description: `Inventory purchase order ${po.po_number}`,
    createdBy,
    data: { purchaseOrderId: po.id, supplierId: po.supplier_id, accountingStage: "invoiced" },
  });
}

let warehouseSchemaReady: Promise<void> | null = null;

async function ensureWarehouseTables(db: Db) {
  if (!warehouseSchemaReady) {
    warehouseSchemaReady = ensureWarehouseTablesNow(db).catch((error) => {
      warehouseSchemaReady = null;
      throw error;
    });
  }
  await warehouseSchemaReady;
}

export function registerWarehouseRoutes(app: Express, poolProvider: PoolProvider) {
  app.use("/api/warehouse", requirePermission("warehouse.read"));

  app.get("/api/warehouse/categories", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const includeArchived = normalizeLower(req.query.includeArchived) === "true";
      const where = includeArchived ? "" : "WHERE c.status <> 'archived'";
      const [rows]: any = await pool.query(
        `SELECT c.*, p.name AS parent_name, COUNT(pr.id) AS product_count
         FROM warehouse_categories c
         LEFT JOIN warehouse_categories p ON p.id = c.parent_id
         LEFT JOIN warehouse_products pr ON pr.category_id = c.id AND pr.status <> 'archived'
         ${where}
         GROUP BY c.id, p.name
         ORDER BY COALESCE(p.name, c.name), c.parent_id IS NOT NULL, c.name`,
      );
      res.json({ categories: rows.map(mapCategory) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/warehouse/categories", requirePermission("warehouse.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const name = normalizeString(req.body.name);
      if (!name) return res.status(400).json({ error: "Category name is required" });
      const id = normalizeString(req.body.id) || createId("cat");
      let slug = slugifyCategory(req.body.slug || name);
      const [slugRows]: any = await pool.query("SELECT id FROM warehouse_categories WHERE slug = ? AND id <> ? LIMIT 1", [slug, id]);
      if (slugRows.length) slug = `${slug}-${id.slice(-6)}`;
      const parentId = normalizeString(req.body.parentId) || null;
      const [nameRows]: any = await pool.query(
        "SELECT id FROM warehouse_categories WHERE LOWER(name) = LOWER(?) AND COALESCE(parent_id, '') = COALESCE(?, '') AND status <> 'archived' AND id <> ? LIMIT 1",
        [name, parentId || '', id],
      );
      if (nameRows.length) return res.status(409).json({ error: "Category already exists in this parent" });
      await pool.query(
        `INSERT INTO warehouse_categories (id, name, slug, parent_id, description, status, data)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), parent_id = VALUES(parent_id), description = VALUES(description), status = VALUES(status), data = VALUES(data)`,
        [id, name, slug, parentId, normalizeString(req.body.description), normalizeString(req.body.status) || "active", toMysqlJson(req.body.data || {})],
      );
      const [rows]: any = await pool.query(
        `SELECT c.*, p.name AS parent_name, COUNT(pr.id) AS product_count
         FROM warehouse_categories c
         LEFT JOIN warehouse_categories p ON p.id = c.parent_id
         LEFT JOIN warehouse_products pr ON pr.category_id = c.id AND pr.status <> 'archived'
         WHERE c.id = ?
         GROUP BY c.id, p.name`,
        [id],
      );
      await auditWarehouse(pool, "WAREHOUSE_CATEGORY_SAVED", { categoryId: id, name }, req.user?.email);
      res.status(201).json({ category: mapCategory(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/warehouse/categories/:id", requirePermission("warehouse.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const id = req.params.id;
      const name = normalizeString(req.body.name);
      if (!name) return res.status(400).json({ error: "Category name is required" });
      if (normalizeString(req.body.parentId) === id) return res.status(400).json({ error: "A category cannot be its own parent" });
      const parentId = normalizeString(req.body.parentId) || null;
      const [nameRows]: any = await pool.query(
        "SELECT id FROM warehouse_categories WHERE LOWER(name) = LOWER(?) AND COALESCE(parent_id, '') = COALESCE(?, '') AND status <> 'archived' AND id <> ? LIMIT 1",
        [name, parentId || '', id],
      );
      if (nameRows.length) return res.status(409).json({ error: "Category already exists in this parent" });
      await pool.query(
        `UPDATE warehouse_categories SET name = ?, parent_id = ?, description = ?, status = ? WHERE id = ?`,
        [name, parentId, normalizeString(req.body.description), normalizeString(req.body.status) || "active", id],
      );
      await pool.query("UPDATE warehouse_products SET category = ? WHERE category_id = ?", [name, id]);
      const [rows]: any = await pool.query(
        `SELECT c.*, p.name AS parent_name, COUNT(pr.id) AS product_count
         FROM warehouse_categories c
         LEFT JOIN warehouse_categories p ON p.id = c.parent_id
         LEFT JOIN warehouse_products pr ON pr.category_id = c.id AND pr.status <> 'archived'
         WHERE c.id = ?
         GROUP BY c.id, p.name`,
        [id],
      );
      if (!rows.length) return res.status(404).json({ error: "Category not found" });
      await auditWarehouse(pool, "WAREHOUSE_CATEGORY_UPDATED", { categoryId: id, name }, req.user?.email);
      res.json({ category: mapCategory(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/warehouse/categories/:id", requirePermission("warehouse.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const id = req.params.id;
      const [children]: any = await pool.query("SELECT COUNT(*) AS count FROM warehouse_categories WHERE parent_id = ? AND status <> 'archived'", [id]);
      if (Number(children[0]?.count || 0) > 0) return res.status(409).json({ error: "Category has active subcategories" });
      const [products]: any = await pool.query("SELECT COUNT(*) AS count FROM warehouse_products WHERE category_id = ? AND status <> 'archived'", [id]);
      if (Number(products[0]?.count || 0) > 0) return res.status(409).json({ error: "Category is used by active products" });
      await pool.query("UPDATE warehouse_categories SET status = 'archived' WHERE id = ?", [id]);
      await auditWarehouse(pool, "WAREHOUSE_CATEGORY_ARCHIVED", { categoryId: id }, req.user?.email);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/warehouse/summary", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const today = new Date().toISOString().slice(0, 10);

      const [productRows]: any = await pool.query(`
        SELECT
          COUNT(*) AS product_count,
          COALESCE(SUM(stock_quantity), 0) AS total_stock,
          COALESCE(SUM(stock_quantity * cost_price), 0) AS stock_value,
          COALESCE(SUM(stock_quantity * retail_price), 0) AS retail_value,
          COALESCE(SUM(CASE WHEN stock_quantity <= min_stock THEN 1 ELSE 0 END), 0) AS low_stock_count,
          COALESCE(SUM(CASE WHEN max_stock > 0 AND stock_quantity >= max_stock THEN 1 ELSE 0 END), 0) AS overstock_count,
          COALESCE(SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 45 DAY) THEN 1 ELSE 0 END), 0) AS expiring_count
        FROM warehouse_products
        WHERE status <> 'archived'
      `);

      const [salesRows]: any = await pool.query(
        `SELECT COALESCE(SUM(total), 0) AS sales_total, COUNT(*) AS sales_count
         FROM warehouse_pos_sales
         WHERE DATE(sale_date) = ? AND status IN ('paid', 'posted')`,
        [today],
      );

      const [poRows]: any = await pool.query(
        `SELECT COUNT(*) AS open_po_count, COALESCE(SUM(total), 0) AS open_po_total
         FROM warehouse_purchase_orders
         WHERE status IN ('pending','shipped','invoiced')`,
      );

      const product = productRows[0] || {};
      const sales = salesRows[0] || {};
      const po = poRows[0] || {};
      res.json({
        summary: {
          productCount: Number(product.product_count || 0),
          totalStock: Number(product.total_stock || 0),
          stockValue: Number(product.stock_value || 0),
          retailValue: Number(product.retail_value || 0),
          lowStockCount: Number(product.low_stock_count || 0),
          overstockCount: Number(product.overstock_count || 0),
          expiringCount: Number(product.expiring_count || 0),
          todaySalesTotal: Number(sales.sales_total || 0),
          todaySalesCount: Number(sales.sales_count || 0),
          openPurchaseOrders: Number(po.open_po_count || 0),
          openPurchaseOrderValue: Number(po.open_po_total || 0),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/warehouse/products", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const where: string[] = ["p.status <> 'archived'"];
      const params: unknown[] = [];
      const q = normalizeString(req.query.q);
      const category = normalizeString(req.query.category);
      const supplierId = normalizeString(req.query.supplierId);
      const status = normalizeString(req.query.status);
      const stockStatus = normalizeString(req.query.stockStatus);
      if (q) {
        where.push("(p.sku LIKE ? OR p.barcode LIKE ? OR p.name LIKE ? OR p.description LIKE ?)");
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }
      if (category && category !== "all") {
        where.push("(p.category_id = ? OR p.category = ? OR c.name = ?)");
        params.push(category, category, category);
      }
      if (supplierId && supplierId !== "all") {
        where.push("p.supplier_id = ?");
        params.push(supplierId);
      }
      if (status && status !== "all") {
        where.push("p.status = ?");
        params.push(status);
      }
      if (stockStatus === "low_stock") where.push("p.stock_quantity <= p.min_stock");
      if (stockStatus === "out_of_stock") where.push("p.stock_quantity <= 0");
      if (stockStatus === "overstock") where.push("p.max_stock > 0 AND p.stock_quantity >= p.max_stock");
      if (stockStatus === "expiring") where.push("p.expiry_date IS NOT NULL AND p.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 45 DAY)");

      const [rows]: any = await pool.query(
        `SELECT p.*, COALESCE(c.name, p.category) AS category_name, c.parent_id AS category_parent_id, cp.name AS category_parent_name, s.name AS supplier_name
         FROM warehouse_products p
         LEFT JOIN warehouse_categories c ON c.id = p.category_id
         LEFT JOIN warehouse_categories cp ON cp.id = c.parent_id
         LEFT JOIN warehouse_suppliers s ON s.id = p.supplier_id
         WHERE ${where.join(" AND ")}
         ORDER BY p.updated_at DESC, p.name ASC
         LIMIT ?`,
        [...params, normalizeLimit(req.query.limit)],
      );
      res.json({ products: rows.map(mapProduct) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/warehouse/products", requirePermission("warehouse.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const sku = normalizeString(req.body.sku).toUpperCase();
      const name = normalizeString(req.body.name);
      if (!sku || !name) return res.status(400).json({ error: "SKU and product name are required" });
      const id = normalizeString(req.body.id) || createId("prd");
      const categoryName = normalizeString(req.body.category) || "General";
      const categoryId = normalizeString(req.body.categoryId) || await ensureCategoryByName(pool, categoryName);
      await pool.query(
        `INSERT INTO warehouse_products
          (id, sku, barcode, name, description, category, category_id, supplier_id, cost_price, retail_price, wholesale_price, member_price, stock_quantity, min_stock, max_stock, unit, location, expiry_date, image_url, status, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          sku,
          normalizeString(req.body.barcode) || null,
          name,
          normalizeString(req.body.description),
          categoryName,
          categoryId,
          normalizeString(req.body.supplierId) || null,
          validateWarehouseMoney(req.body.costPrice, "Cost price"),
          validateWarehouseMoney(req.body.retailPrice, "Retail price"),
          validateWarehouseMoney(req.body.wholesalePrice, "Wholesale price"),
          validateWarehouseMoney(req.body.memberPrice, "Member price"),
          numberOrDefault(req.body.stockQuantity, 0),
          numberOrDefault(req.body.minStock, 0),
          numberOrDefault(req.body.maxStock, 0),
          normalizeString(req.body.unit) || "pcs",
          normalizeString(req.body.location) || DEFAULT_WAREHOUSE_LOCATION,
          normalizeDate(req.body.expiryDate),
          normalizeProductImageUrl(req.body.imageUrl),
          normalizeString(req.body.status) || "active",
          toMysqlJson(req.body.data || {}),
        ],
      );
      const [rows]: any = await pool.query("SELECT p.*, COALESCE(c.name, p.category) AS category_name, c.parent_id AS category_parent_id, cp.name AS category_parent_name, s.name AS supplier_name FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id = p.category_id LEFT JOIN warehouse_categories cp ON cp.id = c.parent_id LEFT JOIN warehouse_suppliers s ON s.id = p.supplier_id WHERE p.id = ?", [id]);
      await auditWarehouse(pool, "WAREHOUSE_PRODUCT_CREATED", { productId: id, sku }, req.user?.email);
      res.status(201).json({ product: mapProduct(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/warehouse/products/:id", requirePermission("warehouse.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const id = req.params.id;
      const categoryName = normalizeString(req.body.category) || "General";
      const categoryId = normalizeString(req.body.categoryId) || await ensureCategoryByName(pool, categoryName);
      await pool.query(
        `UPDATE warehouse_products
         SET sku = ?, barcode = ?, name = ?, description = ?, category = ?, category_id = ?, supplier_id = ?, cost_price = ?, retail_price = ?, wholesale_price = ?, member_price = ?, stock_quantity = ?, min_stock = ?, max_stock = ?, unit = ?, location = ?, expiry_date = ?, image_url = ?, status = ?, data = ?
         WHERE id = ?`,
        [
          normalizeString(req.body.sku).toUpperCase(),
          normalizeString(req.body.barcode) || null,
          normalizeString(req.body.name),
          normalizeString(req.body.description),
          categoryName,
          categoryId,
          normalizeString(req.body.supplierId) || null,
          validateWarehouseMoney(req.body.costPrice, "Cost price"),
          validateWarehouseMoney(req.body.retailPrice, "Retail price"),
          validateWarehouseMoney(req.body.wholesalePrice, "Wholesale price"),
          validateWarehouseMoney(req.body.memberPrice, "Member price"),
          numberOrDefault(req.body.stockQuantity, 0),
          numberOrDefault(req.body.minStock, 0),
          numberOrDefault(req.body.maxStock, 0),
          normalizeString(req.body.unit) || "pcs",
          normalizeString(req.body.location) || DEFAULT_WAREHOUSE_LOCATION,
          normalizeDate(req.body.expiryDate),
          normalizeProductImageUrl(req.body.imageUrl),
          normalizeString(req.body.status) || "active",
          toMysqlJson(req.body.data || {}),
          id,
        ],
      );
      const [rows]: any = await pool.query("SELECT p.*, COALESCE(c.name, p.category) AS category_name, c.parent_id AS category_parent_id, cp.name AS category_parent_name, s.name AS supplier_name FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id = p.category_id LEFT JOIN warehouse_categories cp ON cp.id = c.parent_id LEFT JOIN warehouse_suppliers s ON s.id = p.supplier_id WHERE p.id = ?", [id]);
      if (!rows.length) return res.status(404).json({ error: "Product not found" });
      await auditWarehouse(pool, "WAREHOUSE_PRODUCT_UPDATED", { productId: id }, req.user?.email);
      res.json({ product: mapProduct(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/warehouse/products/:id/detail", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const id = req.params.id;
      const [productRows]: any = await pool.query(
        `SELECT p.*, COALESCE(c.name, p.category) AS category_name, c.parent_id AS category_parent_id, cp.name AS category_parent_name, s.name AS supplier_name
         FROM warehouse_products p
         LEFT JOIN warehouse_categories c ON c.id = p.category_id
         LEFT JOIN warehouse_categories cp ON cp.id = c.parent_id
         LEFT JOIN warehouse_suppliers s ON s.id = p.supplier_id
         WHERE p.id = ? AND p.status <> 'archived'
         LIMIT 1`,
        [id],
      );
      if (!productRows.length) return res.status(404).json({ error: "Product not found" });
      const [movementRows]: any = await pool.query(
        `SELECT movement_type, quantity_delta, unit_cost, stock_before, stock_after, reference_type, reference_id, reason, performed_by, created_at
         FROM warehouse_stock_movements
         WHERE product_id = ?
         ORDER BY created_at DESC LIMIT 50`,
        [id],
      );
      const [purchaseRows]: any = await pool.query(
        `SELECT po.id, po.po_number, po.status, po.order_date, po.expected_date, po.received_date, s.name AS supplier_name,
                i.quantity_ordered, i.quantity_received, i.unit_cost, i.line_total
         FROM warehouse_purchase_order_items i
         JOIN warehouse_purchase_orders po ON po.id = i.purchase_order_id
         LEFT JOIN warehouse_suppliers s ON s.id = po.supplier_id
         WHERE i.product_id = ?
         ORDER BY po.order_date DESC LIMIT 30`,
        [id],
      );
      const [saleRows]: any = await pool.query(
        `SELECT sale.id, sale.receipt_number, sale.sale_date, sale.payment_method, sale.total, sale.cogs_total,
                item.quantity, item.unit_price, item.discount, item.line_total
         FROM warehouse_pos_sale_items item
         JOIN warehouse_pos_sales sale ON sale.id = item.sale_id
         WHERE item.product_id = ?
         ORDER BY sale.sale_date DESC LIMIT 30`,
        [id],
      );
      await ensureFinanceTable(pool);
      const [financeRows]: any = await pool.query(
        `SELECT id, type, category, amount, transaction_date, source, reference_type, reference_id, description, status
         FROM finance_transactions
         WHERE (reference_type = 'warehouse_purchase_order' AND reference_id IN (SELECT purchase_order_id FROM warehouse_purchase_order_items WHERE product_id = ?))
            OR (reference_type IN ('warehouse_pos_sale','warehouse_pos_sale_cogs') AND reference_id IN (SELECT sale_id FROM warehouse_pos_sale_items WHERE product_id = ?))
            OR (reference_type = 'warehouse_stock_adjustment' AND reference_id IN (SELECT reference_id FROM warehouse_stock_movements WHERE product_id = ? AND reference_type = 'stock_adjustment'))
         ORDER BY transaction_date DESC, id DESC LIMIT 50`,
        [id, id, id],
      );
      res.json({
        product: mapProduct(productRows[0]),
        movements: movementRows.map((row: any) => ({ ...row, created_at: rowDateToIso(row.created_at) })),
        purchases: purchaseRows.map((row: any) => ({ ...row, order_date: rowDateToYmd(row.order_date), expected_date: rowDateToYmd(row.expected_date), received_date: rowDateToYmd(row.received_date) })),
        sales: saleRows.map((row: any) => ({ ...row, sale_date: rowDateToIso(row.sale_date) })),
        accountingEntries: financeRows.map((row: any) => ({ ...row, transaction_date: rowDateToYmd(row.transaction_date) })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/warehouse/products/:id.pdf", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const id = req.params.id;
      const [rows]: any = await pool.query(
        `SELECT p.sku AS SKU, p.name AS Product, COALESCE(c.name, p.category) AS Category, s.name AS Supplier,
                p.stock_quantity AS Stock, p.min_stock AS Min, p.max_stock AS Max, p.cost_price AS Cost,
                p.retail_price AS Retail, p.member_price AS Member, p.status AS Status, p.expiry_date AS Expiry
         FROM warehouse_products p
         LEFT JOIN warehouse_categories c ON c.id = p.category_id
         LEFT JOIN warehouse_suppliers s ON s.id = p.supplier_id
         WHERE p.id = ? AND p.status <> 'archived'`,
        [id],
      );
      if (!rows.length) return res.status(404).json({ error: "Product not found" });
      const row = rows[0];
      return sendPdf(res, `warehouse-product-${row.SKU}.pdf`, `Product Detail - ${row.Product}`, Object.keys(row), [{ ...row, Expiry: rowDateToYmd(row.Expiry) }]);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/warehouse/products/:id", requirePermission("warehouse.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const role = normalizeAppRole(req.user?.role);
      if (!["super_admin", "admin", "manager", "warehouse_manager"].includes(role)) {
        return res.status(403).json({ error: "Only managers or administrators can delete products" });
      }
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const [rows]: any = await pool.query("SELECT id, sku, name FROM warehouse_products WHERE id = ? AND status <> 'archived' LIMIT 1", [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Product not found" });
      await pool.query("UPDATE warehouse_products SET status = 'archived' WHERE id = ?", [req.params.id]);
      await auditWarehouse(pool, "WAREHOUSE_PRODUCT_ARCHIVED", { productId: req.params.id, sku: rows[0].sku }, req.user?.email);
      res.json({ ok: true, productId: req.params.id });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/warehouse/suppliers", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const q = normalizeString(req.query.q);
      const params: unknown[] = [];
      let clause = "WHERE status <> 'archived'";
      if (q) {
        clause += " AND (name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR phone LIKE ?)";
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }
      const [rows]: any = await pool.query(`SELECT * FROM warehouse_suppliers ${clause} ORDER BY name ASC LIMIT ?`, [...params, normalizeLimit(req.query.limit, 200)]);
      res.json({ suppliers: rows.map(mapSupplier) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/warehouse/suppliers", requirePermission("warehouse.purchase"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const name = normalizeString(req.body.name);
      if (!name) return res.status(400).json({ error: "Supplier name is required" });
      const id = normalizeString(req.body.id) || createId("sup");
      await pool.query(
        `INSERT INTO warehouse_suppliers
          (id, name, contact_name, email, phone, payment_terms, delivery_schedule, contract_notes, status, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          normalizeString(req.body.contactName),
          normalizeString(req.body.email),
          normalizeString(req.body.phone),
          normalizeString(req.body.paymentTerms),
          normalizeString(req.body.deliverySchedule),
          normalizeString(req.body.contractNotes),
          normalizeString(req.body.status) || "active",
          toMysqlJson(req.body.data || {}),
        ],
      );
      const [rows]: any = await pool.query("SELECT * FROM warehouse_suppliers WHERE id = ?", [id]);
      await auditWarehouse(pool, "WAREHOUSE_SUPPLIER_CREATED", { supplierId: id }, req.user?.email);
      res.status(201).json({ supplier: mapSupplier(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/warehouse/suppliers/:id", requirePermission("warehouse.purchase"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      await pool.query(
        `UPDATE warehouse_suppliers
         SET name = ?, contact_name = ?, email = ?, phone = ?, payment_terms = ?, delivery_schedule = ?, contract_notes = ?, status = ?, data = ?
         WHERE id = ?`,
        [
          normalizeString(req.body.name),
          normalizeString(req.body.contactName),
          normalizeString(req.body.email),
          normalizeString(req.body.phone),
          normalizeString(req.body.paymentTerms),
          normalizeString(req.body.deliverySchedule),
          normalizeString(req.body.contractNotes),
          normalizeString(req.body.status) || "active",
          toMysqlJson(req.body.data || {}),
          req.params.id,
        ],
      );
      const [rows]: any = await pool.query("SELECT * FROM warehouse_suppliers WHERE id = ?", [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Supplier not found" });
      await auditWarehouse(pool, "WAREHOUSE_SUPPLIER_UPDATED", { supplierId: req.params.id }, req.user?.email);
      res.json({ supplier: mapSupplier(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/warehouse/stock-adjustments", requirePermission("warehouse.write"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(poolProvider);
    const connection = await pool.getConnection();
    try {
      await ensureWarehouseTables(connection);
      await connection.beginTransaction();
      const product = await getProductForUpdate(connection, { id: normalizeString(req.body.productId), sku: normalizeString(req.body.sku), barcode: normalizeString(req.body.barcode) });
      const quantityDelta = numberOrDefault(req.body.quantityDelta, Number.NaN);
      if (!Number.isFinite(quantityDelta) || quantityDelta === 0) return res.status(400).json({ error: "Quantity delta is required" });
      const stockBefore = Number(product.stock_quantity || 0);
      const stockAfter = stockBefore + quantityDelta;
      if (stockAfter < 0) {
        const error = new Error("Adjustment would make stock negative");
        (error as any).status = 400;
        throw error;
      }
      const unitCost = numberOrDefault(req.body.unitCost, product.cost_price || 0);
      await connection.query("UPDATE warehouse_products SET stock_quantity = ? WHERE id = ?", [stockAfter, product.id]);
      await insertStockMovement(connection, {
        productId: product.id,
        movementType: "adjustment",
        quantityDelta,
        unitCost,
        stockBefore,
        stockAfter,
        referenceType: "warehouse_adjustment",
        referenceId: createId("adj"),
        reason: normalizeString(req.body.reason) || "Manual stock adjustment",
        performedBy: req.user?.email,
      });
      const valueImpact = roundMoney(Math.abs(quantityDelta) * unitCost);
      if (valueImpact > 0) {
        await postFinanceTransaction(connection, {
          type: quantityDelta < 0 ? "expense" : "income",
          category: "Inventory Adjustment",
          amount: valueImpact,
          source: "warehouse_inventory",
          referenceType: "warehouse_stock_adjustment",
          referenceId: `${product.id}_${Date.now()}`,
          description: `${quantityDelta < 0 ? "Shrinkage" : "Positive"} inventory adjustment for ${product.sku}`,
          createdBy: req.user?.email,
          data: { productId: product.id, sku: product.sku, quantityDelta },
        });
      }
      await auditWarehouse(connection, "WAREHOUSE_STOCK_ADJUSTED", { productId: product.id, quantityDelta, stockAfter }, req.user?.email);
      await connection.commit();
      const [rows]: any = await pool.query("SELECT p.*, COALESCE(c.name, p.category) AS category_name, c.parent_id AS category_parent_id, cp.name AS category_parent_name, s.name AS supplier_name FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id = p.category_id LEFT JOIN warehouse_categories cp ON cp.id = c.parent_id LEFT JOIN warehouse_suppliers s ON s.id = p.supplier_id WHERE p.id = ?", [product.id]);
      res.json({ product: mapProduct(rows[0]) });
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      next(error);
    } finally {
      connection.release();
    }
  });

  app.get("/api/warehouse/movements", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const where: string[] = [];
      const params: unknown[] = [];
      const productId = normalizeString(req.query.productId);
      const from = normalizeDate(req.query.from);
      const to = normalizeDate(req.query.to);
      if (productId) {
        where.push("m.product_id = ?");
        params.push(productId);
      }
      if (from) {
        where.push("DATE(m.created_at) >= ?");
        params.push(from);
      }
      if (to) {
        where.push("DATE(m.created_at) <= ?");
        params.push(to);
      }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT m.*, p.sku, p.name AS product_name
         FROM warehouse_stock_movements m
         LEFT JOIN warehouse_products p ON p.id = m.product_id
         ${clause}
         ORDER BY m.created_at DESC
         LIMIT ?`,
        [...params, normalizeLimit(req.query.limit)],
      );
      res.json({ movements: rows.map((row: any) => ({
        id: row.id,
        productId: row.product_id,
        sku: row.sku || "",
        productName: row.product_name || "",
        movementType: row.movement_type,
        quantityDelta: Number(row.quantity_delta || 0),
        unitCost: Number(row.unit_cost || 0),
        stockBefore: Number(row.stock_before || 0),
        stockAfter: Number(row.stock_after || 0),
        referenceType: row.reference_type || "",
        referenceId: row.reference_id || "",
        reason: row.reason || "",
        performedBy: row.performed_by || "",
        createdAt: rowDateToIso(row.created_at),
      })) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/warehouse/purchase-orders", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const where: string[] = [];
      const params: unknown[] = [];
      const status = normalizeString(req.query.status);
      const supplierId = normalizeString(req.query.supplierId);
      if (status && status !== "all") {
        where.push("po.status = ?");
        params.push(status);
      }
      if (supplierId && supplierId !== "all") {
        where.push("po.supplier_id = ?");
        params.push(supplierId);
      }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT po.*, s.name AS supplier_name
         FROM warehouse_purchase_orders po
         LEFT JOIN warehouse_suppliers s ON s.id = po.supplier_id
         ${clause}
         ORDER BY po.created_at DESC
         LIMIT ?`,
        [...params, normalizeLimit(req.query.limit)],
      );
      res.json({ purchaseOrders: rows.map(mapPurchaseOrder) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/warehouse/purchase-orders", requirePermission("warehouse.purchase"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(poolProvider);
    const connection = await pool.getConnection();
    try {
      await ensureWarehouseTables(connection);
      const items = Array.isArray(req.body.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ error: "At least one purchase order item is required" });
      const supplierId = normalizeString(req.body.supplierId);
      if (!supplierId) return res.status(400).json({ error: "Supplier is required" });
      const [supplierRows]: any = await connection.query("SELECT id FROM warehouse_suppliers WHERE id = ? LIMIT 1", [supplierId]);
      if (!supplierRows.length) return res.status(400).json({ error: "Supplier not found" });

      await connection.beginTransaction();
      const id = createId("po");
      const poNumber = normalizeString(req.body.poNumber) || `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${id.slice(-6).toUpperCase()}`;
      const normalizedItems = items.map((item: any) => {
        const quantity = positiveNumber(item.quantityOrdered ?? item.quantity, "Quantity");
        const unitCost = validateWarehouseMoney(item.unitCost, "Unit cost");
        return {
          productId: normalizeString(item.productId),
          sku: normalizeString(item.sku),
          description: normalizeString(item.description),
          quantity,
          unitCost,
          lineTotal: roundMoney(quantity * unitCost),
        };
      });
      if (normalizedItems.some((item: any) => !item.productId)) {
        const error = new Error("Every item requires a productId");
        (error as any).status = 400;
        throw error;
      }
      const subtotal = roundMoney(normalizedItems.reduce((sum: number, item: any) => sum + item.lineTotal, 0));
      const taxTotal = validateWarehouseMoney(req.body.taxTotal, "Tax total");
      const shippingTotal = validateWarehouseMoney(req.body.shippingTotal, "Shipping total");
      const total = roundMoney(subtotal + taxTotal + shippingTotal);
      await connection.query(
        `INSERT INTO warehouse_purchase_orders
          (id, po_number, supplier_id, status, order_date, expected_date, subtotal, tax_total, shipping_total, total, notes, created_by, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, poNumber, supplierId, normalizeString(req.body.status) || "pending", normalizeDate(req.body.orderDate) || new Date().toISOString().slice(0, 10), normalizeDate(req.body.expectedDate), subtotal, taxTotal, shippingTotal, total, normalizeString(req.body.notes), req.user?.email || "system", toMysqlJson(req.body.data || {})],
      );
      for (const item of normalizedItems) {
        await connection.query(
          `INSERT INTO warehouse_purchase_order_items
            (id, purchase_order_id, product_id, sku, description, quantity_ordered, unit_cost, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [createId("poi"), id, item.productId, item.sku, item.description, item.quantity, item.unitCost, item.lineTotal],
        );
      }
      await recordPurchaseOrderStatus(connection, { purchaseOrderId: id, toStatus: normalizeString(req.body.status) || "pending", changedBy: req.user?.email, notes: "Purchase order created" });
      await auditWarehouse(connection, "WAREHOUSE_PO_CREATED", { purchaseOrderId: id, total }, req.user?.email);
      await connection.commit();
      const [rows]: any = await pool.query("SELECT po.*, s.name AS supplier_name FROM warehouse_purchase_orders po LEFT JOIN warehouse_suppliers s ON s.id = po.supplier_id WHERE po.id = ?", [id]);
      res.status(201).json({ purchaseOrder: mapPurchaseOrder(rows[0]) });
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      next(error);
    } finally {
      connection.release();
    }
  });

  async function loadPurchaseOrderDetail(pool: Pool, poId: string) {
    const [poRows]: any = await pool.query(
      `SELECT po.*, s.name AS supplier_name, s.contact_name, s.email AS supplier_email, s.phone AS supplier_phone, s.payment_terms, s.delivery_schedule
       FROM warehouse_purchase_orders po
       LEFT JOIN warehouse_suppliers s ON s.id = po.supplier_id
       WHERE po.id = ? OR po.po_number = ?
       LIMIT 1`,
      [poId, poId],
    );
    if (!poRows.length) return null;
    const po = poRows[0];
    const [itemRows]: any = await pool.query(
      `SELECT i.*, p.name AS product_name, p.category, p.category_id, COALESCE(c.name, p.category) AS category_name, p.barcode, p.stock_quantity
       FROM warehouse_purchase_order_items i
       LEFT JOIN warehouse_products p ON p.id = i.product_id
       LEFT JOIN warehouse_categories c ON c.id = p.category_id
       WHERE i.purchase_order_id = ?
       ORDER BY i.created_at ASC`,
      [po.id],
    );
    await ensureFinanceTable(pool);
    const [financeRows]: any = await pool.query(
      `SELECT id, type, category, amount, transaction_date, source, reference_type, reference_id, description, status
       FROM finance_transactions
       WHERE reference_type = 'warehouse_purchase_order' AND reference_id = ?
       ORDER BY transaction_date DESC, id DESC`,
      [po.id],
    );
    const [historyRows]: any = await pool.query(
      `SELECT from_status, to_status, changed_by, changed_at, notes
       FROM warehouse_purchase_order_status_history
       WHERE purchase_order_id = ?
       ORDER BY changed_at ASC`,
      [po.id],
    );
    return {
      purchaseOrder: mapPurchaseOrder(po),
      supplier: {
        id: po.supplier_id,
        name: po.supplier_name || '',
        contactName: po.contact_name || '',
        email: po.supplier_email || '',
        phone: po.supplier_phone || '',
        paymentTerms: po.payment_terms || '',
        deliverySchedule: po.delivery_schedule || '',
      },
      items: itemRows.map((row: any) => ({
        id: row.id,
        productId: row.product_id,
        sku: row.sku || '',
        productName: row.product_name || row.description || '',
        description: row.description || '',
        barcode: row.barcode || '',
        category: row.category_name || row.category || 'General',
        categoryId: row.category_id || '',
        quantityOrdered: Number(row.quantity_ordered || 0),
        quantityReceived: Number(row.quantity_received || 0),
        unitCost: Number(row.unit_cost || 0),
        lineTotal: Number(row.line_total || 0),
        stockQuantity: Number(row.stock_quantity || 0),
      })),
      accountingEntries: financeRows.map((row: any) => ({ ...row, transaction_date: rowDateToYmd(row.transaction_date) })),
      statusHistory: historyRows.map((row: any) => ({ fromStatus: row.from_status || "", toStatus: row.to_status || "", changedBy: row.changed_by || "", changedAt: rowDateToIso(row.changed_at), notes: row.notes || "" })),
    };
  }

  app.get("/api/warehouse/purchase-orders/:id/detail", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const detail = await loadPurchaseOrderDetail(pool, req.params.id);
      if (!detail) return res.status(404).json({ error: "Purchase order not found" });
      res.json(detail);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/warehouse/purchase-orders/:id.pdf", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const detail = await loadPurchaseOrderDetail(pool, req.params.id);
      if (!detail) return res.status(404).json({ error: "Purchase order not found" });
      const columns = ["SKU", "Product", "Category", "Qty", "Received", "Unit Cost", "Line Total"];
      const rows = detail.items.map((item: any) => ({
        SKU: item.sku,
        Product: item.productName,
        Category: item.category,
        Qty: item.quantityOrdered,
        Received: item.quantityReceived,
        "Unit Cost": item.unitCost,
        "Line Total": item.lineTotal,
      }));
      return sendPdf(res, `warehouse-${detail.purchaseOrder.poNumber}.pdf`, `Purchase Order ${detail.purchaseOrder.poNumber} - ${detail.supplier.name}`, columns, rows);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/warehouse/purchase-orders/:id/receive", requirePermission("warehouse.purchase"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(poolProvider);
    const connection = await pool.getConnection();
    try {
      await ensureWarehouseTables(connection);
      await connection.beginTransaction();
      const poId = req.params.id;
      const [poRows]: any = await connection.query("SELECT * FROM warehouse_purchase_orders WHERE id = ? LIMIT 1 FOR UPDATE", [poId]);
      if (!poRows.length) {
        const error = new Error("Purchase order not found");
        (error as any).status = 404;
        throw error;
      }
      const [itemRows]: any = await connection.query("SELECT * FROM warehouse_purchase_order_items WHERE purchase_order_id = ?", [poId]);
      for (const item of itemRows) {
        const product = await getProductForUpdate(connection, { id: item.product_id });
        const remaining = Number(item.quantity_ordered || 0) - Number(item.quantity_received || 0);
        if (remaining <= 0) continue;
        const before = Number(product.stock_quantity || 0);
        const after = before + remaining;
        await connection.query("UPDATE warehouse_products SET stock_quantity = ?, cost_price = ? WHERE id = ?", [after, Number(item.unit_cost || 0), product.id]);
        await connection.query("UPDATE warehouse_purchase_order_items SET quantity_received = quantity_ordered WHERE id = ?", [item.id]);
        await insertStockMovement(connection, {
          productId: product.id,
          movementType: "purchase_receipt",
          quantityDelta: remaining,
          unitCost: Number(item.unit_cost || 0),
          stockBefore: before,
          stockAfter: after,
          referenceType: "purchase_order",
          referenceId: poId,
          reason: `Received PO ${poRows[0].po_number}`,
          performedBy: req.user?.email,
        });
      }
      await connection.query("UPDATE warehouse_purchase_orders SET status = 'received', received_date = ?, received_at = NOW() WHERE id = ?", [normalizeDate(req.body.receivedDate) || new Date().toISOString().slice(0, 10), poId]);
      await recordPurchaseOrderStatus(connection, { purchaseOrderId: poId, fromStatus: poRows[0].status, toStatus: "received", changedBy: req.user?.email, notes: "Items received into inventory" });
      await auditWarehouse(connection, "WAREHOUSE_PO_RECEIVED", { purchaseOrderId: poId, total: Number(poRows[0].total || 0) }, req.user?.email);
      await connection.commit();
      const [rows]: any = await pool.query("SELECT po.*, s.name AS supplier_name FROM warehouse_purchase_orders po LEFT JOIN warehouse_suppliers s ON s.id = po.supplier_id WHERE po.id = ?", [poId]);
      res.json({ purchaseOrder: mapPurchaseOrder(rows[0]) });
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      next(error);
    } finally {
      connection.release();
    }
  });


  app.post("/api/warehouse/purchase-orders/:id/status", requirePermission("warehouse.purchase"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(poolProvider);
    const connection = await pool.getConnection();
    try {
      await ensureWarehouseTables(connection);
      const poId = req.params.id;
      const nextStatus = normalizeLower(req.body.status);
      if (!nextStatus) return res.status(400).json({ error: "Status is required" });
      await connection.beginTransaction();
      const [poRows]: any = await connection.query("SELECT * FROM warehouse_purchase_orders WHERE id = ? LIMIT 1 FOR UPDATE", [poId]);
      if (!poRows.length) {
        const error = new Error("Purchase order not found");
        (error as any).status = 404;
        throw error;
      }
      const po = poRows[0];
      const current = normalizeLower(po.status) || "pending";
      const allowed = nextPurchaseOrderStatuses(current);
      if (!allowed.includes(nextStatus)) {
        const error = new Error(`Invalid PO transition: ${current} -> ${nextStatus}. Allowed: ${allowed.join(", ") || "none"}`);
        (error as any).status = 409;
        throw error;
      }
      if (nextStatus === "received") {
        const [itemRows]: any = await connection.query("SELECT * FROM warehouse_purchase_order_items WHERE purchase_order_id = ?", [poId]);
        for (const item of itemRows) {
          const product = await getProductForUpdate(connection, { id: item.product_id });
          const remaining = Number(item.quantity_ordered || 0) - Number(item.quantity_received || 0);
          if (remaining <= 0) continue;
          const before = Number(product.stock_quantity || 0);
          const after = before + remaining;
          await connection.query("UPDATE warehouse_products SET stock_quantity = ?, cost_price = ? WHERE id = ?", [after, Number(item.unit_cost || 0), product.id]);
          await connection.query("UPDATE warehouse_purchase_order_items SET quantity_received = quantity_ordered WHERE id = ?", [item.id]);
          await insertStockMovement(connection, { productId: product.id, movementType: "purchase_receipt", quantityDelta: remaining, unitCost: Number(item.unit_cost || 0), stockBefore: before, stockAfter: after, referenceType: "purchase_order", referenceId: poId, reason: `Received PO ${po.po_number}`, performedBy: req.user?.email });
        }
      }
      const timestampColumn = nextStatus === "shipped" ? "shipped_at" : nextStatus === "received" ? "received_at" : nextStatus === "invoiced" ? "invoiced_at" : null;
      await connection.query(
        `UPDATE warehouse_purchase_orders SET status = ?, ${timestampColumn ? `${timestampColumn} = NOW(),` : ""} updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [nextStatus, poId],
      );
      await recordPurchaseOrderStatus(connection, { purchaseOrderId: poId, fromStatus: current, toStatus: nextStatus, changedBy: req.user?.email, notes: normalizeString(req.body.notes) });
      if (nextStatus === "invoiced") {
        await postPurchaseOrderExpense(connection, po, req.user?.email);
      }
      await auditWarehouse(connection, "WAREHOUSE_PO_STATUS_UPDATED", { purchaseOrderId: poId, fromStatus: current, toStatus: nextStatus }, req.user?.email);
      await connection.commit();
      const [rows]: any = await pool.query("SELECT po.*, s.name AS supplier_name FROM warehouse_purchase_orders po LEFT JOIN warehouse_suppliers s ON s.id = po.supplier_id WHERE po.id = ?", [poId]);
      res.json({ purchaseOrder: mapPurchaseOrder(rows[0]) });
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      next(error);
    } finally {
      try { connection.release(); } catch {}
    }
  });

  app.get("/api/warehouse/pos/catalog", requirePermission("warehouse.pos"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const q = normalizeString(req.query.q);
      const category = normalizeString(req.query.category);
      const params: unknown[] = [];
      let clause = "WHERE p.status = 'active'";
      if (q) {
        clause += " AND (p.sku LIKE ? OR p.barcode LIKE ? OR p.name LIKE ?)";
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      if (category && category !== "all") {
        clause += " AND (p.category_id = ? OR p.category = ? OR c.name = ?)";
        params.push(category, category, category);
      }
      const [rows]: any = await pool.query(`SELECT p.*, COALESCE(c.name, p.category) AS category_name, c.parent_id AS category_parent_id, cp.name AS category_parent_name, s.name AS supplier_name FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id = p.category_id LEFT JOIN warehouse_categories cp ON cp.id = c.parent_id LEFT JOIN warehouse_suppliers s ON s.id = p.supplier_id ${clause} ORDER BY p.name ASC LIMIT ?`, [...params, normalizeLimit(req.query.limit, 100)]);
      res.json({ products: rows.map(mapProduct) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/warehouse/pos/sales", requirePermission("warehouse.pos"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(poolProvider);
    const connection = await pool.getConnection();
    try {
      await ensureWarehouseTables(connection);
      await connection.beginTransaction();
      const inputItems = Array.isArray(req.body.items) ? req.body.items : [];
      if (!inputItems.length) {
        const error = new Error("At least one sale item is required");
        (error as any).status = 400;
        throw error;
      }
      const resolvedItems: Array<WarehouseSaleTotalsInput & { product: any; lineTotal: number; resolvedUnitPrice: number }> = [];
      for (const input of inputItems) {
        const product = await getProductForUpdate(connection, { id: normalizeString(input.productId), sku: normalizeString(input.sku), barcode: normalizeString(input.barcode) });
        const quantity = positiveNumber(input.quantity, "Quantity");
        const stock = Number(product.stock_quantity || 0);
        if (stock < quantity) {
          const error = new Error(`Insufficient stock for ${product.sku}`);
          (error as any).status = 400;
          (error as any).sku = product.sku;
          (error as any).available = stock;
          throw error;
        }
        const tier = normalizeString(req.body.priceTier) || "retail";
        const defaultPrice = tier === "member" && Number(product.member_price || 0) > 0
          ? Number(product.member_price || 0)
          : tier === "wholesale" && Number(product.wholesale_price || 0) > 0
            ? Number(product.wholesale_price || 0)
            : Number(product.retail_price || 0);
        const resolvedUnitPrice = input.unitPrice !== undefined ? validateWarehouseMoney(input.unitPrice, "Unit price") : defaultPrice;
        const discount = Math.max(0, numberOrDefault(input.discount, 0));
        resolvedItems.push({
          productId: product.id,
          sku: product.sku,
          quantity,
          unitPrice: resolvedUnitPrice,
          resolvedUnitPrice,
          costPrice: Number(product.cost_price || 0),
          discount,
          product,
          lineTotal: roundMoney(Math.max(0, quantity * resolvedUnitPrice - discount)),
        });
      }
      const totals = calculateSaleTotals(resolvedItems, { discountTotal: req.body.discountTotal, taxRate: req.body.taxRate });
      const saleId = createId("sale");
      const receiptNumber = `POS-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${saleId.slice(-6).toUpperCase()}`;
      await connection.query(
        `INSERT INTO warehouse_pos_sales
          (id, receipt_number, sale_date, status, cashier, member_id, customer_name, payment_method, subtotal, discount_total, tax_total, total, cogs_total, notes, data)
         VALUES (?, ?, NOW(), 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          receiptNumber,
          req.user?.email || "cashier",
          normalizeString(req.body.memberId),
          normalizeString(req.body.customerName),
          normalizeString(req.body.paymentMethod) || "cash",
          totals.subtotal,
          totals.discountTotal,
          totals.taxTotal,
          totals.total,
          totals.cogs,
          normalizeString(req.body.notes),
          toMysqlJson({ priceTier: normalizeString(req.body.priceTier) || "retail" }),
        ],
      );
      for (const item of resolvedItems) {
        const before = Number(item.product.stock_quantity || 0);
        const after = before - item.quantity;
        await connection.query("UPDATE warehouse_products SET stock_quantity = ? WHERE id = ?", [after, item.product.id]);
        await connection.query(
          `INSERT INTO warehouse_pos_sale_items
            (id, sale_id, product_id, sku, description, quantity, unit_price, unit_cost, discount, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [createId("sli"), saleId, item.product.id, item.product.sku, item.product.name, item.quantity, item.resolvedUnitPrice, Number(item.product.cost_price || 0), item.discount || 0, item.lineTotal],
        );
        await insertStockMovement(connection, {
          productId: item.product.id,
          movementType: "sale",
          quantityDelta: -item.quantity,
          unitCost: Number(item.product.cost_price || 0),
          stockBefore: before,
          stockAfter: after,
          referenceType: "pos_sale",
          referenceId: saleId,
          reason: `POS sale ${receiptNumber}`,
          performedBy: req.user?.email,
        });
      }
      if (totals.total > 0) {
        await postFinanceTransaction(connection, {
          type: "income",
          category: "POS Sales",
          amount: totals.total,
          source: "warehouse_pos",
          referenceType: "warehouse_pos_sale",
          referenceId: saleId,
          description: `POS sale ${receiptNumber}`,
          createdBy: req.user?.email,
          data: { saleId, receiptNumber, paymentMethod: normalizeString(req.body.paymentMethod) || "cash" },
        });
      }
      if (totals.cogs > 0) {
        await postFinanceTransaction(connection, {
          type: "expense",
          category: "Cost of Goods Sold",
          amount: totals.cogs,
          source: "warehouse_pos",
          referenceType: "warehouse_pos_sale_cogs",
          referenceId: saleId,
          description: `COGS for ${receiptNumber}`,
          createdBy: req.user?.email,
          data: { saleId, receiptNumber },
        });
      }
      await auditWarehouse(connection, "WAREHOUSE_POS_SALE_POSTED", { saleId, receiptNumber, total: totals.total, cogs: totals.cogs }, req.user?.email);
      await connection.commit();
      const [rows]: any = await pool.query("SELECT * FROM warehouse_pos_sales WHERE id = ?", [saleId]);
      res.status(201).json({ sale: mapSale(rows[0]) });
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      next(error);
    } finally {
      connection.release();
    }
  });

  app.get("/api/warehouse/pos/sales", requirePermission("warehouse.pos"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const where: string[] = [];
      const params: unknown[] = [];
      const from = normalizeDate(req.query.from);
      const to = normalizeDate(req.query.to);
      const paymentMethod = normalizeString(req.query.paymentMethod);
      if (from) { where.push("DATE(sale_date) >= ?"); params.push(from); }
      if (to) { where.push("DATE(sale_date) <= ?"); params.push(to); }
      if (paymentMethod && paymentMethod !== "all") { where.push("payment_method = ?"); params.push(paymentMethod); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [rows]: any = await pool.query(`SELECT * FROM warehouse_pos_sales ${clause} ORDER BY sale_date DESC LIMIT ?`, [...params, normalizeLimit(req.query.limit, 200)]);
      res.json({ sales: rows.map(mapSale) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/warehouse/reports/:reportId.:format", requirePermission("warehouse.reports"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureWarehouseTables(pool);
      const reportId = normalizeString(req.params.reportId);
      const format = normalizeLower(req.params.format);
      if (!["csv", "pdf"].includes(format)) return res.status(400).json({ error: "Report format must be csv or pdf" });
      const from = normalizeDate(req.query.from);
      const to = normalizeDate(req.query.to);
      let title = "Warehouse Report";
      let columns: string[] = [];
      let rows: Array<Record<string, unknown>> = [];

      if (reportId === "inventory") {
        title = "Inventory Valuation Report";
        columns = ["SKU", "Product", "Category", "Stock", "Cost", "Retail", "Stock Value", "Retail Value", "Status", "Expiry"];
        const categoryFilter = normalizeString(req.query.category);
        const inventoryWhere = ["p.status <> 'archived'"];
        const inventoryParams: unknown[] = [];
        if (categoryFilter && categoryFilter !== "all") { inventoryWhere.push("(p.category = ? OR p.category_id = ?)"); inventoryParams.push(categoryFilter, categoryFilter); }
        const [data]: any = await pool.query(
          `SELECT p.sku AS SKU, p.name AS Product, COALESCE(c.name, p.category) AS Category, p.stock_quantity AS Stock, p.cost_price AS Cost, p.retail_price AS Retail,
            ROUND(p.stock_quantity * p.cost_price, 2) AS 'Stock Value', ROUND(p.stock_quantity * p.retail_price, 2) AS 'Retail Value', p.status AS Status, p.expiry_date AS Expiry
           FROM warehouse_products p
           LEFT JOIN warehouse_categories c ON c.id = p.category_id
           WHERE ${inventoryWhere.join(" AND ")}
           ORDER BY Category ASC, p.name ASC
           LIMIT 1000`,
          inventoryParams,
        );
        rows = data.map((row: any) => ({ ...row, Expiry: rowDateToYmd(row.Expiry) }));
      } else if (reportId === "sales") {
        title = "POS Sales Report";
        columns = ["Receipt", "Date", "Cashier", "Payment", "Subtotal", "Discount", "Tax", "Total", "COGS", "Margin"];
        const where: string[] = [];
        const params: unknown[] = [];
        if (from) { where.push("DATE(sale.sale_date) >= ?"); params.push(from); }
        if (to) { where.push("DATE(sale.sale_date) <= ?"); params.push(to); }
        const salesCategory = normalizeString(req.query.category);
        if (salesCategory && salesCategory !== "all") { where.push("EXISTS (SELECT 1 FROM warehouse_pos_sale_items si JOIN warehouse_products sp ON sp.id = si.product_id WHERE si.sale_id = sale.id AND (sp.category = ? OR sp.category_id = ?))"); params.push(salesCategory, salesCategory); }
        const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const [data]: any = await pool.query(
          `SELECT sale.receipt_number AS Receipt, sale.sale_date AS Date, sale.cashier AS Cashier, sale.payment_method AS Payment, sale.subtotal AS Subtotal, sale.discount_total AS Discount, sale.tax_total AS Tax, sale.total AS Total, sale.cogs_total AS COGS, ROUND(sale.total - sale.cogs_total, 2) AS Margin
           FROM warehouse_pos_sales sale ${clause}
           ORDER BY sale.sale_date DESC LIMIT 1000`,
          params,
        );
        rows = data.map((row: any) => ({ ...row, Date: rowDateToIso(row.Date) }));
      } else if (reportId === "purchases") {
        title = "Purchase History Report";
        columns = ["PO", "Supplier", "Status", "Order Date", "Expected", "Received", "Subtotal", "Tax", "Shipping", "Total"];
        const where: string[] = [];
        const params: unknown[] = [];
        if (from) { where.push("po.order_date >= ?"); params.push(from); }
        if (to) { where.push("po.order_date <= ?"); params.push(to); }
        const purchaseCategory = normalizeString(req.query.category);
        if (purchaseCategory && purchaseCategory !== "all") { where.push("EXISTS (SELECT 1 FROM warehouse_purchase_order_items poi JOIN warehouse_products pp ON pp.id = poi.product_id WHERE poi.purchase_order_id = po.id AND (pp.category = ? OR pp.category_id = ?))"); params.push(purchaseCategory, purchaseCategory); }
        const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const [data]: any = await pool.query(
          `SELECT po.po_number AS PO, s.name AS Supplier, po.status AS Status, po.order_date AS 'Order Date', po.expected_date AS Expected, po.received_date AS Received, po.subtotal AS Subtotal, po.tax_total AS Tax, po.shipping_total AS Shipping, po.total AS Total
           FROM warehouse_purchase_orders po
           LEFT JOIN warehouse_suppliers s ON s.id = po.supplier_id
           ${clause}
           ORDER BY po.order_date DESC LIMIT 1000`,
          params,
        );
        rows = data.map((row: any) => ({ ...row, "Order Date": rowDateToYmd(row["Order Date"]), Expected: rowDateToYmd(row.Expected), Received: rowDateToYmd(row.Received) }));
      } else {
        return res.status(404).json({ error: "Unknown warehouse report" });
      }

      if (format === "csv") return sendCsv(res, `warehouse-${reportId}.csv`, columns, rows);
      return sendPdf(res, `warehouse-${reportId}.pdf`, title, columns, rows);
    } catch (error) {
      next(error);
    }
  });
}
