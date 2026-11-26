import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../api/axios';
import {
  Plus,
  Trash2,
  X,
  ChevronDown,
  Ruler,
  Search,
  Check,
  Clock,
  Info,
  Sparkles,
  Layers,
  ArrowLeft,
  Tag,
  DollarSign,
  Maximize2
} from 'lucide-react';
import CustomDatePicker from './ui/DatePicker';
import SelectOrCreate from './ui/SelectOrCreate';
import Button from './ui/Button';
import { useNotification } from '../context/NotificationContext';

const PRESET_USAGE_CYCLES = [
  { value: 15, label: '15 Days (Bi-weekly)' },
  { value: 25, label: '25 Days (Custom Batch)' },
  { value: 30, label: '30 Days (Standard)' },
  { value: 45, label: '45 Days (Extended)' },
  { value: 60, label: '60 Days (Bimonthly)' },
  { value: 90, label: '90 Days (Quarterly)' }
];

// No hardcoded categories/industries — dynamic from catalog and user input

const PRESET_MATERIALS = [
  'Chromo Paper',
  'Direct Thermal (DT)',
  'Thermal Transfer (TT)',
  'Polypropylene (PP)',
  'Polyester (PET)',
  'Vinyl',
  'Clear Transparent',
  'Silver Metallic',
  'Foil Paper'
];

const PRESET_COLOURS = [
  'White',
  'Natural / Clear',
  'Yellow',
  'Red',
  'Blue',
  'Green',
  'Silver',
  'Gold',
  'Multi-color',
  'Black'
];

/**
 * Safely adds integer days to a YYYY-MM-DD date string without timezone shifts
 */
