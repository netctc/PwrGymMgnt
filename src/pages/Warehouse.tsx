import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Archive,
  Barcode,
  Boxes,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  FileText,
  Filter,
  Image as ImageIcon,
  Landmark,
  PackagePlus,
  Pause,
  Plus,
  Printer,
  Receipt,
  Save,
  Search,
  ShoppingCart,
  Tags,
  Trash2,
  Truck,
  UserRound,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import EmptyState from '../components/EmptyState';
import { hasClientPermission, type ClientPermission } from '../lib/permissions';
import InlineAlert from '../components/InlineAlert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import DateInput from '../components/DateInput';
import ListPagination from '../components/ListPagination';
import { Label } from '../components/ui/label';
import {
  warehouseApi,
  type PosSale,
  type PurchaseOrder,
  type PurchaseOrderDetail,
  type WarehouseCategory,
  type WarehouseProduct,
  type WarehouseProductDetail,
  type WarehouseSupplier,
  type WarehouseSummary,
} from '../lib/warehouseApi';

const POS_TAX_RATE_DEFAULT = 0.11;

const sections: ReadonlyArray<{ id: string; label: string; icon: ReactNode; permission: ClientPermission }> = [
  { id: 'dashboard', label: 'Warehouse', icon: <WarehouseIcon className="h-5 w-5" />, permission: 'warehouse.read' },
  { id: 'inventory', label: 'Inventory', icon: <Archive className="h-5 w-5" />, permission: 'warehouse.read' },
  { id: 'pos', label: 'POS', icon: <Receipt className="h-5 w-5" />, permission: 'warehouse.pos' },
  { id: 'suppliers', label: 'Suppliers', icon: <Truck className="h-5 w-5" />, permission: 'warehouse.purchase' },
  { id: 'reports', label: 'Reports', icon: <FileText className="h-5 w-5" />, permission: 'warehouse.reports' },
] as const;

type SectionId = 'dashboard' | 'inventory' | 'pos' | 'suppliers' | 'reports';

type ProductForm = {
  id?: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: string;
  category: string;
  supplierId: string;
  costPrice: string;
  retailPrice: string;
  wholesalePrice: string;
  memberPrice: string;
  stockQuantity: string;
  minStock: string;
  maxStock: string;
  unit: string;
  location: string;
  expiryDate: string;
  imageUrl: string;
  status: string;
};

type SupplierForm = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  paymentTerms: string;
  deliverySchedule: string;
};

type CategoryForm = {
  id?: string;
  name: string;
  parentId: string;
  description: string;
  status: string;
};

const initialProductForm: ProductForm = {
  sku: '',
  barcode: '',
  name: '',
  description: '',
  categoryId: '',
  category: 'General',
  supplierId: '',
  costPrice: '0',
  retailPrice: '0',
  wholesalePrice: '0',
  memberPrice: '0',
  stockQuantity: '0',
  minStock: '0',
  maxStock: '0',
  unit: 'pcs',
  location: 'main',
  expiryDate: '',
  imageUrl: '',
  status: 'active',
};

const initialSupplierForm: SupplierForm = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  paymentTerms: '',
  deliverySchedule: '',
};

const initialCategoryForm: CategoryForm = {
  name: '',
  parentId: '',
  description: '',
  status: 'active',
};

function money(value: number | undefined) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactMoney(value: number | undefined) {
  const amount = Number(value || 0);
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return money(amount);
}

