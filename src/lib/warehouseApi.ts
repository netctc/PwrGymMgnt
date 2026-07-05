export type WarehouseSummary = {
  productCount: number;
  totalStock: number;
  stockValue: number;
  retailValue: number;
  lowStockCount: number;
  overstockCount: number;
  expiringCount: number;
  todaySalesTotal: number;
  todaySalesCount: number;
  openPurchaseOrders: number;
  openPurchaseOrderValue: number;
};

export type WarehouseCategory = {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  parentName?: string;
  description?: string;
  status: string;
  productCount?: number;
};

export type WarehouseProduct = {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category: string;
  categoryId?: string;
  categoryParentId?: string;
  categoryParentName?: string;
  supplierId?: string;
  supplierName?: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  memberPrice: number;
  stockQuantity: number;
  minStock: number;
  maxStock: number;
  unit: string;
  status: string;
  stockStatus: string;
  expiryDate?: string;
  location?: string;
  imageUrl?: string;
  data?: Record<string, unknown>;
};

export type WarehouseSupplier = {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  paymentTerms?: string;
  deliverySchedule?: string;
  contractNotes?: string;
  status: string;
};

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName?: string;
  status: string;
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  shippedAt?: string | null;
  receivedAt?: string | null;
  invoicedAt?: string | null;
  subtotal: number;
  taxTotal: number;
  shippingTotal: number;
  total: number;
  notes?: string;
};

export type PosSale = {
  id: string;
  receiptNumber: string;
  saleDate?: string;
  status: string;
  cashier?: string;
  memberId?: string;
  customerName?: string;
  paymentMethod: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  cogsTotal: number;
};

export type WarehouseProductDetail = {
  product: WarehouseProduct;
  movements: Array<Record<string, any>>;
  purchases: Array<Record<string, any>>;
  sales: Array<Record<string, any>>;
  accountingEntries: Array<Record<string, any>>;
  statusHistory: Array<Record<string, any>>;
};

export type PurchaseOrderDetail = {
  purchaseOrder: PurchaseOrder;
  supplier: Record<string, any>;
  items: Array<Record<string, any>>;
  accountingEntries: Array<Record<string, any>>;
  statusHistory: Array<Record<string, any>>;
};

export class WarehouseApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'WarehouseApiError';
    this.status = status;
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: BodyInit | Record<string, unknown> | null };

async function apiRequest<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body as BodyInit | null | undefined;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(url, { credentials: 'include', ...options, headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new WarehouseApiError(payload.error?.message || payload.error || `Request failed with ${response.status}`, response.status);
  }
  return payload as T;
}

function toQuery(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export const warehouseApi = {
  getSummary: () => apiRequest<{ summary: WarehouseSummary }>('/api/warehouse/summary'),

  listCategories: () => apiRequest<{ categories: WarehouseCategory[] }>('/api/warehouse/categories'),

  createCategory: (payload: Partial<WarehouseCategory>) =>
    apiRequest<{ category: WarehouseCategory }>('/api/warehouse/categories', { method: 'POST', body: payload }),

  updateCategory: (id: string, payload: Partial<WarehouseCategory>) =>
    apiRequest<{ category: WarehouseCategory }>(`/api/warehouse/categories/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),

  deleteCategory: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/warehouse/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listProducts: (params: { q?: string; category?: string; supplierId?: string; status?: string; stockStatus?: string; limit?: number } = {}) =>
    apiRequest<{ products: WarehouseProduct[] }>(`/api/warehouse/products${toQuery(params)}`),

  createProduct: (payload: Partial<WarehouseProduct>) =>
    apiRequest<{ product: WarehouseProduct }>('/api/warehouse/products', { method: 'POST', body: payload }),

  updateProduct: (id: string, payload: Partial<WarehouseProduct>) =>
    apiRequest<{ product: WarehouseProduct }>(`/api/warehouse/products/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),

  deleteProduct: (id: string) =>
    apiRequest<{ ok: boolean; productId: string }>(`/api/warehouse/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getProductDetail: (id: string) =>
    apiRequest<WarehouseProductDetail>(`/api/warehouse/products/${encodeURIComponent(id)}/detail`),

  productPdfUrl: (id: string) => `/api/warehouse/products/${encodeURIComponent(id)}.pdf`,

  listSuppliers: (params: { q?: string; limit?: number } = {}) =>
    apiRequest<{ suppliers: WarehouseSupplier[] }>(`/api/warehouse/suppliers${toQuery(params)}`),

  createSupplier: (payload: Partial<WarehouseSupplier>) =>
    apiRequest<{ supplier: WarehouseSupplier }>('/api/warehouse/suppliers', { method: 'POST', body: payload }),

  updateSupplier: (id: string, payload: Partial<WarehouseSupplier>) =>
    apiRequest<{ supplier: WarehouseSupplier }>(`/api/warehouse/suppliers/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),

  adjustStock: (payload: { productId?: string; sku?: string; barcode?: string; quantityDelta: number; unitCost?: number; reason?: string }) =>
    apiRequest<{ product: WarehouseProduct }>('/api/warehouse/stock-adjustments', { method: 'POST', body: payload }),

  listPurchaseOrders: (params: { status?: string; supplierId?: string; limit?: number } = {}) =>
    apiRequest<{ purchaseOrders: PurchaseOrder[] }>(`/api/warehouse/purchase-orders${toQuery(params)}`),

  createPurchaseOrder: (payload: Record<string, unknown>) =>
    apiRequest<{ purchaseOrder: PurchaseOrder }>('/api/warehouse/purchase-orders', { method: 'POST', body: payload }),

  receivePurchaseOrder: (id: string) =>
    apiRequest<{ purchaseOrder: PurchaseOrder }>(`/api/warehouse/purchase-orders/${encodeURIComponent(id)}/receive`, { method: 'POST', body: {} }),

  updatePurchaseOrderStatus: (id: string, status: 'shipped' | 'received' | 'invoiced', notes?: string) =>
    apiRequest<{ purchaseOrder: PurchaseOrder }>(`/api/warehouse/purchase-orders/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status, notes } }),

  getPurchaseOrderDetail: (id: string) =>
    apiRequest<PurchaseOrderDetail>(`/api/warehouse/purchase-orders/${encodeURIComponent(id)}/detail`),

  purchaseOrderPdfUrl: (id: string) => `/api/warehouse/purchase-orders/${encodeURIComponent(id)}.pdf`,

  listPosCatalog: (params: { q?: string; category?: string; limit?: number } = {}) =>
    apiRequest<{ products: WarehouseProduct[] }>(`/api/warehouse/pos/catalog${toQuery(params)}`),

  postSale: (payload: Record<string, unknown>) =>
    apiRequest<{ sale: PosSale }>('/api/warehouse/pos/sales', { method: 'POST', body: payload }),

  listSales: (params: { from?: string; to?: string; paymentMethod?: string; limit?: number } = {}) =>
    apiRequest<{ sales: PosSale[] }>(`/api/warehouse/pos/sales${toQuery(params)}`),

  reportUrl: (reportId: 'inventory' | 'sales' | 'purchases', format: 'pdf' | 'csv', params: { from?: string; to?: string; category?: string } = {}) =>
    `/api/warehouse/reports/${reportId}.${format}${toQuery(params)}`,
};