function addDaysToDate(dateStr, days) {
  if (!dateStr) return '';
  const numDays = parseInt(days, 10);
  if (isNaN(numDays)) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dt = new Date(y, m, d);
  if (isNaN(dt.getTime())) return '';
  dt.setDate(dt.getDate() + numDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const getTodayStr = () => {
  const now = new Date();
  const y = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
};

/**
 * Searchable Product Dropdown Component for Order Line Items
 */
function SearchableProductSelect({ products, selectedProductId, onSelectProduct, onOpenCreateProduct, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  const selectedProduct = useMemo(() => {
    return products.find(p => p._id === selectedProductId) || null;
  }, [products, selectedProductId]);

  // Filter products by search term (name, dimensionKey, or category)
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase().trim();
    const normalizedDim = term.replace(/\s*x\s*/g, 'x');

    return products.filter(p => {
      const nameMatch = (p.name || '').toLowerCase().includes(term);
      const catMatch = (p.category || '').toLowerCase().includes(term);
      const dimKey = (p.dimensionKey || `${p.widthMm}x${p.heightMm}`).toLowerCase();
      const dimMatch = dimKey.includes(term) || dimKey.includes(normalizedDim);
      return nameMatch || catMatch || dimMatch;
    });
  }, [products, searchTerm]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selector Box */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 rounded-xl text-left flex items-center justify-between gap-2 text-xs transition cursor-pointer disabled:opacity-50"
      >
        {selectedProduct ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-900 text-white font-mono font-bold text-[11px] rounded-md shadow-2xs shrink-0">
              <Ruler size={12} className="text-red-400 stroke-[2.5]" />
              {selectedProduct.dimensionKey || `${selectedProduct.widthMm}x${selectedProduct.heightMm}`}
            </span>
            <span className="font-semibold text-slate-900 truncate">
              {selectedProduct.name}
            </span>
            {selectedProduct.category && (
              <span className="text-[10px] text-slate-400 font-normal shrink-0">
                ({selectedProduct.category})
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-400 font-normal">
            -- Select product by dimension or name --
          </span>
        )}
        <ChevronDown size={15} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 space-y-1.5 max-h-72 overflow-hidden flex flex-col">
          {/* Search Field */}
          <div className="relative">
            <Search size={14} className="text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type dimension (e.g. 50x25) or name..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:border-red-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Product Items List */}
          <div className="overflow-y-auto scrollbar-hide space-y-1 max-h-48 pt-0.5">
            {filteredProducts.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                No matching catalog products found
              </div>
            ) : (
              filteredProducts.map((p) => {
                const isSelected = p._id === selectedProductId;
                const dimStr = p.dimensionKey || `${p.widthMm}x${p.heightMm}`;
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => {
                      onSelectProduct(p);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-center justify-between gap-2 text-xs cursor-pointer ${
                      isSelected
                        ? 'bg-red-50 border border-red-200 text-red-900'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-900 text-white font-mono font-bold text-[10px] rounded-md shrink-0">
                        <Ruler size={11} className="text-red-400" />
                        {dimStr}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {p.category || 'General'} • {p.defaultUsageCycleDays || 30}d cycle
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isSelected && <Check size={14} className="text-red-600" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Direct Option to Create New Product */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (onOpenCreateProduct) {
                  onOpenCreateProduct(searchTerm);
                }
              }}
              className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Plus size={13} className="text-red-600" />
              <span>+ Create New Product {searchTerm ? `"${searchTerm}"` : ''}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline New Product Creation Subform Component
 */
function InlineNewProductForm({ prefillName, onProductCreated, onCancel, productsList }) {
  const notify = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: prefillName || '',
    jobName: '',
    category: '',
    widthMm: '',
    heightMm: '',
    unit: 'MM',
    material: 'Chromo Paper',
    colour: 'White',
    unitPrice: '',
    defaultUsageCycleDays: 30,
    notes: ''
  });

  // Dynamically derive industries from existing catalog products (no hardcoded lists)
  const dynamicIndustries = useMemo(() => {
    const set = new Set();
    (productsList || []).forEach(p => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [productsList]);

  const previewDimension = useMemo(() => {
    const w = parseFloat(form.widthMm) || 0;
    const h = parseFloat(form.heightMm) || 0;
    if (w > 0 || h > 0) {
      return form.unit === 'MTR' ? `${w} x ${h} MTR` : `${w} x ${h} MM`;
    }
    return '0 x 0 MM';
  }, [form.widthMm, form.heightMm, form.unit]);

  const dimensionKeyPreview = useMemo(() => {
    const w = parseFloat(form.widthMm) || 0;
    const h = parseFloat(form.heightMm) || 0;
    if (w > 0 || h > 0) {
      return form.unit === 'MTR' ? `${w}x${h} MTR` : `${w}x${h}`;
    }
    return 'N/A';
  }, [form.widthMm, form.heightMm, form.unit]);

  const handleSaveProduct = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) {
      notify.error('Product Name is required');
      return;
    }

    const widthNum = parseFloat(form.widthMm);
    const heightNum = parseFloat(form.heightMm);

    if (isNaN(widthNum) || widthNum <= 0) {
      notify.error('Width must be a positive number');
      return;
    }
    if (isNaN(heightNum) || heightNum <= 0) {
      notify.error('Height must be a positive number');
      return;
    }

    // 1. Client-side duplicate check
    const existing = productsList.find(p => {
      const matchName = (p.name || '').trim().toLowerCase() === form.name.trim().toLowerCase();
      const matchDim = (p.dimensionKey || '').toLowerCase() === dimensionKeyPreview.toLowerCase();
      return matchName && matchDim;
    });

    if (existing) {
      notify.info(`Product "${existing.name}" (${dimensionKeyPreview}) already exists in catalog — selected automatically!`);
      onProductCreated(existing);
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        name: form.name.trim(),
        jobName: form.jobName.trim(),
        category: form.category.trim(),
        widthMm: widthNum,
        heightMm: heightNum,
        unit: form.unit,
        material: form.material.trim(),
        colour: form.colour.trim(),
        unitPrice: form.unitPrice !== '' ? parseFloat(form.unitPrice) : null,
        defaultUsageCycleDays: parseInt(form.defaultUsageCycleDays, 10) || 30,
        notes: form.notes.trim(),
        status: 'active'
      };

      const res = await api.post('/products', payload);
      const savedProd = res.data?.product;

      if (savedProd) {
        notify.success(`Product "${savedProd.name}" created and added to catalog!`);
        onProductCreated(savedProd);
      } else {
        notify.error('Failed to create product');
      }
    } catch (err) {
      console.error('Create product error:', err);
      if (err.response?.status === 409 && err.response?.data?.product) {
        // Product already exists on backend
        notify.info(err.response.data.message || 'Product already exists in catalog — selected automatically!');
        onProductCreated(err.response.data.product);
      } else {
        notify.error(err.response?.data?.message || 'Failed to save product to catalog');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 bg-gradient-to-b from-red-50/50 to-white border-2 border-red-200/80 rounded-2xl space-y-3.5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-red-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Sparkles size={14} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 leading-tight">Create New Product</h4>
            <span className="text-[10px] text-red-600 font-semibold block">Saves permanently to Main Product Catalog</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
        >
          <ArrowLeft size={13} />
          <span>Pick Existing</span>
        </button>
      </div>

      {/* Input Fields Grid */}
      <div className="space-y-3 text-xs">
        {/* Row 1: Product Name & Label/Job Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Product Name / SKU <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. OTTO / 1COL / CHR or Shipping Label"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Label Name
            </label>
            <input
              type="text"
              value={form.jobName}
              onChange={(e) => setForm({ ...form, jobName: e.target.value })}
              placeholder="e.g. Standard Barcode, Vial Label"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>
        </div>

        {/* Row 2: Industry & Unit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Industry
            </label>
            <input
              type="text"
              list="preset-industries-list"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="e.g. Garments, Pharma, Logistics, Retail"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
            <datalist id="preset-industries-list">
              {dynamicIndustries.map(cat => <option key={cat} value={cat} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Measurement Unit
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setForm({ ...form, unit: 'MM' })}
                className={`py-1 text-xs font-bold rounded-lg transition ${
                  form.unit === 'MM'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                MM (Millimeters)
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, unit: 'MTR' })}
                className={`py-1 text-xs font-bold rounded-lg transition ${
                  form.unit === 'MTR'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                MTR (Meters)
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: Dimensions (Width & Height) with Live Preview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Width ({form.unit}) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0.1"
              required
              value={form.widthMm}
              onChange={(e) => setForm({ ...form, widthMm: e.target.value })}
              placeholder="e.g. 50"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Height ({form.unit}) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0.1"
              required
              value={form.heightMm}
              onChange={(e) => setForm({ ...form, heightMm: e.target.value })}
              placeholder="e.g. 25"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          {/* Dimension Preview Badge */}
          <div className="p-2 bg-slate-900 text-white rounded-xl flex items-center justify-between gap-2 shadow-2xs">
            <div className="min-w-0">
              <span className="text-[9px] text-slate-400 block uppercase font-mono font-semibold">Size Preview</span>
              <span className="text-xs font-mono font-bold text-red-300 truncate block">
                {previewDimension}
              </span>
            </div>
            <Ruler size={16} className="text-red-400 shrink-0" />
          </div>
        </div>

        {/* Row 4: Material & Colour */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Material
            </label>
            <input
              type="text"
              list="preset-materials-list"
              value={form.material}
              onChange={(e) => setForm({ ...form, material: e.target.value })}
              placeholder="e.g. Chromo Paper"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
            <datalist id="preset-materials-list">
              {PRESET_MATERIALS.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Colour
            </label>
            <input
              type="text"
              list="preset-colours-list"
              value={form.colour}
              onChange={(e) => setForm({ ...form, colour: e.target.value })}
              placeholder="e.g. White, Multi-color"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
            <datalist id="preset-colours-list">
              {PRESET_COLOURS.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>

        {/* Row 5: Unit Price & Reorder Cycle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Catalog Unit Price (₹) <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              placeholder="e.g. 1.25"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Default Usage Cycle (Days)
            </label>
            <select
              value={form.defaultUsageCycleDays}
              onChange={(e) => setForm({ ...form, defaultUsageCycleDays: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 cursor-pointer"
            >
              <option value="15">15 Days (Rapid cycle)</option>
              <option value="30">30 Days (Standard monthly)</option>
              <option value="45">45 Days (Extended)</option>
              <option value="60">60 Days (Bi-monthly)</option>
              <option value="90">90 Days (Quarterly)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-red-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleSaveProduct}
          disabled={isSubmitting}
          className="px-4 py-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl text-xs font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Check size={14} />
          <span>{isSubmitting ? 'Saving to Catalog...' : 'Save & Select Product'}</span>
        </button>
      </div>
    </div>
  );
}

export default function NewOrderModal({ isOpen, onClose, onSuccess, initialLead, initialCustomer }) {
  const notify = useNotification();
  const [existingCustomers, setExistingCustomers] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);

  // Customer Mode: 'existing' or 'new'
  const [customerMode, setCustomerMode] = useState(initialLead ? 'new' : 'existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  // New Customer Form State
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: initialLead?.name || '',
    company: initialLead?.company || '',
    phone: initialLead?.phone || '',
    email: initialLead?.email || '',
    city: '',
    address: ''
  });

  // Dimension-based Line Items from Product catalog
  // Line item structure: { productId, qty, price, mode: 'catalog' | 'create', prefillName: '' }
  const [lineItems, setLineItems] = useState([
    { productId: '', qty: 1000, price: '', mode: 'catalog', prefillName: '' }
  ]);

  // Order Details & Reorder Settings
  const [orderDate, setOrderDate] = useState(getTodayStr());
  const [usageCycleDays, setUsageCycleDays] = useState(30);
  const [customUsageCycles, setCustomUsageCycles] = useState([]);
  const [expectedReorderDate, setExpectedReorderDate] = useState(() => addDaysToDate(getTodayStr(), 30));
  const [isManualReorderOverride, setIsManualReorderOverride] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Combine Preset and Custom Usage Cycle options
  const allUsageCycleOptions = useMemo(() => {
    const list = [...PRESET_USAGE_CYCLES];
    customUsageCycles.forEach(c => {
      const val = parseInt(c, 10);
      if (!isNaN(val) && !list.some(item => item.value === val)) {
        list.push({ value: val, label: `${val} Days` });
      }
    });
    const currentVal = parseInt(usageCycleDays, 10);
    if (!isNaN(currentVal) && !list.some(item => item.value === currentVal)) {
      list.push({ value: currentVal, label: `${currentVal} Days` });
    }
    return list.sort((a, b) => a.value - b.value);
  }, [customUsageCycles, usageCycleDays]);

  // Handle Usage Cycle Change with automatic Expected Reorder Date update
  const handleUsageCycleChange = (val) => {
    const num = parseInt(String(val).replace(/\D/g, ''), 10);
    const validNum = !isNaN(num) && num > 0 ? num : 30;
    setUsageCycleDays(validNum);
    if (orderDate) {
      setExpectedReorderDate(addDaysToDate(orderDate, validNum));
      setIsManualReorderOverride(false);
    }
  };

  const handleCreateCustomCycle = (newVal) => {
    const num = parseInt(String(newVal).replace(/\D/g, ''), 10);
    if (!isNaN(num) && num > 0) {
      setCustomUsageCycles(prev => (prev.includes(num) ? prev : [...prev, num]));
      handleUsageCycleChange(num);
    }
  };

  const handleDeleteCustomCycle = (optVal) => {
    const num = parseInt(String(optVal).replace(/\D/g, ''), 10);
    setCustomUsageCycles(prev => prev.filter(c => c !== num));
  };

  // Sync initialLead or initialCustomer props when modal opens
  useEffect(() => {
    if (initialLead) {
      setCustomerMode('new');
      setNewCustomerForm({
        name: initialLead.name || '',
        company: initialLead.company || '',
        phone: initialLead.phone || '',
        email: initialLead.email || '',
        city: '',
        address: ''
      });
    } else if (initialCustomer) {
      setCustomerMode('existing');
      const custId = typeof initialCustomer === 'string' ? initialCustomer : (initialCustomer._id || initialCustomer.id);
      setSelectedCustomerId(custId || '');
      if (initialCustomer.address) {
        setDeliveryAddress(initialCustomer.address);
      }
    }
  }, [initialLead, initialCustomer]);

  // Load Existing Customers & Products on Modal Open
  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        try {
          setLoadingResources(true);
          const [custRes, prodRes] = await Promise.allSettled([
            api.get('/customers'),
            api.get('/products?limit=500&status=active')
          ]);

          if (custRes.status === 'fulfilled') {
            const cData = custRes.value.data;
            const custList = Array.isArray(cData) ? cData : (cData?.customers || []);
            custList.sort((a, b) => (a.name || a.company || '').localeCompare(b.name || b.company || '', undefined, { sensitivity: 'base' }));
            setExistingCustomers(custList);
          }

          if (prodRes.status === 'fulfilled') {
            const pData = prodRes.value.data;
            const prods = Array.isArray(pData) ? pData : (pData?.products || []);
            prods.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
            setProductsList(prods);

            // If line items is empty/unselected, pre-select first product if available
            setLineItems(prev => {
              if (prev.length === 1 && !prev[0].productId && prods.length > 0) {
                const first = prods[0];
                return [{ productId: first._id, qty: 1000, price: '', mode: 'catalog', prefillName: '' }];
              }
              return prev;
            });
          }
        } catch (err) {
          console.error('Error loading resources for order form:', err);
        } finally {
          setLoadingResources(false);
        }
      };
      fetchData();
    }
  }, [isOpen]);

  // Handle Product Selection for a line item
  const handleSelectProduct = (index, product) => {
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      productId: product._id,
      mode: 'catalog',
      price: product.unitPrice != null ? product.unitPrice : (updated[index].price || '')
    };

    // Auto-fill Usage Cycle from product default if available
    if (product.defaultUsageCycleDays && index === 0) {
      const pCycle = parseInt(product.defaultUsageCycleDays, 10) || 30;
      setUsageCycleDays(pCycle);
      if (orderDate) {
        setExpectedReorderDate(addDaysToDate(orderDate, pCycle));
        setIsManualReorderOverride(false);
      }
    }

    setLineItems(updated);
  };

  // Switch line item mode between 'catalog' and 'create'
  const handleToggleItemMode = (index, mode, prefillName = '') => {
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      mode,
      prefillName: prefillName || updated[index].prefillName || ''
    };
    setLineItems(updated);
  };

  // Called when inline product creation successfully saves
  const handleProductCreated = (index, newProduct) => {
    // Add to global productsList if not already present
    setProductsList(prev => {
      if (prev.some(p => p._id === newProduct._id)) return prev;
      const updatedList = [newProduct, ...prev];
      updatedList.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
      return updatedList;
    });

    // Select in current line item and switch back to catalog mode
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      productId: newProduct._id,
      mode: 'catalog',
      price: newProduct.unitPrice != null ? newProduct.unitPrice : (updated[index].price || '')
    };

    if (newProduct.defaultUsageCycleDays && index === 0) {
      const pCycle = parseInt(newProduct.defaultUsageCycleDays, 10) || 30;
      setUsageCycleDays(pCycle);
      if (orderDate) {
        setExpectedReorderDate(addDaysToDate(orderDate, pCycle));
        setIsManualReorderOverride(false);
      }
    }

    setLineItems(updated);
  };

  // Handle Line Item Field Change
  const handleItemFieldChange = (index, field, value) => {
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { productId: '', qty: 1000, price: '', mode: 'catalog', prefillName: '' }
    ]);
  };

  const removeLineItem = (index) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  // Grand Total Calculation (Only if ALL line items have price set)
  const isAllPriced = useMemo(() => {
    if (lineItems.length === 0) return false;
    return lineItems.every(item => {
      if (!item.productId) return false;
      if (item.price === '' || item.price === null || item.price === undefined) return false;
      const p = parseFloat(item.price);
      return !isNaN(p) && p >= 0;
    });
  }, [lineItems]);

  const calculatedGrandTotal = useMemo(() => {
    if (!isAllPriced) return null;
    return lineItems.reduce((sum, item) => {
      const qty = parseInt(item.qty, 10) || 0;
      const price = parseFloat(item.price) || 0;
      return sum + (qty * price);
    }, 0);
  }, [lineItems, isAllPriced]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (customerMode === 'existing' && !selectedCustomerId) {
      notify.error('Please select an existing customer');
      return;
    }

    if (customerMode === 'new') {
      if (!newCustomerForm.name || !newCustomerForm.phone) {
        notify.error('Customer name and phone number are required');
        return;
      }
      const cleanPhone = newCustomerForm.phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        notify.error('Phone number must be exactly 10 digits');
        return;
      }
      if (newCustomerForm.email && newCustomerForm.email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newCustomerForm.email.trim())) {
          notify.error('Please enter a valid email address');
          return;
        }
      }
    }

    // Validate line items
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (item.mode === 'create') {
        notify.error(`Item #${i + 1}: Please complete and save the new product before placing the order`);
        return;
      }
      if (!item.productId) {
        notify.error(`Item #${i + 1}: Please select a product from the catalog or create one`);
        return;
      }
      const qty = parseInt(item.qty, 10);
      if (isNaN(qty) || qty <= 0) {
        notify.error(`Item #${i + 1}: Valid Quantity is required`);
        return;
      }
    }

    if (!expectedReorderDate) {
      notify.error('Expected Reorder Date is required');
      return;
    }

    try {
      setIsSubmitting(true);

      const formattedLineItems = lineItems.map(item => ({
        productId: item.productId,
        qty: parseInt(item.qty, 10),
        price: item.price !== '' && item.price !== null ? parseFloat(item.price) : undefined
      }));

      const payload = {
        lineItems: formattedLineItems,
        orderDate,
        expectedReorderDate,
        isExpectedReorderDateOverridden: isManualReorderOverride,
        usageCycleDays: parseInt(usageCycleDays, 10) || 30,
        deliveryAddress: deliveryAddress.trim() || undefined
      };

      if (customerMode === 'existing') {
        payload.customerId = selectedCustomerId;
      } else {
        payload.newCustomer = {
          name: newCustomerForm.name.trim(),
          company: newCustomerForm.company?.trim() || undefined,
          phone: newCustomerForm.phone.replace(/\D/g, '').slice(0, 10),
          email: newCustomerForm.email?.trim() || undefined,
          city: newCustomerForm.city?.trim() || undefined,
          address: newCustomerForm.address?.trim() || undefined,
          leadId: initialLead?._id
        };
      }

      if (initialLead?._id) {
        payload.leadId = initialLead._id;
      }

      const res = await api.post('/orders', payload);

      notify.success(res.data?.message || 'Order created successfully!');
      if (onSuccess) {
        onSuccess(res.data?.order);
      }
      onClose();
    } catch (err) {
      console.error('Error submitting order:', err);
      notify.error(err.response?.data?.message || 'Failed to create order');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto font-sans">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl my-6 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
              {initialLead
                ? `Create Order for ${initialLead.name || 'Lead'}`
                : (initialCustomer ? `Create Order for ${initialCustomer.name || 'Customer'}` : 'Create New Order')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {initialLead
                ? 'Converts lead into an active Customer and logs confirmed order'
                : 'Select customer, pick or create products, and set delivery & reorder cycle'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-50 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Section 1: Customer Selection */}
          <div className="space-y-3.5 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-700 tracking-wider">
                1. Customer Selection
              </span>
              {!initialLead && !initialCustomer && (
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setCustomerMode('existing')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      customerMode === 'existing'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Existing Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode('new')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      customerMode === 'new'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    + New Customer
                  </button>
                </div>
              )}
            </div>

            {customerMode === 'existing' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Customer *</label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-red-500 cursor-pointer"
                >
                  <option value="">-- Choose Existing Customer --</option>
                  {existingCustomers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} {c.company ? `(${c.company})` : ''} - {c.phone}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.name}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                    placeholder="e.g. Apex Logistics"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Company</label>
                  <input
                    type="text"
                    value={newCustomerForm.company}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, company: e.target.value })}
                    placeholder="e.g. Apex Pvt Ltd"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                    placeholder="contact@company.com (Optional)"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Order Line Items (Product Catalog or Create Product) */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Ruler size={15} className="text-red-600" />
                <span className="text-xs font-semibold uppercase text-slate-700">
                  2. Order Line Items (Product Catalog)
                </span>
              </div>
              <button
                type="button"
                onClick={addLineItem}
                className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Add Item</span>
              </button>
            </div>

            <div className="space-y-3.5">
              {lineItems.map((item, index) => {
                const isCreating = item.mode === 'create';
                const selectedProd = productsList.find(p => p._id === item.productId);

                return (
                  <div key={index} className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3 shadow-2xs">
                    {/* Line Item Header with Item # and Mode Switch */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          Line Item #{index + 1}
                        </span>

                        {/* Mode Switcher Buttons */}
                        <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleToggleItemMode(index, 'catalog')}
                            className={`px-2.5 py-0.5 rounded-md font-semibold transition ${
                              !isCreating
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Existing Catalog
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleItemMode(index, 'create')}
                            className={`px-2.5 py-0.5 rounded-md font-semibold transition flex items-center gap-1 ${
                              isCreating
                                ? 'bg-red-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-red-700'
                            }`}
                          >
                            <Plus size={11} />
                            <span>+ Create New Product</span>
                          </button>
                        </div>
                      </div>

                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="text-slate-400 hover:text-red-600 p-1 transition cursor-pointer"
                          title="Remove Line Item"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    {/* Mode 1: Search & Pick Existing Product */}
                    {!isCreating ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Select Product (by Dimension or Name) <span className="text-red-500">*</span>
                          </label>
                          <SearchableProductSelect
                            products={productsList}
                            selectedProductId={item.productId}
                            onSelectProduct={(prod) => handleSelectProduct(index, prod)}
                            onOpenCreateProduct={(prefill) => handleToggleItemMode(index, 'create', prefill)}
                          />
                        </div>

                        {/* Quantity and Optional Unit Price Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Quantity (Labels) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              required
                              value={item.qty}
                              onChange={(e) => handleItemFieldChange(index, 'qty', e.target.value)}
                              placeholder="e.g. 1000"
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-red-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Unit Price (₹) <span className="text-slate-400 font-normal">(Optional)</span>
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.price}
                              onChange={(e) => handleItemFieldChange(index, 'price', e.target.value)}
                              placeholder="e.g. 1.25"
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:ring-2 focus:ring-red-500"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Mode 2: Create New Product Inline Subform */
                      <InlineNewProductForm
                        prefillName={item.prefillName}
                        productsList={productsList}
                        onProductCreated={(newProd) => handleProductCreated(index, newProd)}
                        onCancel={() => handleToggleItemMode(index, 'catalog')}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Order Date & Reorder Settings */}
          <div className="space-y-3.5 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-600 block">
                3. Order & Reorder Settings
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-start">
              {/* PO Date */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  PO Date <span className="text-red-500">*</span>
                </label>
                <CustomDatePicker
                  required
                  selectedDate={orderDate}
                  onChange={(val) => {
                    setOrderDate(val);
                    if (val && usageCycleDays) {
                      setExpectedReorderDate(addDaysToDate(val, usageCycleDays));
                      setIsManualReorderOverride(false);
                    }
                  }}
                  placeholder="Select PO date"
                />
              </div>

              {/* Usage Cycle (Days) - Select or Create */}
              <div className="space-y-1.5">
                <SelectOrCreate
                  label="Usage Cycle (Days)"
                  placeholder="Select or enter days..."
                  value={usageCycleDays}
                  onChange={handleUsageCycleChange}
                  options={allUsageCycleOptions}
                  protectedOptions={PRESET_USAGE_CYCLES.map(u => u.value)}
                  onCreateOption={handleCreateCustomCycle}
                  onDeleteOption={handleDeleteCustomCycle}
                  icon={Clock}
                  createPrompt="Add custom cycle"
                  formatSelectedLabel={(val) => {
                    const num = parseInt(String(val).replace(/\D/g, ''), 10);
                    return isNaN(num) ? String(val) : `${num} Days`;
                  }}
                  formatOptionLabel={(opt) => {
                    if (typeof opt === 'object' && opt.label) return opt.label;
                    const num = parseInt(String(opt).replace(/\D/g, ''), 10);
                    return isNaN(num) ? String(opt) : `${num} Days`;
                  }}
                />
              </div>

              {/* Expected Reorder Date */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Expected Reorder Date <span className="text-red-500">*</span>
                  </label>
                  {isManualReorderOverride ? (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                      Manual
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      Auto
                    </span>
                  )}
                </div>
                <CustomDatePicker
                  required
                  selectedDate={expectedReorderDate}
                  onChange={(val) => {
                    setIsManualReorderOverride(true);
                    setExpectedReorderDate(val);
                  }}
                  placeholder="Select expected reorder date"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200/80 rounded-xl px-3 py-2 shadow-2xs">
              <Info size={14} className="text-red-500 shrink-0 stroke-[2.2]" />
              <span>
                Auto-calculated from <strong className="text-slate-900 font-bold">PO Date + {usageCycleDays || 30} Days</strong> — you can manually adjust if needed.
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              loadingText="Creating Order..."
            >
              Confirm & Create Order
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}