function numberValue(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateShort(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function normalizedStatus(value?: string) {
  return String(value || '').trim().toLowerCase();
}

function stockLabel(product: WarehouseProduct) {
  const status = normalizedStatus(product.stockStatus || product.status);
  if (status === 'out_of_stock') return 'OUT OF STOCK';
  if (status === 'low_stock') return 'LOW STOCK';
  if (status === 'overstock') return 'OVERSTOCK';
  return 'IN STOCK';
}

function stockAccent(product: WarehouseProduct) {
  const status = normalizedStatus(product.stockStatus || product.status);
  if (status === 'out_of_stock') return 'text-red-700 border-red-200 bg-red-50';
  if (status === 'low_stock') return 'text-amber-700 border-amber-200 bg-amber-50';
  if (status === 'overstock') return 'text-sky-700 border-sky-200 bg-sky-50';
  return 'text-emerald-700 border-emerald-200 bg-emerald-50';
}

function poStatusClass(status: string) {
  const normalized = normalizedStatus(status);
  if (normalized === 'received') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (normalized === 'invoiced') return 'bg-slate-100 text-slate-700 border-slate-300';
  if (normalized === 'shipped') return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-indigo-50 text-indigo-700 border-indigo-200';
}

function productPrice(product: WarehouseProduct) {
  return Number(product.memberPrice || 0) > 0 ? Number(product.memberPrice) : Number(product.retailPrice || 0);
}

function categoryLabel(categories: WarehouseCategory[], categoryId: string, fallback = 'General') {
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return fallback;
  return category.parentName ? `${category.parentName} / ${category.name}` : category.name;
}

function productToForm(product: WarehouseProduct): ProductForm {
  return {
    id: product.id,
    sku: product.sku || '',
    barcode: product.barcode || '',
    name: product.name || '',
    description: product.description || '',
    categoryId: product.categoryId || '',
    category: product.category || 'General',
    supplierId: product.supplierId || '',
    costPrice: String(product.costPrice || 0),
    retailPrice: String(product.retailPrice || 0),
    wholesalePrice: String(product.wholesalePrice || 0),
    memberPrice: String(product.memberPrice || 0),
    stockQuantity: String(product.stockQuantity || 0),
    minStock: String(product.minStock || 0),
    maxStock: String(product.maxStock || 0),
    unit: product.unit || 'pcs',
    location: product.location || 'main',
    expiryDate: product.expiryDate || '',
    imageUrl: product.imageUrl || '',
    status: product.status || 'active',
  };
}

export default function Warehouse() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const allowedSections = sections.filter((item) => hasClientPermission(profile?.role, item.permission));
  const section = (allowedSections.find((item) => item.id === searchParams.get('tab'))?.id || allowedSections[0]?.id || 'pos') as SectionId;
  const canManageInventory = hasClientPermission(profile?.role, 'warehouse.write');
  const canPurchase = hasClientPermission(profile?.role, 'warehouse.purchase');
  const setSection = (nextSection: SectionId) => {
    if (nextSection === 'dashboard') setSearchParams({});
    else setSearchParams({ tab: nextSection });
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<WarehouseSummary | null>(null);
  const [products, setProducts] = useState<WarehouseProduct[]>([]);
  const [suppliers, setSuppliers] = useState<WarehouseSupplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [categories, setCategories] = useState<WarehouseCategory[]>([]);

  const [globalSearch, setGlobalSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [stockStatus, setStockStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [poStatusFilter, setPoStatusFilter] = useState('all');
  const [poSupplierFilter, setPoSupplierFilter] = useState('all');
  const [poFrom, setPoFrom] = useState('');
  const [poTo, setPoTo] = useState('');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState('all');
  const [salesFrom, setSalesFrom] = useState('');
  const [salesTo, setSalesTo] = useState('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(25);
  const [posPage, setPosPage] = useState(1);
  const [posPageSize, setPosPageSize] = useState(25);
  const [poPage, setPoPage] = useState(1);
  const [poPageSize, setPoPageSize] = useState(25);
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(25);
  const [reportFilters, setReportFilters] = useState({ from: '', to: '', category: 'all' });

  const [productForm, setProductForm] = useState<ProductForm>(initialProductForm);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(initialSupplierForm);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(initialCategoryForm);
  const [adjustment, setAdjustment] = useState({ productId: '', quantityDelta: '', reason: '' });
  const [poForm, setPoForm] = useState({ supplierId: '', productId: '', quantity: '1', unitCost: '0', expectedDate: '' });

  const [cart, setCart] = useState<Array<{ product: WarehouseProduct; quantity: number; discount: number }>>([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true);
  const [heldCarts, setHeldCarts] = useState<Array<{ id: string; createdAt: string; items: Array<{ product: WarehouseProduct; quantity: number; discount: number }> }>>([]);
  const [promoCode, setPromoCode] = useState('');

  const [productModal, setProductModal] = useState<WarehouseProductDetail | null>(null);
  const [poModal, setPoModal] = useState<PurchaseOrderDetail | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [taxRate, setTaxRate] = useState(POS_TAX_RATE_DEFAULT);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryData, productData, supplierData, poData, salesData, categoryData, taxData] = await Promise.all([
        warehouseApi.getSummary(),
        warehouseApi.listProducts({ limit: 500 }),
        warehouseApi.listSuppliers({ limit: 500 }),
        warehouseApi.listPurchaseOrders({ limit: 250 }),
        warehouseApi.listSales({ limit: 250 }),
        warehouseApi.listCategories(),
        fetch('/api/warehouse/tax-settings', { credentials: 'include' }).then((r) => r.ok ? r.json() : { taxRate: POS_TAX_RATE_DEFAULT }),
      ]);
      setSummary(summaryData.summary);
      setProducts(productData.products);
      setSuppliers(supplierData.suppliers);
      setPurchaseOrders(poData.purchaseOrders);
      setSales(salesData.sales);
      setCategories(categoryData.categories);
      if (typeof taxData.taxRate === 'number' && taxData.taxRate > 0) setTaxRate(taxData.taxRate);
    } catch (err: any) {
      setError(err?.message || 'Failed to load warehouse data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const categoryOptions = useMemo(() => {
    const active = categories.filter((item) => item.status !== 'archived');
    const fromProducts = products
      .map((product) => ({ id: product.categoryId || product.category, name: product.category || 'General', parentName: product.categoryParentName || '' }))
      .filter((item) => item.name);
    const merged = new Map<string, { id: string; name: string; parentName?: string }>();
    active.forEach((item) => merged.set(item.id, { id: item.id, name: item.name, parentName: item.parentName }));
    fromProducts.forEach((item) => merged.set(item.id || item.name, item));
    return Array.from(merged.values()).sort((a, b) => categoryLabel(categories, a.id, a.name).localeCompare(categoryLabel(categories, b.id, b.name)));
  }, [categories, products]);

  const filteredProducts = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !q || [product.sku, product.barcode, product.name, product.category, product.supplierName].some((value) => String(value || '').toLowerCase().includes(q));
      const matchesStatus = stockStatus === 'all' || normalizedStatus(product.stockStatus || product.status) === stockStatus;
      const matchesCategory = category === 'all' || product.category === category || product.categoryId === category;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [products, globalSearch, stockStatus, category]);

  const posProducts = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    return products
      .filter((product) => product.status !== 'archived')
      .filter((product) => category === 'all' || product.category === category || product.categoryId === category)
      .filter((product) => !q || [product.sku, product.barcode, product.name, product.category].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [products, globalSearch, category]);

  const cartTotals = useMemo(() => {
    const retailSubtotal = cart.reduce((sum, item) => sum + item.quantity * Number(item.product.retailPrice || 0), 0);
    const subtotal = cart.reduce((sum, item) => sum + Math.max(0, item.quantity * productPrice(item.product) - item.discount), 0);
    const cogs = cart.reduce((sum, item) => sum + item.quantity * Number(item.product.costPrice || 0), 0);
    const memberDiscount = Math.max(0, retailSubtotal - subtotal);
    const tax = subtotal * taxRate;
    return { retailSubtotal, subtotal, memberDiscount, tax, total: subtotal + tax, cogs };
  }, [cart, taxRate]);

  const inventoryKpis = useMemo(() => {
    const out = products.filter((product) => normalizedStatus(product.stockStatus || product.status) === 'out_of_stock').length;
    const low = products.filter((product) => normalizedStatus(product.stockStatus || product.status) === 'low_stock').length;
    return {
      totalSkus: summary?.productCount || products.length,
      lowStock: summary?.lowStockCount ?? low,
      outOfStock: out,
      valuation: summary?.stockValue || products.reduce((sum, product) => sum + product.stockQuantity * product.costPrice, 0),
    };
  }, [products, summary]);

  const replenishmentPriority = useMemo(() => products
    .filter((product) => ['out_of_stock', 'low_stock'].includes(normalizedStatus(product.stockStatus || product.status)))
    .sort((a, b) => a.stockQuantity - b.stockQuantity)
    .slice(0, 5), [products]);

  const supplierPerformance = useMemo(() => {
    const total = purchaseOrders.length;
    const received = purchaseOrders.filter((po) => normalizedStatus(po.status) === 'received' || normalizedStatus(po.status) === 'invoiced').length;
    const pendingValue = purchaseOrders.filter((po) => !['received', 'invoiced'].includes(normalizedStatus(po.status))).reduce((sum, po) => sum + Number(po.total || 0), 0);
    return {
      fulfillmentDays: total ? Math.max(1.5, 6 - received * 0.2).toFixed(1) : '0.0',
      accuracy: total ? ((received / total) * 100).toFixed(1) : '0.0',
      pendingValue,
    };
  }, [purchaseOrders]);

  const filteredPurchaseOrders = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      const matchesSearch = !q || [po.poNumber, po.supplierName, po.status].some((value) => String(value || '').toLowerCase().includes(q));
      const matchesStatus = poStatusFilter === 'all' || normalizedStatus(po.status) === poStatusFilter;
      const matchesSupplier = poSupplierFilter === 'all' || po.supplierId === poSupplierFilter;
      const orderDate = String(po.orderDate || '').slice(0, 10);
      const matchesFrom = !poFrom || orderDate >= poFrom;
      const matchesTo = !poTo || orderDate <= poTo;
      return matchesSearch && matchesStatus && matchesSupplier && matchesFrom && matchesTo;
    });
  }, [purchaseOrders, globalSearch, poStatusFilter, poSupplierFilter, poFrom, poTo]);

  const filteredSales = useMemo(() => sales.filter((sale) => {
    const date = String(sale.saleDate || '').slice(0, 10);
    return (salesPaymentFilter === 'all' || sale.paymentMethod === salesPaymentFilter)
      && (!salesFrom || date >= salesFrom)
      && (!salesTo || date <= salesTo);
  }), [sales, salesPaymentFilter, salesFrom, salesTo]);

  const safeInventoryPage = Math.min(inventoryPage, Math.max(1, Math.ceil(filteredProducts.length / inventoryPageSize)));
  const safePosPage = Math.min(posPage, Math.max(1, Math.ceil(posProducts.length / posPageSize)));
  const safePoPage = Math.min(poPage, Math.max(1, Math.ceil(filteredPurchaseOrders.length / poPageSize)));
  const safeSalesPage = Math.min(salesPage, Math.max(1, Math.ceil(filteredSales.length / salesPageSize)));
  const pagedProducts = filteredProducts.slice((safeInventoryPage - 1) * inventoryPageSize, safeInventoryPage * inventoryPageSize);
  const pagedPosProducts = posProducts.slice((safePosPage - 1) * posPageSize, safePosPage * posPageSize);
  const pagedPurchaseOrders = filteredPurchaseOrders.slice((safePoPage - 1) * poPageSize, safePoPage * poPageSize);
  const pagedSales = filteredSales.slice((safeSalesPage - 1) * salesPageSize, safeSalesPage * salesPageSize);

  useEffect(() => { setInventoryPage(1); }, [globalSearch, stockStatus, category, inventoryPageSize]);
  useEffect(() => { setPosPage(1); }, [globalSearch, category, posPageSize]);
  useEffect(() => { setPoPage(1); }, [globalSearch, poStatusFilter, poSupplierFilter, poFrom, poTo, poPageSize]);
  useEffect(() => { setSalesPage(1); }, [salesPaymentFilter, salesFrom, salesTo, salesPageSize]);

  const beginCreateProduct = () => {
    setProductForm(initialProductForm);
    document.getElementById('product-editor-panel')?.scrollIntoView({ behavior: 'smooth' });
  };

  const beginEditProduct = (product: WarehouseProduct) => {
    setProductForm(productToForm(product));
    document.getElementById('product-editor-panel')?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadProductDetail = async (id: string) => {
    setModalLoading(true);
    try {
      const detail = await warehouseApi.getProductDetail(id);
      setProductModal(detail);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load product detail');
    } finally {
      setModalLoading(false);
    }
  };

  const loadPurchaseOrderDetail = async (id: string) => {
    setModalLoading(true);
    try {
      const detail = await warehouseApi.getPurchaseOrderDetail(id);
      setPoModal(detail);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load purchase order detail');
    } finally {
      setModalLoading(false);
    }
  };

  const saveCategory = async () => {
    try {
      if (!categoryForm.name.trim()) {
        toast.error('Category name is required.');
        return;
      }
      if (categoryForm.id) await warehouseApi.updateCategory(categoryForm.id, categoryForm);
      else await warehouseApi.createCategory(categoryForm);
      toast.success(categoryForm.id ? 'Category updated.' : 'Category created.');
      setCategoryForm(initialCategoryForm);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save category');
    }
  };

  const deleteCategory = async (item: WarehouseCategory) => {
    if (!window.confirm(`Archive category ${item.name}? Products must be reassigned first.`)) return;
    try {
      await warehouseApi.deleteCategory(item.id);
      toast.success('Category archived.');
      if (category === item.id) setCategory('all');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to archive category');
    }
  };

  const saveProduct = async () => {
    try {
      if (!productForm.sku.trim() || !productForm.name.trim()) {
        toast.error('SKU and product name are required.');
        return;
      }
      const selectedCategory = categories.find((item) => item.id === productForm.categoryId);
      const payload: Partial<WarehouseProduct> = {
        sku: productForm.sku,
        barcode: productForm.barcode,
        name: productForm.name,
        description: productForm.description,
        categoryId: productForm.categoryId || undefined,
        category: selectedCategory?.name || productForm.category || 'General',
        supplierId: productForm.supplierId,
        costPrice: numberValue(productForm.costPrice),
        retailPrice: numberValue(productForm.retailPrice),
        wholesalePrice: numberValue(productForm.wholesalePrice),
        memberPrice: numberValue(productForm.memberPrice),
        stockQuantity: numberValue(productForm.stockQuantity),
        minStock: numberValue(productForm.minStock),
        maxStock: numberValue(productForm.maxStock),
        unit: productForm.unit || 'pcs',
        location: productForm.location || 'main',
        expiryDate: productForm.expiryDate,
        imageUrl: productForm.imageUrl,
        status: productForm.status || 'active',
      };
      if (productForm.id) await warehouseApi.updateProduct(productForm.id, payload);
      else await warehouseApi.createProduct(payload);
      toast.success(productForm.id ? 'Product updated.' : 'Product created.');
      setProductForm(initialProductForm);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save product');
    }
  };

  const deleteProduct = async (product: WarehouseProduct) => {
    if (!window.confirm(`Archive product ${product.sku} - ${product.name}?`)) return;
    try {
      await warehouseApi.deleteProduct(product.id);
      toast.success('Product archived.');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to archive product');
    }
  };

  const saveSupplier = async () => {
    try {
      if (!supplierForm.name.trim()) {
        toast.error('Supplier name is required.');
        return;
      }
      await warehouseApi.createSupplier(supplierForm);
      toast.success('Supplier created.');
      setSupplierForm(initialSupplierForm);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save supplier');
    }
  };

  const submitAdjustment = async () => {
    try {
      if (!adjustment.productId || !adjustment.quantityDelta) {
        toast.error('Product and quantity delta are required.');
        return;
      }
      await warehouseApi.adjustStock({ productId: adjustment.productId, quantityDelta: Number(adjustment.quantityDelta), reason: adjustment.reason || 'Manual stock adjustment / transfer correction' });
      toast.success('Stock adjusted and accounting impact posted when applicable.');
      setAdjustment({ productId: '', quantityDelta: '', reason: '' });
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to adjust stock');
    }
  };

  const createPurchaseOrder = async () => {
    try {
      if (!poForm.supplierId || !poForm.productId) {
        toast.error('Supplier and product are required.');
        return;
      }
      const product = products.find((item) => item.id === poForm.productId);
      await warehouseApi.createPurchaseOrder({
        supplierId: poForm.supplierId,
        expectedDate: poForm.expectedDate,
        items: [{ productId: poForm.productId, sku: product?.sku, description: product?.name, quantityOrdered: Number(poForm.quantity), unitCost: Number(poForm.unitCost || product?.costPrice || 0) }],
      });
      toast.success('Purchase order created.');
      setPoForm({ supplierId: '', productId: '', quantity: '1', unitCost: '0', expectedDate: '' });
      setSection('suppliers');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create purchase order');
    }
  };



  const startReplenishment = (product: WarehouseProduct) => {
    const preferredSupplier = product.supplierId || suppliers[0]?.id || '';
    setPoForm({
      supplierId: preferredSupplier,
      productId: product.id,
      quantity: String(Math.max(1, Math.ceil(Math.max(product.minStock || 0, 1) - Number(product.stockQuantity || 0) + 5))),
      unitCost: String(product.costPrice || 0),
      expectedDate: '',
    });
    setSection('suppliers');
    window.setTimeout(() => document.getElementById('purchase-order-panel')?.scrollIntoView({ behavior: 'smooth' }), 50);
    toast.success(`Replenishment PO started for ${product.sku}. Review and submit.`);
  };

  const updatePurchaseOrderStatus = async (id: string, status: 'shipped' | 'received' | 'invoiced') => {
    try {
      await warehouseApi.updatePurchaseOrderStatus(id, status);
      toast.success(`Purchase order marked ${status}.`);
      await loadAll();
      if (poModal?.purchaseOrder.id === id) await loadPurchaseOrderDetail(id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update purchase order status');
    }
  };

  const receivePurchaseOrder = async (id: string) => {
    try {
      await warehouseApi.receivePurchaseOrder(id);
      toast.success('PO received. Inventory updated. Mark as invoiced to post accounting expense.');
      await loadAll();
      if (poModal?.purchaseOrder.id === id) await loadPurchaseOrderDetail(id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to receive purchase order');
    }
  };

  const importProductsFromCsv = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length < 2) {
        toast.error('CSV must contain a header and at least one product row.');
        return;
      }
      const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
      const index = (name: string) => headers.indexOf(name);
      if (index('sku') < 0 || index('name') < 0) {
        toast.error('CSV requires at least sku and name columns. Optional: barcode, category, costprice, retailprice, memberprice, minstock, maxstock.');
        return;
      }
      let created = 0;
      for (const line of lines.slice(1, 51)) {
        const cells = line.split(',').map((cell) => cell.trim());
        const cell = (name: string) => {
          const i = index(name);
          return i >= 0 ? cells[i] || '' : '';
        };
        await warehouseApi.createProduct({
          sku: cell('sku'),
          barcode: cell('barcode'),
          name: cell('name'),
          category: cell('category') || 'General',
          costPrice: numberValue(cell('costprice') || cell('cost_price')),
          retailPrice: numberValue(cell('retailprice') || cell('retail_price')),
          wholesalePrice: numberValue(cell('wholesaleprice') || cell('wholesale_price')),
          memberPrice: numberValue(cell('memberprice') || cell('member_price')),
          stockQuantity: numberValue(cell('stockquantity') || cell('stock_quantity')),
          minStock: numberValue(cell('minstock') || cell('min_stock')),
          maxStock: numberValue(cell('maxstock') || cell('max_stock')),
        });
        created += 1;
      }
      toast.success(`Imported ${created} product(s).`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to import CSV');
    }
  };

  const addToCart = (product: WarehouseProduct) => {
    if (product.stockQuantity <= 0) {
      toast.error('Product is out of stock.');
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) return current.map((item) => item.product.id === product.id ? { ...item, quantity: Math.min(product.stockQuantity, item.quantity + 1) } : item);
      return [...current, { product, quantity: 1, discount: 0 }];
    });
  };

  const addScannedProduct = () => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return;
    const exact = products.find((product) => [product.sku, product.barcode].some((value) => String(value || '').toLowerCase() === q));
    if (exact) addToCart(exact);
    else toast.error('No product found for scanned SKU/barcode.');
  };

  const applyPromoCode = () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) {
      toast.error('Enter a promo code first.');
      return;
    }
    const discountRate = code === 'MEMBER10' ? 0.1 : code === 'GYM5' ? 0.05 : code === 'STAFF15' ? 0.15 : 0;
    if (!discountRate) {
      toast.error('Promo code not recognized. Try MEMBER10, GYM5, or STAFF15 for demo scenarios.');
      return;
    }
    setCart((current) => current.map((item) => ({ ...item, discount: Math.round(item.quantity * productPrice(item.product) * discountRate * 100) / 100 })));
    toast.success(`${code} applied to current cart.`);
  };

  const holdCurrentOrder = () => {
    if (!cart.length) {
      toast.error('Add items before placing an order on hold.');
      return;
    }
    setHeldCarts((current) => [{ id: `hold-${Date.now()}`, createdAt: new Date().toISOString(), items: cart }, ...current].slice(0, 10));
    setCart([]);
    toast.success('Order placed on hold.');
  };

  const resumeHeldOrder = (holdId: string) => {
    const held = heldCarts.find((item) => item.id === holdId);
    if (!held) return;
    setCart(held.items);
    setHeldCarts((current) => current.filter((item) => item.id !== holdId));
    setSection('pos');
    toast.success('Held order restored to cart.');
  };

  const postSale = async () => {
    try {
      if (!cart.length) {
        toast.error('Add at least one item to the cart.');
        return;
      }
      const response = await warehouseApi.postSale({
        paymentMethod,
        priceTier: 'member',
        taxRate: taxRate,
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, unitPrice: productPrice(item.product), discount: item.discount })),
      });
      toast.success(`Sale posted: ${response.sale.receiptNumber}`);
      if (autoPrintReceipt) window.setTimeout(() => window.print(), 100);
      setCart([]);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to post POS sale');
    }
  };

  const exportReport = (report: 'inventory' | 'sales' | 'purchases', format: 'pdf' | 'csv') => {
    window.open(warehouseApi.reportUrl(report, format, reportFilters), '_blank', 'noopener,noreferrer');
  };

  const activeTitle = sections.find((item) => item.id === section)?.label || 'Warehouse';
  const searchPlaceholder = section === 'pos' ? 'Scan barcode or search products...' : section === 'suppliers' ? 'Search POs or Suppliers...' : 'Search SKU, product or category...';

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#44e878]/15 p-3 text-[#169b45]"><WarehouseIcon className="h-7 w-7" /></div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#169b45]">Warehouse & POS</p>
                <h1 className="text-3xl font-black text-slate-900">{activeTitle}</h1>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">Inventory, purchasing, POS and accounting synchronization in one operational workspace.</p>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-[280px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                ref={searchInputRef}
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && section === 'pos') addScannedProduct(); }}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => void loadAll()}>{loading ? 'Refreshing...' : 'Refresh'}</Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {allowedSections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id as SectionId)}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold transition ${section === item.id ? 'border-[#44e878] bg-[#44e878] text-[#04130b]' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'}`}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      </header>

      {error && <InlineAlert variant="error" title="Warehouse data error">{error}</InlineAlert>}
      {modalLoading && <InlineAlert variant="info" title="Loading details">Retrieving latest warehouse detail data...</InlineAlert>}

      {section === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardTile icon={<Boxes />} title="Stock Valuation" value={compactMoney(summary?.stockValue)} note="Inventory asset value" />
            <DashboardTile icon={<Receipt />} title="Today POS Sales" value={money(summary?.todaySalesTotal)} note={`${summary?.todaySalesCount || 0} sale(s) posted`} />
            <DashboardTile icon={<Truck />} title="Open POs" value={summary?.openPurchaseOrders || 0} note={money(summary?.openPurchaseOrderValue)} />
            <DashboardTile icon={<Tags />} title="Categories" value={categories.length} note="Active hierarchy nodes" />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel title="Inventory command center" eyebrow="Live stock position" action={hasClientPermission(profile?.role, 'warehouse.read') ? <Button onClick={() => setSection('inventory')} className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]">View Inventory</Button> : undefined}>
              <div className="grid gap-3 md:grid-cols-3">
                <DashboardTile icon={<Archive />} title="Total SKUs" value={inventoryKpis.totalSkus} note="Catalog items" />
                <DashboardTile icon={<Filter />} title="Low Stock" value={inventoryKpis.lowStock} note="Requires replenishment" />
                <DashboardTile icon={<Landmark />} title="Accounting Bridge" value="ON" note="POS, COGS and POs sync automatically" />
              </div>
            </Panel>
            <Panel title="Replenishment priority" eyebrow="Low stock / out of stock">
              {replenishmentPriority.length === 0 ? <p className="text-sm text-slate-500">No urgent replenishment items.</p> : (
                <div className="space-y-2">
                  {replenishmentPriority.map((product) => (
                    <button key={product.id} className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-50" onClick={() => void loadProductDetail(product.id)}>
                      <div><p className="font-bold text-slate-900">{product.name}</p><p className="text-xs text-slate-500">{product.sku} · {product.category}</p></div>
                      <Badge className={stockAccent(product)}>{stockLabel(product)}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {section === 'inventory' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#169b45]">Dashboard / Inventory</p>
              <h2 className="mt-2 text-3xl font-black text-slate-900">Inventory Management</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageInventory && (<>
                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="mr-2 h-4 w-4" /> Import CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { void importProductsFromCsv(event.target.files?.[0] || null); event.currentTarget.value = ''; }} /></label>
                <Button variant="outline" onClick={() => document.getElementById('stock-adjustment-panel')?.scrollIntoView({ behavior: 'smooth' })}><Archive className="mr-2 h-4 w-4" /> Stock Adjustment</Button>
                <Button className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={beginCreateProduct}><Plus className="mr-2 h-4 w-4" /> Add Product</Button>
              </>)}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DarkMetric label="Total SKUs" value={inventoryKpis.totalSkus.toLocaleString()} accent="green" />
            <DarkMetric label="Low Stock Items" value={inventoryKpis.lowStock.toLocaleString()} accent="yellow" />
            <DarkMetric label="Out of Stock" value={inventoryKpis.outOfStock.toLocaleString()} accent="red" />
            <DarkMetric label="Valuation" value={compactMoney(inventoryKpis.valuation)} accent="green" />
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setCategory('all')} className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider ${category === 'all' ? 'bg-[#44e878] text-[#04130b]' : 'bg-slate-50 text-slate-600 hover:bg-slate-200'}`}>All Products</button>
              {categoryOptions.slice(0, 10).map((item) => (
                <button key={item.id} onClick={() => setCategory(item.id)} className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider ${category === item.id ? 'bg-[#44e878] text-[#04130b]' : 'bg-slate-50 text-slate-600 hover:bg-slate-200'}`}>{categoryLabel(categories, item.id, item.name)}</button>
              ))}
            </div>
            <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={stockStatus} onChange={(event) => setStockStatus(event.target.value)}>
              <option value="all">All stock</option><option value="active">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option><option value="overstock">Overstock</option>
            </select>
          </div>

          <Panel title="Product Catalog" eyebrow={`Showing ${filteredProducts.length.toLocaleString()} of ${products.length.toLocaleString()} item(s)`}>
            {filteredProducts.length === 0 ? <EmptyState title="No products found" description="Create a product or clear filters." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-600"><tr><th className="px-4 py-3">Image</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Product Name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Retail</th><th className="px-4 py-3">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-200">
                    {pagedProducts.map((product) => (
                      <tr key={product.id} className={`${normalizedStatus(product.stockStatus) === 'out_of_stock' ? 'bg-red-500/5' : normalizedStatus(product.stockStatus) === 'low_stock' ? 'bg-yellow-500/5' : 'bg-white'} hover:bg-slate-50`}>
                        <td className="px-4 py-4 align-top"><ProductThumb product={product} /></td><td className="px-4 py-4 align-top"><button className="font-black text-[#169b45] hover:underline" onClick={() => void loadProductDetail(product.id)}>{product.sku}</button><div className="text-xs text-slate-500">{product.barcode || 'No barcode'}</div></td>
                        <td className="px-4 py-4 align-top"><div className="font-bold text-slate-900">{product.name}</div><div className="text-xs text-slate-500">{product.supplierName || 'No supplier'}</div></td>
                        <td className="px-4 py-4 align-top"><span className="rounded bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-700">{categoryLabel(categories, product.categoryId || product.category, product.category)}</span></td>
                        <td className={`px-4 py-4 text-right align-top font-black ${normalizedStatus(product.stockStatus) === 'low_stock' ? 'text-amber-600' : normalizedStatus(product.stockStatus) === 'out_of_stock' ? 'text-red-600' : 'text-slate-900'}`}>{product.stockQuantity}</td>
                        <td className="px-4 py-4 align-top"><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${stockAccent(product)}`}>{stockLabel(product)}</span></td>
                        <td className="px-4 py-4 text-right align-top font-bold text-slate-700">{money(product.costPrice)}</td>
                        <td className="px-4 py-4 text-right align-top font-bold text-slate-700">{money(product.retailPrice)}</td>
                        <td className="px-4 py-4 align-top"><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => void loadProductDetail(product.id)}><Eye className="h-4 w-4" /></Button>{canPurchase && <Button size="sm" variant="outline" title="Create replenishment PO" onClick={() => startReplenishment(product)}><PackagePlus className="h-4 w-4" /></Button>}{canManageInventory && <Button size="sm" variant="outline" onClick={() => beginEditProduct(product)}><Edit3 className="h-4 w-4" /></Button>}{canManageInventory && <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => void deleteProduct(product)}><Trash2 className="h-4 w-4" /></Button>}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filteredProducts.length > 0 && <ListPagination page={safeInventoryPage} pageSize={inventoryPageSize} total={filteredProducts.length} onPageChange={setInventoryPage} onPageSizeChange={setInventoryPageSize} />}
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Panel title="Category Management" eyebrow="Hierarchy / sub-categories / reporting">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-2">
                  {categories.length === 0 ? <EmptyState title="No categories" description="Create the first inventory category." /> : categories.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                      <div><p className="font-bold text-slate-900">{item.parentName ? `${item.parentName} / ${item.name}` : item.name}</p><p className="text-xs text-slate-500">{item.productCount || 0} product(s) · {item.description || 'No description'}</p></div>
                      {canManageInventory && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setCategoryForm({ id: item.id, name: item.name, parentId: item.parentId || '', description: item.description || '', status: item.status || 'active' })}><Edit3 className="h-4 w-4" /></Button><Button size="sm" variant="outline" className="border-red-200 text-red-600" onClick={() => void deleteCategory(item)}><Trash2 className="h-4 w-4" /></Button></div>}
                    </div>
                  ))}
                </div>
                {canManageInventory && <CategoryEditor form={categoryForm} categories={categories} setForm={setCategoryForm} onSave={saveCategory} onCancel={() => setCategoryForm(initialCategoryForm)} />}
              </div>
            </Panel>

            {canManageInventory && <div className="space-y-6">
              <Panel id="product-editor-panel" title={productForm.id ? 'Edit Product' : 'Add Product'} eyebrow="Catalog, stock and pricing">
                <ProductFormFields productForm={productForm} suppliers={suppliers} categories={categories} setProductForm={setProductForm} />
                <div className="mt-4 flex gap-2"><Button className="flex-1 bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={saveProduct}><Save className="mr-2 h-4 w-4" /> {productForm.id ? 'Update Product' : 'Create Product'}</Button>{productForm.id && <Button variant="outline" onClick={() => setProductForm(initialProductForm)}>Cancel</Button>}</div>
              </Panel>
              <Panel id="stock-adjustment-panel" title="Stock Adjustment" eyebrow="Inventory correction / transfer note">
                <Label className="text-slate-600">Product</Label>
                <select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={adjustment.productId} onChange={(event) => setAdjustment((form) => ({ ...form, productId: event.target.value }))}>
                  <option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
                </select>
                <div className="mt-3 grid grid-cols-2 gap-3"><TextInput label="Quantity delta" type="number" value={adjustment.quantityDelta} onChange={(value) => setAdjustment((form) => ({ ...form, quantityDelta: value }))} /><TextInput label="Reason" value={adjustment.reason} onChange={(value) => setAdjustment((form) => ({ ...form, reason: value }))} /></div>
                <Button className="mt-4 w-full" variant="outline" onClick={submitAdjustment}>Post Adjustment</Button>
              </Panel>
            </div>}
          </div>
        </div>
      )}

      {section === 'pos' && (
        <div className="grid min-h-[720px] gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex flex-col border-b border-slate-200 xl:border-b-0 xl:border-r">
            <div className="border-b border-slate-200 p-4"><div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-[#44e878] p-3 text-[#071624]"><UserRound className="h-5 w-5" /></div><div><p className="text-xs font-black uppercase tracking-wider text-[#169b45]">Price tier: Member</p><p className="font-bold text-slate-900">{posProducts.length} live item(s)</p></div></div><Barcode className="h-5 w-5 text-[#169b45]" /></div></div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {cart.length === 0 ? <EmptyState title="Cart empty" description="Scan a barcode or select products to add them to the sale." /> : cart.map((item) => (
                <div key={item.product.id} className="border-l-4 border-[#44e878] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><button className="font-black text-slate-900 hover:text-[#169b45]" onClick={() => void loadProductDetail(item.product.id)}>{item.product.name}</button><p className="text-sm text-slate-500">{item.product.sku} · Member Price</p></div><p className="font-bold text-slate-900">{money(productPrice(item.product) * item.quantity - item.discount)}</p></div>
                  <div className="mt-3 flex items-center justify-between"><div className="flex items-center overflow-hidden rounded bg-slate-100"><button className="px-3 py-1 text-[#169b45]" onClick={() => setCart((current) => current.map((cartItem) => cartItem.product.id === item.product.id ? { ...cartItem, quantity: Math.max(1, cartItem.quantity - 1) } : cartItem))}>-</button><span className="px-3 text-sm font-bold">{item.quantity}</span><button className="px-3 py-1 text-[#169b45]" onClick={() => setCart((current) => current.map((cartItem) => cartItem.product.id === item.product.id ? { ...cartItem, quantity: Math.min(item.product.stockQuantity, cartItem.quantity + 1) } : cartItem))}>+</button></div><button className="text-xs text-red-500" onClick={() => setCart((current) => current.filter((cartItem) => cartItem.product.id !== item.product.id))}>Remove</button></div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 p-4">
              <select className="mb-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="wallet">Digital Wallet</option><option value="bank_transfer">Bank Transfer</option></select>
              <div className="space-y-2 text-sm"><LineTotal label="Subtotal" value={money(cartTotals.subtotal)} /><LineTotal label="Member Discount" value={`-${money(cartTotals.memberDiscount)}`} highlight /><LineTotal label={`Tax (${(taxRate * 100).toFixed(0)}%)`} value={money(cartTotals.tax)} /><LineTotal label="TOTAL" value={money(cartTotals.total)} large /></div>
              <Button className="mt-4 h-14 w-full bg-[#44e878] text-lg font-black text-[#04130b] hover:bg-[#32d967]" onClick={postSale}><ShoppingCart className="mr-2 h-5 w-5" /> PAY NOW</Button>
            </div>
          </aside>
          <div className="flex min-w-0 flex-col bg-transparent">
            <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4"><button onClick={() => setCategory('all')} className={`rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wide ${category === 'all' ? 'bg-[#44e878] text-[#04130b]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All Products</button>{categoryOptions.slice(0, 8).map((item) => <button key={item.id} onClick={() => setCategory(item.id)} className={`rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wide ${category === item.id ? 'bg-[#44e878] text-[#04130b]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{categoryLabel(categories, item.id, item.name)}</button>)}</div>
            <div className="grid flex-1 gap-4 overflow-y-auto p-6 md:grid-cols-2 xl:grid-cols-4">
              {pagedPosProducts.map((product) => (
                <div key={product.id} className={`group min-h-64 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#44e878] ${product.stockQuantity <= 0 ? 'opacity-55' : ''}`}>
                  <button type="button" className="w-full text-left" disabled={product.stockQuantity <= 0} onClick={() => addToCart(product)}>
                    <div className="relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 to-slate-200">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <span className="text-4xl font-black text-[#44e878]/70">{product.name.slice(0, 1)}</span>}<span className={`absolute right-2 top-2 rounded px-2 py-1 text-[10px] font-black uppercase ${product.stockQuantity <= 0 ? 'bg-red-100 text-red-700' : 'bg-[#44e878] text-[#04130b]'}`}>{product.stockQuantity <= 0 ? 'Out of stock' : `Stock: ${product.stockQuantity}`}</span></div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">{product.category}</p><h3 className="mt-1 text-lg font-black leading-tight text-slate-900">{product.name}</h3><p className="mt-3 text-xl font-black text-[#169b45]">{money(productPrice(product))}</p>{product.memberPrice > 0 && <p className="text-xs text-slate-500 line-through">Retail {money(product.retailPrice)}</p>}
                  </button>
                  <button type="button" className="mt-3 text-xs font-black uppercase tracking-wider text-[#169b45] hover:underline" onClick={() => void loadProductDetail(product.id)}>View Details</button>
                </div>
              ))}
            </div>
            {posProducts.length > 0 && <ListPagination page={safePosPage} pageSize={posPageSize} total={posProducts.length} onPageChange={setPosPage} onPageSizeChange={setPosPageSize} />}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white p-4"><Toggle checked={autoPrintReceipt} onChange={setAutoPrintReceipt} label="Auto-print receipt" icon={<Printer className="h-4 w-4" />} /><div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => { searchInputRef.current?.focus(); toast.success('Scanner ready. Scan barcode and press Enter.'); }}><Barcode className="mr-2 h-4 w-4" /> Barcode Scanner</Button><Button variant="outline" onClick={holdCurrentOrder}><Pause className="mr-2 h-4 w-4" /> Hold Order</Button><div className="flex gap-2"><Input value={promoCode} onChange={(event) => setPromoCode(event.target.value)} placeholder="Promo code" className="h-10 w-36" /><Button variant="outline" onClick={applyPromoCode}>Apply Promo</Button></div></div></div>
            {heldCarts.length > 0 && <div className="border-t border-slate-200 bg-white p-4"><p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Held Orders</p><div className="flex flex-wrap gap-2">{heldCarts.map((hold, index) => <Button key={hold.id} size="sm" variant="outline" onClick={() => resumeHeldOrder(hold.id)}>Resume #{heldCarts.length - index}</Button>)}</div></div>}
          </div>
        </div>
      )}

      {section === 'suppliers' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
          <Panel title="Purchase Orders" eyebrow="Click an order number to view full details" action={<Button variant="outline" onClick={() => exportReport('purchases', 'csv')}><Download className="mr-2 h-4 w-4" /> Export</Button>}>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Status</span><select className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={poStatusFilter} onChange={(event) => setPoStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="shipped">Shipped</option><option value="received">Received</option><option value="invoiced">Invoiced</option></select></label>
              <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">Supplier</span><select className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={poSupplierFilter} onChange={(event) => setPoSupplierFilter(event.target.value)}><option value="all">All suppliers</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">From</span><Input type="date" value={poFrom} onChange={(event) => setPoFrom(event.target.value)} /></label>
              <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">To</span><Input type="date" value={poTo} onChange={(event) => setPoTo(event.target.value)} /></label>
            </div>
            {filteredPurchaseOrders.length === 0 ? <EmptyState title="No purchase orders" description="Create a PO or adjust the filters to see supplier replenishment cycles." /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-600"><tr><th className="px-4 py-3">Order ID</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Date Issued</th><th className="px-4 py-3 text-right">Total Value</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-200">{pagedPurchaseOrders.map((po) => <tr key={po.id} className="bg-white hover:bg-slate-50"><td className="px-4 py-4"><button className="font-black text-[#169b45] hover:underline" onClick={() => void loadPurchaseOrderDetail(po.id)}>#{po.poNumber}</button></td><td className="px-4 py-4 font-bold text-slate-900">{po.supplierName || 'Unknown Supplier'}</td><td className="px-4 py-4 text-slate-600">{dateShort(po.orderDate)}</td><td className="px-4 py-4 text-right font-bold text-slate-900">{money(po.total)}</td><td className="px-4 py-4"><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${poStatusClass(po.status)}`}>{po.status}</span></td><td className="px-4 py-4"><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => void loadPurchaseOrderDetail(po.id)}><Eye className="h-4 w-4" /></Button>{normalizedStatus(po.status) === 'pending' && <Button size="sm" className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={() => updatePurchaseOrderStatus(po.id, 'shipped')}>Ship</Button>}{normalizedStatus(po.status) === 'shipped' && <Button size="sm" className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={() => updatePurchaseOrderStatus(po.id, 'received')}>Receive</Button>}{normalizedStatus(po.status) === 'received' && <Button size="sm" className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={() => updatePurchaseOrderStatus(po.id, 'invoiced')}>Invoice</Button>}</div></td></tr>)}</tbody></table></div>
            )}
            {filteredPurchaseOrders.length > 0 && <ListPagination page={safePoPage} pageSize={poPageSize} total={filteredPurchaseOrders.length} onPageChange={setPoPage} onPageSizeChange={setPoPageSize} />}
          </Panel>
          <div className="space-y-4">
            <Panel title="Supplier Performance" eyebrow="Primary KPIs"><MiniBar label="Avg. Fulfillment Time" value={Number(supplierPerformance.fulfillmentDays) ? Math.max(0, 100 - Number(supplierPerformance.fulfillmentDays) * 10) : 0} suffix="%" /><MiniBar label="Order Accuracy" value={Number(supplierPerformance.accuracy)} suffix="%" /><div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Open purchase exposure: <strong className="text-slate-900">{money(supplierPerformance.pendingValue)}</strong></div></Panel>
            <Panel title="Primary Contacts" eyebrow="Suppliers"><div className="space-y-3">{suppliers.slice(0, 5).map((supplier) => <div key={supplier.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3"><div className="flex items-center gap-3"><div className="rounded bg-emerald-50 p-2 text-[#169b45]"><UserRound className="h-4 w-4" /></div><div><p className="font-bold text-slate-900">{supplier.contactName || supplier.name}</p><p className="text-xs text-slate-500">{supplier.name}</p></div></div><FileText className="h-4 w-4 text-slate-500" /></div>)}</div></Panel>
            <Panel id="purchase-order-panel" title="New Purchase Order" eyebrow="PO workflow"><PurchaseOrderForm products={products} suppliers={suppliers} poForm={poForm} setPoForm={setPoForm} onSubmit={createPurchaseOrder} /></Panel>
            <Panel title="New Supplier" eyebrow="Contracts & terms"><SupplierFormFields supplierForm={supplierForm} setSupplierForm={setSupplierForm} /><Button className="mt-4 w-full bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={saveSupplier}>Create Supplier</Button></Panel>
          </div>
        </div>
      )}

      {section === 'reports' && (
        <div className="space-y-6">
          <Panel title="Reporting & Analytics" eyebrow="PDF / CSV exports for stakeholders">
            <div className="grid gap-3 md:grid-cols-3"><TextInput label="From" type="date" value={reportFilters.from} onChange={(value) => setReportFilters((filters) => ({ ...filters, from: value }))} /><TextInput label="To" type="date" value={reportFilters.to} onChange={(value) => setReportFilters((filters) => ({ ...filters, to: value }))} /><label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Category</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={reportFilters.category} onChange={(event) => setReportFilters((filters) => ({ ...filters, category: event.target.value }))}><option value="all">All categories</option>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{categoryLabel(categories, item.id, item.name)}</option>)}</select></label></div>
            <div className="mt-5 grid gap-3 md:grid-cols-3"><ReportTile title="Inventory Valuation" description="Stock valuation, aging and reorder status." onPdf={() => exportReport('inventory', 'pdf')} onCsv={() => exportReport('inventory', 'csv')} /><ReportTile title="POS Sales" description="Sales trends with category filters." onPdf={() => exportReport('sales', 'pdf')} onCsv={() => exportReport('sales', 'csv')} /><ReportTile title="Purchases" description="Supplier spend, POs and receiving history." onPdf={() => exportReport('purchases', 'pdf')} onCsv={() => exportReport('purchases', 'csv')} /></div>
          </Panel>
          <Panel title="Recent POS Sales" eyebrow="Revenue / COGS / margin">
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">From</span><Input type="date" value={salesFrom} onChange={(event) => setSalesFrom(event.target.value)} /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">To</span><Input type="date" value={salesTo} onChange={(event) => setSalesTo(event.target.value)} /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Payment</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={salesPaymentFilter} onChange={(event) => setSalesPaymentFilter(event.target.value)}><option value="all">All methods</option><option value="cash">Cash</option><option value="card">Card</option><option value="wallet">Digital wallet</option><option value="bank_transfer">Bank transfer</option></select></label>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-600"><tr><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">COGS</th><th className="px-4 py-3 text-right">Margin</th></tr></thead><tbody className="divide-y divide-slate-200">{pagedSales.map((sale) => <tr key={sale.id} className="bg-white"><td className="px-4 py-4 font-bold text-[#169b45]">{sale.receiptNumber}</td><td className="px-4 py-4">{sale.saleDate ? new Date(sale.saleDate).toLocaleString() : '-'}</td><td className="px-4 py-4 capitalize">{sale.paymentMethod}</td><td className="px-4 py-4 text-right font-bold">{money(sale.total)}</td><td className="px-4 py-4 text-right">{money(sale.cogsTotal)}</td><td className="px-4 py-4 text-right text-[#169b45]">{money((sale.total || 0) - (sale.cogsTotal || 0))}</td></tr>)}</tbody></table></div>
            {filteredSales.length > 0 && <ListPagination page={safeSalesPage} pageSize={salesPageSize} total={filteredSales.length} onPageChange={setSalesPage} onPageSizeChange={setSalesPageSize} />}
          </Panel>
        </div>
      )}

      {productModal && <ProductDetailModal detail={productModal} categories={categories} canEdit={canManageInventory} canAddToCart={hasClientPermission(profile?.role, 'warehouse.pos')} onClose={() => setProductModal(null)} onEdit={() => { beginEditProduct(productModal.product); setProductModal(null); }} onAddToCart={(product) => { addToCart(product); setProductModal(null); setSection('pos'); }} />}
      {poModal && <PurchaseOrderDetailModal detail={poModal} onClose={() => setPoModal(null)} onUpdateStatus={(status) => updatePurchaseOrderStatus(poModal.purchaseOrder.id, status)} onReceive={() => receivePurchaseOrder(poModal.purchaseOrder.id)} />}
    </div>
  );
}

function Panel({ title, eyebrow, action, children, id }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return <section id={id} className="rounded-lg border border-slate-200 bg-white shadow-sm"><header className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div>{eyebrow && <p className="text-xs font-black uppercase tracking-[0.2em] text-[#169b45]">{eyebrow}</p>}<h2 className="text-xl font-black text-slate-900">{title}</h2></div>{action}</header><div className="p-4">{children}</div></section>;
}

function DarkMetric({ label, value, accent }: { label: string; value: string; accent: 'green' | 'yellow' | 'red' }) {
  const color = accent === 'green' ? 'border-l-[#36ec72] text-slate-900' : accent === 'yellow' ? 'border-l-amber-400 text-amber-700' : 'border-l-red-400 text-red-700';
  return <div className={`border-l-4 ${color} bg-white p-4 shadow-sm`}><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>;
}


function ProductThumb({ product }: { product: WarehouseProduct }) {
  return <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <span className="text-lg font-black text-[#44e878]">{product.name.slice(0, 1)}</span>}</div>;
}

function DashboardTile({ icon, title, value, note }: { icon: ReactNode; title: string; value: string | number; note: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded bg-[#44e878]/15 text-[#169b45]">{icon}</div><p className="text-xs font-black uppercase tracking-wider text-slate-500">{title}</p><p className="mt-2 text-2xl font-black text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>;
}

function MiniBar({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return <div className="mt-3"><div className="mb-2 flex justify-between text-sm"><span className="text-slate-600">{label}</span><span className="font-black text-[#169b45]">{value.toFixed(1)}{suffix}</span></div><div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-[#44e878]" style={{ width: `${bounded}%` }} /></div></div>;
}

function LineTotal({ label, value, highlight = false, large = false }: { label: string; value: string; highlight?: boolean; large?: boolean }) {
  return <div className={`flex justify-between ${large ? 'border-t border-slate-200 pt-3 text-2xl font-black text-[#169b45]' : highlight ? 'text-[#169b45]' : 'text-slate-600'}`}><span className="font-bold uppercase tracking-wider">{label}</span><span>{value}</span></div>;
}

function Toggle({ checked, onChange, label, icon }: { checked: boolean; onChange: (value: boolean) => void; label: string; icon?: ReactNode }) {
  return <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-sm font-bold text-slate-700"><span className={`flex h-6 w-12 items-center rounded-full p-1 ${checked ? 'bg-[#44e878]' : 'bg-slate-200'}`}><span className={`h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-6' : ''}`} /></span>{icon}{label}</button>;
}

function TextInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  if (type === 'date') {
    return <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span><DateInput value={value} onChange={onChange} className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-500" /></label>;
  }
  return <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-500" /></label>;
}

function CategoryEditor({ form, categories, setForm, onSave, onCancel }: { form: CategoryForm; categories: WarehouseCategory[]; setForm: Dispatch<SetStateAction<CategoryForm>>; onSave: () => void; onCancel: () => void }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="mb-3 text-sm font-black text-slate-900">{form.id ? 'Edit Category' : 'New Category'}</p><div className="space-y-3"><TextInput label="Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} /><label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Parent category</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={form.parentId} onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}><option value="">Root category</option>{categories.filter((item) => item.id !== form.id).map((item) => <option key={item.id} value={item.id}>{item.parentName ? `${item.parentName} / ${item.name}` : item.name}</option>)}</select></label><TextInput label="Description" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} /><div className="flex gap-2"><Button className="flex-1 bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={onSave}><Save className="mr-2 h-4 w-4" /> Save</Button>{form.id && <Button variant="outline" onClick={onCancel}>Cancel</Button>}</div></div></div>;
}

function ProductFormFields({ productForm, setProductForm, suppliers, categories }: { productForm: ProductForm; suppliers: WarehouseSupplier[]; categories: WarehouseCategory[]; setProductForm: Dispatch<SetStateAction<ProductForm>> }) {
  return <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><TextInput label="SKU" value={productForm.sku} onChange={(value) => setProductForm((form) => ({ ...form, sku: value }))} /><TextInput label="Barcode" value={productForm.barcode} onChange={(value) => setProductForm((form) => ({ ...form, barcode: value }))} /></div><TextInput label="Name" value={productForm.name} onChange={(value) => setProductForm((form) => ({ ...form, name: value }))} /><TextInput label="Description" value={productForm.description} onChange={(value) => setProductForm((form) => ({ ...form, description: value }))} /><TextInput label="Image URL or JPEG/PNG data URL" value={productForm.imageUrl} onChange={(value) => setProductForm((form) => ({ ...form, imageUrl: value }))} /><div className="rounded-lg border border-dashed border-slate-300 bg-white p-3"><div className="flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-slate-100">{productForm.imageUrl ? <img src={productForm.imageUrl} alt="Product preview" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-slate-400" />}</div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Product image</p><p className="text-xs text-slate-500">JPEG/PNG, max 1.5 MB. Upload replaces the current image.</p></div><label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Upload<input className="hidden" type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_500_000) { toast.error('Product image must be smaller than 1.5 MB.'); return; } const reader = new FileReader(); reader.onload = () => setProductForm((form) => ({ ...form, imageUrl: String(reader.result || '') })); reader.readAsDataURL(file); event.currentTarget.value = ''; }} /></label></div></div><label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Category</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={productForm.categoryId} onChange={(event) => { const selected = categories.find((item) => item.id === event.target.value); setProductForm((form) => ({ ...form, categoryId: event.target.value, category: selected?.name || form.category })); }}><option value="">Manual / General</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.parentName ? `${item.parentName} / ${item.name}` : item.name}</option>)}</select></label><TextInput label="Category fallback" value={productForm.category} onChange={(value) => setProductForm((form) => ({ ...form, category: value }))} /><label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Supplier</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={productForm.supplierId} onChange={(event) => setProductForm((form) => ({ ...form, supplierId: event.target.value }))}><option value="">No supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><TextInput label="Stock" type="number" value={productForm.stockQuantity} onChange={(value) => setProductForm((form) => ({ ...form, stockQuantity: value }))} /><TextInput label="Unit" value={productForm.unit} onChange={(value) => setProductForm((form) => ({ ...form, unit: value }))} /><TextInput label="Cost" type="number" value={productForm.costPrice} onChange={(value) => setProductForm((form) => ({ ...form, costPrice: value }))} /><TextInput label="Retail" type="number" value={productForm.retailPrice} onChange={(value) => setProductForm((form) => ({ ...form, retailPrice: value }))} /><TextInput label="Wholesale" type="number" value={productForm.wholesalePrice} onChange={(value) => setProductForm((form) => ({ ...form, wholesalePrice: value }))} /><TextInput label="Member" type="number" value={productForm.memberPrice} onChange={(value) => setProductForm((form) => ({ ...form, memberPrice: value }))} /><TextInput label="Min stock" type="number" value={productForm.minStock} onChange={(value) => setProductForm((form) => ({ ...form, minStock: value }))} /><TextInput label="Max stock" type="number" value={productForm.maxStock} onChange={(value) => setProductForm((form) => ({ ...form, maxStock: value }))} /><TextInput label="Location" value={productForm.location} onChange={(value) => setProductForm((form) => ({ ...form, location: value }))} /><TextInput label="Expiry date" type="date" value={productForm.expiryDate} onChange={(value) => setProductForm((form) => ({ ...form, expiryDate: value }))} /></div></div>;
}

function PurchaseOrderForm({ products, suppliers, poForm, setPoForm, onSubmit }: { products: WarehouseProduct[]; suppliers: WarehouseSupplier[]; poForm: { supplierId: string; productId: string; quantity: string; unitCost: string; expectedDate: string }; setPoForm: Dispatch<SetStateAction<{ supplierId: string; productId: string; quantity: string; unitCost: string; expectedDate: string }>>; onSubmit: () => void }) {
  return <div className="space-y-3"><label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Supplier</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={poForm.supplierId} onChange={(event) => setPoForm((form) => ({ ...form, supplierId: event.target.value }))}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Product</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={poForm.productId} onChange={(event) => { const product = products.find((item) => item.id === event.target.value); setPoForm((form) => ({ ...form, productId: event.target.value, unitCost: String(product?.costPrice || form.unitCost) })); }}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><TextInput label="Quantity" type="number" value={poForm.quantity} onChange={(value) => setPoForm((form) => ({ ...form, quantity: value }))} /><TextInput label="Unit cost" type="number" value={poForm.unitCost} onChange={(value) => setPoForm((form) => ({ ...form, unitCost: value }))} /></div><TextInput label="Expected date" type="date" value={poForm.expectedDate} onChange={(value) => setPoForm((form) => ({ ...form, expectedDate: value }))} /><Button className="w-full bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={onSubmit}><ClipboardList className="mr-2 h-4 w-4" /> Create PO</Button></div>;
}

function SupplierFormFields({ supplierForm, setSupplierForm }: { supplierForm: SupplierForm; setSupplierForm: Dispatch<SetStateAction<SupplierForm>> }) {
  return <div className="space-y-3"><TextInput label="Name" value={supplierForm.name} onChange={(value) => setSupplierForm((form) => ({ ...form, name: value }))} /><TextInput label="Contact" value={supplierForm.contactName} onChange={(value) => setSupplierForm((form) => ({ ...form, contactName: value }))} /><div className="grid grid-cols-2 gap-3"><TextInput label="Email" value={supplierForm.email} onChange={(value) => setSupplierForm((form) => ({ ...form, email: value }))} /><TextInput label="Phone" value={supplierForm.phone} onChange={(value) => setSupplierForm((form) => ({ ...form, phone: value }))} /></div><TextInput label="Payment terms" value={supplierForm.paymentTerms} onChange={(value) => setSupplierForm((form) => ({ ...form, paymentTerms: value }))} /><TextInput label="Delivery schedule" value={supplierForm.deliverySchedule} onChange={(value) => setSupplierForm((form) => ({ ...form, deliverySchedule: value }))} /></div>;
}

function ReportTile({ title, description, onPdf, onCsv }: { title: string; description: string; onPdf: () => void; onCsv: () => void }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start gap-3"><div className="rounded bg-[#44e878]/15 p-2 text-[#169b45]"><FileText className="h-5 w-5" /></div><div><h3 className="font-black text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div></div><div className="mt-4 flex gap-2"><Button size="sm" className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={onPdf}><Download className="mr-1 h-4 w-4" /> PDF</Button><Button size="sm" variant="outline" onClick={onCsv}>CSV</Button></div></div>;
}

function ModalShell({ title, subtitle, onClose, children, actions }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4"><div className="mt-8 w-full max-w-5xl rounded-xl bg-white shadow-2xl"><header className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#169b45]">Warehouse detail</p><h2 className="text-2xl font-black text-slate-900">{title}</h2>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div><div className="flex gap-2">{actions}<Button variant="outline" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button></div></header><div className="p-5">{children}</div></div></div>;
}

function ProductDetailModal({ detail, categories, canEdit, canAddToCart, onClose, onEdit, onAddToCart }: { detail: WarehouseProductDetail; categories: WarehouseCategory[]; canEdit: boolean; canAddToCart: boolean; onClose: () => void; onEdit: () => void; onAddToCart: (product: WarehouseProduct) => void }) {
  const product = detail.product;
  return <ModalShell title={`${product.sku} - ${product.name}`} subtitle={`${categoryLabel(categories, product.categoryId || product.category, product.category)} · ${product.supplierName || 'No supplier'}`} onClose={onClose} actions={<><Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button><Button size="sm" variant="outline" onClick={() => window.open(warehouseApi.productPdfUrl(product.id), '_blank', 'noopener,noreferrer')}><Download className="mr-1 h-4 w-4" /> PDF</Button>{canAddToCart && product.stockQuantity > 0 && <Button size="sm" variant="outline" onClick={() => onAddToCart(product)}><ShoppingCart className="mr-1 h-4 w-4" /> Add</Button>}{canEdit && <Button size="sm" className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={onEdit}><Edit3 className="mr-1 h-4 w-4" /> Edit</Button>}</>}>
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"><div className="flex min-h-44 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <div className="text-center text-slate-400"><ImageIcon className="mx-auto h-10 w-10" /><p className="mt-2 text-xs font-bold">No image</p></div>}</div><div className="grid gap-4 md:grid-cols-4"><DashboardTile icon={<Boxes />} title="Current Stock" value={product.stockQuantity} note={`${product.unit || 'pcs'} available`} /><DashboardTile icon={<Landmark />} title="Stock Value" value={money(product.stockQuantity * product.costPrice)} note="Cost valuation" /><DashboardTile icon={<Receipt />} title="Retail Price" value={money(product.retailPrice)} note="Default POS price" /><DashboardTile icon={<Archive />} title="Status" value={stockLabel(product)} note={product.expiryDate ? `Expiry ${dateShort(product.expiryDate)}` : 'No expiry'} /></div>
    </div><div className="mt-5 grid gap-5 lg:grid-cols-2">
      <DetailTable title="Transaction history" rows={detail.movements.slice(0, 12)} columns={[['movement_type', 'Type'], ['quantity_delta', 'Qty'], ['stock_after', 'After'], ['created_at', 'Date']]} />
      <DetailTable title="Purchase history" rows={detail.purchases.slice(0, 12)} columns={[['po_number', 'PO'], ['supplier_name', 'Supplier'], ['quantity_ordered', 'Qty'], ['line_total', 'Total']]} />
      <DetailTable title="Sales history" rows={detail.sales.slice(0, 12)} columns={[['receipt_number', 'Receipt'], ['quantity', 'Qty'], ['line_total', 'Total'], ['sale_date', 'Date']]} />
      <DetailTable title="Linked accounting entries" rows={detail.accountingEntries.slice(0, 12)} columns={[['type', 'Type'], ['category', 'Category'], ['amount', 'Amount'], ['transaction_date', 'Date']]} />
    </div>
  </ModalShell>;
}

function PurchaseOrderDetailModal({ detail, onClose, onReceive, onUpdateStatus }: { detail: PurchaseOrderDetail; onClose: () => void; onReceive: () => void; onUpdateStatus: (status: 'shipped' | 'received' | 'invoiced') => void }) {
  const po = detail.purchaseOrder;
  return <ModalShell title={`Purchase Order ${po.poNumber}`} subtitle={`${detail.supplier.name || po.supplierName || 'Unknown Supplier'} · ${po.status}`} onClose={onClose} actions={<><Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button><Button size="sm" variant="outline" onClick={() => window.open(warehouseApi.purchaseOrderPdfUrl(po.id), '_blank', 'noopener,noreferrer')}><Download className="mr-1 h-4 w-4" /> PDF</Button>{normalizedStatus(po.status) === 'pending' && <Button size="sm" className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={() => onUpdateStatus('shipped')}>Mark Shipped</Button>}{normalizedStatus(po.status) === 'shipped' && <Button size="sm" className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={() => onUpdateStatus('received')}>Receive</Button>}{normalizedStatus(po.status) === 'received' && <Button size="sm" className="bg-[#44e878] text-[#04130b] hover:bg-[#32d967]" onClick={() => onUpdateStatus('invoiced')}>Mark Invoiced</Button>}</>}>
    <div className="grid gap-4 md:grid-cols-4"><DashboardTile icon={<Truck />} title="Supplier" value={detail.supplier.name || '-'} note={detail.supplier.paymentTerms || 'No terms'} /><DashboardTile icon={<ClipboardList />} title="Order Date" value={dateShort(po.orderDate)} note={`Expected ${dateShort(po.expectedDate)}`} /><DashboardTile icon={<Receipt />} title="Total" value={money(po.total)} note={`Tax ${money(po.taxTotal)}`} /><DashboardTile icon={<Landmark />} title="Accounting" value={detail.accountingEntries.length} note="Linked entries" /></div>
    <div className="mt-5"><DetailTable title="Products on order" rows={detail.items} columns={[['sku', 'SKU'], ['productName', 'Product'], ['category', 'Category'], ['quantityOrdered', 'Qty'], ['unitCost', 'Unit Cost'], ['lineTotal', 'Total']]} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><DetailTable title="Status workflow history" rows={detail.statusHistory || []} columns={[['fromStatus', 'From'], ['toStatus', 'To'], ['changedBy', 'User'], ['changedAt', 'Timestamp'], ['notes', 'Notes']]} /><DetailTable title="Linked accounting entries" rows={detail.accountingEntries} columns={[['type', 'Type'], ['category', 'Category'], ['amount', 'Amount'], ['transaction_date', 'Date'], ['description', 'Description']]} /></div>
  </ModalShell>;
}

function DetailTable({ title, rows, columns }: { title: string; rows: Array<Record<string, any>>; columns: Array<[string, string]> }) {
  return <section className="rounded-lg border border-slate-200"><header className="border-b border-slate-200 bg-slate-50 px-3 py-2"><h3 className="font-black text-slate-900">{title}</h3></header>{rows.length === 0 ? <p className="p-3 text-sm text-slate-500">No records found.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="bg-white text-slate-500"><tr>{columns.map(([, label]) => <th key={label} className="px-3 py-2 font-black uppercase tracking-wider">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={`${title}-${index}`} className="bg-white">{columns.map(([key]) => <td key={key} className="px-3 py-2 text-slate-700">{String(row[key] ?? '-')}</td>)}</tr>)}</tbody></table></div>}</section>;
}
