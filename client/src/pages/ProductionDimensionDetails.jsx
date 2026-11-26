import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';
import {
  exportDimensionProductionToExcel,
  exportProductProductionToExcel
} from '../utils/exportUtils';
import {
  ArrowLeft,
  Factory,
  Layers,
  Ruler,
  TrendingUp,
  Clock,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Users,
  ChevronRight,
  Info,
  Calendar,
  PackageCheck,
  ShoppingCart,
  CheckCircle2,
  Tag,
  BarChart3,
  Download,
  FileSpreadsheet,
  X,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';

export default function ProductionDimensionDetails() {
  const { dimensionKey: rawDimensionKey } = useParams();
  const dimensionKey = decodeURIComponent(rawDimensionKey || '');
  const navigate = useNavigate();
  const notify = useNotification();

  const [loading, setLoading] = useState(true);
  const [trailingMonths, setTrailingMonths] = useState(2);
  const [dimensionData, setDimensionData] = useState(null);
  const [activeTab, setActiveTab] = useState('variants'); // 'variants' | 'customers' | 'trends'
  
  // Search states for tabs
  const [variantSearch, setVariantSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedDriverMonth, setSelectedDriverMonth] = useState('trailing');

  // Export states
  const [exportingDimension, setExportingDimension] = useState(false);
  const [exportingProduct, setExportingProduct] = useState({});

  const fetchDimensionDetails = useCallback(async (months = trailingMonths) => {
    if (!dimensionKey) return;
    try {
      setLoading(true);
      const res = await api.get(`/production/forecast?dimensionKey=${encodeURIComponent(dimensionKey)}&trailingMonths=${months}`);
      setDimensionData(res.data);
    } catch (err) {
      console.error('Error fetching dimension details:', err);
      notify.error(err.response?.data?.message || `Failed to load details for dimension [${dimensionKey}]`);
    } finally {
      setLoading(false);
    }
  }, [dimensionKey, trailingMonths, notify]);

  useEffect(() => {
    fetchDimensionDetails(trailingMonths);
  }, [dimensionKey, trailingMonths, fetchDimensionDetails]);

  const formatDimensionDimensions = (dim) => {
    if (!dim || !dim.includes('x')) return dim || '—';
    const [w, h] = dim.split('x');
    return `${w}mm × ${h}mm`;
  };

  const getTrendData = (trailingMonthsArr) => {
    if (!trailingMonthsArr || trailingMonthsArr.length < 2) return null;
    const m1 = trailingMonthsArr[trailingMonthsArr.length - 2].totalQty || 0;
    const m2 = trailingMonthsArr[trailingMonthsArr.length - 1].totalQty || 0;
    if (m1 === 0) return { direction: 'flat', pct: 0, label: 'Stable (0%)' };
    const pctChange = Math.round(((m2 - m1) / m1) * 100);
    if (pctChange > 0) return { direction: 'up', pct: pctChange, label: `+${pctChange}% vs prev` };
    if (pctChange < 0) return { direction: 'down', pct: Math.abs(pctChange), label: `${pctChange}% vs prev` };
    return { direction: 'flat', pct: 0, label: 'Stable (0%)' };
  };

  const handleExportDimension = async () => {
    try {
      setExportingDimension(true);
      await exportDimensionProductionToExcel({
        dimensionKey,
        trailingMonths,
        notify
      });
    } catch (err) {
      console.error('Dimension export error:', err);
    } finally {
      setExportingDimension(false);
    }
  };

  const handleExportProduct = async (prod, e) => {
    if (e) e.stopPropagation();
    const pName = prod.productName;
    try {
      setExportingProduct(prev => ({ ...prev, [pName]: true }));
      await exportProductProductionToExcel({
        productName: pName,
        dimensionKey,
        trailingMonths,
        notify
      });
    } catch (err) {
      console.error('Product export error:', err);
    } finally {
      setExportingProduct(prev => ({ ...prev, [pName]: false }));
    }
  };

  // Filtered Product Variants
  const filteredVariants = useMemo(() => {
    const list = dimensionData?.productVariantsList || [];
    if (!variantSearch.trim()) return list;
    const q = variantSearch.toLowerCase().trim();
    return list.filter(v =>
      (v.productName && v.productName.toLowerCase().includes(q)) ||
      (v.labelName && v.labelName.toLowerCase().includes(q)) ||
      (v.category && v.category.toLowerCase().includes(q)) ||
      (v.material && v.material.toLowerCase().includes(q)) ||
      (v.colour && v.colour.toLowerCase().includes(q))
    );
  }, [dimensionData, variantSearch]);

  // Filtered Purchasing Customers
  const filteredCustomers = useMemo(() => {
    const list = dimensionData?.allPurchasingCustomers || [];
    if (!customerSearch.trim()) return list;
    const q = customerSearch.toLowerCase().trim();
    return list.filter(c =>
      (c.customerName && c.customerName.toLowerCase().includes(q)) ||
      (c.company && c.company.toLowerCase().includes(q))
    );
  }, [dimensionData, customerSearch]);

  if (loading && !dimensionData) {
    return (
      <div className="space-y-6 pb-12 font-sans animate-pulse">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-8 w-64 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-8 w-36 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!loading && !dimensionData) {
    return (
      <div className="p-8 text-center space-y-4 max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200 shadow-2xs">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
          <AlertCircle size={24} />
        </div>
        <h3 className="font-bold text-slate-800 text-base">Dimension Not Found</h3>
        <p className="text-xs text-slate-500">
          No records or demand statistics found for dimension key [{dimensionKey}].
        </p>
        <button
          onClick={() => navigate('/production')}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition"
        >
          Return to Production
        </button>
      </div>
    );
  }

  const d = dimensionData;
  const trend = getTrendData(d.trailingMonths);
  const currentMonthTitle = d.currentMonth || 'Current Month';
  const forecastMonthTitle = d.forecastForMonth || 'Upcoming Month';
  const totalVariantsCount = d.productNames?.length || d.productVariantsList?.length || 0;
  const totalCustomersCount = d.totalPurchasingCustomersCount || d.allPurchasingCustomers?.length || 0;

  return (
    <div className="space-y-5 sm:space-y-6 pb-12 font-sans max-w-full overflow-hidden">
      
      {/* 1. TOP HEADER & BREADCRUMBS */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to="/production"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition bg-white border border-slate-200/90 hover:border-slate-300 px-3 py-1.5 rounded-xl shadow-2xs"
            >
              <ArrowLeft size={14} />
              <span>Back to Production Planning</span>
            </Link>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-3 py-1 bg-slate-900 text-white font-mono font-bold text-sm sm:text-base rounded-xl shadow-2xs">
              [{d.dimensionKey}]
            </span>
            <h1 className="text-xl sm:text-2xl 2xl:text-3xl font-extrabold text-slate-900 tracking-tight">
              {formatDimensionDimensions(d.dimensionKey)}
            </h1>
            <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold rounded-md shrink-0 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {currentMonthTitle} Live
            </span>
          </div>

          <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
            Machine setup specifications, product variants manufactured, historical demand trends, and detailed customer purchase breakdown.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 w-full xl:w-auto shrink-0 justify-between xl:justify-end flex-wrap">
          {/* Horizon Toggle */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-2xs">
            <button
              onClick={() => setTrailingMonths(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                trailingMonths === 2
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Trailing 2 Mo
            </button>
            <button
              onClick={() => setTrailingMonths(3)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                trailingMonths === 3
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Trailing 3 Mo
            </button>
          </div>

          {/* Export Dimension Button */}
          <button
            onClick={handleExportDimension}
            disabled={exportingDimension || loading}
            title="Download full dimension report in Excel format (.xlsx)"
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-2xs transition font-semibold text-xs sm:text-sm cursor-pointer disabled:opacity-50 shrink-0"
          >
            {exportingDimension ? (
              <RefreshCw size={15} className="animate-spin text-white" />
            ) : (
              <FileSpreadsheet size={16} className="text-white" />
            )}
            <span>{exportingDimension ? 'Exporting...' : 'Export Dimension (.xlsx)'}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchDimensionDetails(trailingMonths)}
            title="Refresh Dimension Data"
            className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl shadow-2xs transition cursor-pointer shrink-0"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. PROMINENT 4 KEY STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 2xl:gap-6">
        
        {/* Card 1: Total Labels */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2 hover:shadow-md transition">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-slate-500">Total Labels</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Tag size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {totalVariantsCount}
            <span className="text-xs font-bold text-slate-400 ml-1.5">Label Variants</span>
          </div>
          <div className="text-xs font-medium text-slate-500">
            Manufactured with this die setup
          </div>
        </div>

        {/* Card 2: Customers Who Purchased It */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2 hover:shadow-md transition">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-slate-500">Purchasing Customers</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Users size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {totalCustomersCount}
            <span className="text-xs font-bold text-slate-400 ml-1.5">Buyers</span>
          </div>
          <div className="text-xs font-semibold text-blue-600 flex items-center gap-1.5">
            <ShoppingCart size={13} />
            <span>Purchased this dimension</span>
          </div>
        </div>

        {/* Card 3: Labels Purchased This Month */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2 hover:shadow-md transition">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-slate-500">{currentMonthTitle} Purchased</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <PackageCheck size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {(d.currentMonthSoldQty || 0).toLocaleString('en-IN')}
            <span className="text-xs font-bold text-slate-400 ml-1.5">Labels Sold</span>
          </div>
          <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 size={13} />
            <span>Across {d.currentMonthOrderCount || 0} confirmed orders</span>
          </div>
        </div>

        {/* Card 4: Labels Required For Next Month */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2 hover:shadow-md transition">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-slate-500">Required Next Month</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {d.forecastRangeHigh != null && !d.insufficientData ? (
              <>
                ~{d.forecastRangeHigh.toLocaleString('en-IN')}
                <span className="text-xs font-bold text-slate-400 ml-1.5">Labels</span>
              </>
            ) : (
              <span className="text-base text-slate-400 font-bold italic">Insufficient Data</span>
            )}
          </div>
          <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
            <Calendar size={13} />
            <span>Expected in {forecastMonthTitle}</span>
          </div>
        </div>

      </div>

      {/* 3. NAVIGATION TABS */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('variants')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
            activeTab === 'variants'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Tag size={15} />
          <span>Product Variants</span>
          <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${activeTab === 'variants' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {d.productVariantsList?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
            activeTab === 'customers'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users size={15} />
          <span>Customer Purchase Details</span>
          <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${activeTab === 'customers' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {d.allPurchasingCustomers?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('trends')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
            activeTab === 'trends'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <BarChart3 size={15} />
          <span>Demand Trends & Trailing History</span>
          <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${activeTab === 'trends' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {d.trailingMonths?.length || 0} Mo
          </span>
        </button>
      </div>

      {/* 4. TAB CONTENT 1: PRODUCT VARIANTS */}
      {activeTab === 'variants' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <Tag size={18} className="text-purple-600" />
                <span>Product Variants Under [{d.dimensionKey}]</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Organized breakdown of specific manufactured labels sharing this dimension and die setup
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search variants, label name, industry..."
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition"
              />
              {variantSearch && (
                <button
                  onClick={() => setVariantSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {filteredVariants.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Label Name</th>
                    <th className="py-3 px-4">Industry</th>
                    <th className="py-3 px-4">Material & Colour</th>
                    <th className="py-3 px-4 text-right">{currentMonthTitle} Sold</th>
                    <th className="py-3 px-4 text-right">Upcoming Forecast</th>
                    <th className="py-3 px-4 text-right">Trailing Avg</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                  {filteredVariants.map((v, idx) => {
                    const isExportingThis = !!exportingProduct[v.productName];
                    return (
                      <tr key={v.productName} className="hover:bg-slate-50/80 transition duration-150">
                        <td className="py-3.5 px-4 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-3.5 px-4 min-w-[200px]">
                          <div className="font-bold text-slate-900 text-sm">{v.productName}</div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-800">
                          {v.labelName || '—'}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold rounded-md">
                            {v.category || 'General'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                          {v.material} / {v.colour}
                        </td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-emerald-700 whitespace-nowrap">
                          {(v.currentMonthSoldQty || 0) > 0 ? (
                            `${(v.currentMonthSoldQty || 0).toLocaleString('en-IN')} units`
                          ) : (
                            <span className="text-slate-400 font-normal">0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                          {v.forecastRangeHigh != null ? (
                            `~${v.forecastRangeHigh.toLocaleString('en-IN')} units`
                          ) : (
                            <span className="text-slate-400 font-normal italic">Insufficient Data</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-600 whitespace-nowrap">
                          {v.averagePerMonth ? `${v.averagePerMonth.toLocaleString('en-IN')} / mo` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={(e) => handleExportProduct(v, e)}
                            disabled={isExportingThis}
                            title={`Export ${v.productName} dossier`}
                            className="p-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 rounded-lg transition cursor-pointer disabled:opacity-50"
                          >
                            {isExportingThis ? (
                              <RefreshCw size={14} className="animate-spin text-emerald-600" />
                            ) : (
                              <Download size={14} />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              No product variants matched the filter.
            </div>
          )}
        </div>
      )}

      {/* 5. TAB CONTENT 2: PURCHASING CUSTOMERS */}
      {activeTab === 'customers' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users size={18} className="text-blue-600" />
                <span>Customer Purchase Details for [{d.dimensionKey}]</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete list of all customers who purchased labels with this dimension, total volumes, and orders
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search customers or company..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition"
              />
              {customerSearch && (
                <button
                  onClick={() => setCustomerSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {filteredCustomers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4 text-right">Total Units Purchased</th>
                    <th className="py-3 px-4 text-center">Orders Count</th>
                    <th className="py-3 px-4 text-right">Contribution %</th>
                    <th className="py-3 px-4">Last Purchase Date</th>
                    <th className="py-3 px-4 text-center">Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                  {filteredCustomers.map((c, idx) => (
                    <tr key={c.customerId || idx} className="hover:bg-slate-50/80 transition duration-150">
                      <td className="py-3.5 px-4 text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-3.5 px-4 min-w-[180px]">
                        <div className="font-bold text-slate-900 text-sm">{c.customerName}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {c.company && c.company !== '—' ? c.company : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {(c.qty || 0).toLocaleString('en-IN')} units
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md font-bold text-slate-800">
                          {c.orderCount || 1} Orders
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-blue-700 whitespace-nowrap">
                        {c.percentage || 0}%
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {c.customerId && (
                          <Link
                            to={`/customers/${c.customerId}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg transition"
                          >
                            <span>View 360</span>
                            <ExternalLink size={12} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              No purchasing customers recorded for this dimension.
            </div>
          )}
        </div>
      )}

      {/* 6. TAB CONTENT 3: DEMAND TRENDS & TRAILING HISTORY */}
      {activeTab === 'trends' && (
        <div className="space-y-6">
          {/* Trailing Completed Months Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-emerald-600" />
                <span>Historical Completed Months Demand Record</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Completed calendar months analyzed for demand calculations ({d.trailingMonthsCount} month trailing horizon)
              </p>
            </div>

            {d.trailingMonths && d.trailingMonths.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Calendar Month</th>
                      <th className="py-3 px-4 text-right">Volume Produced / Sold</th>
                      <th className="py-3 px-4 text-center">Confirmed Orders</th>
                      <th className="py-3 px-4 text-right">vs Trailing Average</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                    {d.trailingMonths.map((m, idx) => {
                      const diff = d.averagePerMonth ? Math.round(((m.totalQty - d.averagePerMonth) / d.averagePerMonth) * 100) : 0;
                      return (
                        <tr key={m.yearMonth} className="hover:bg-slate-50/80 transition duration-150">
                          <td className="py-3.5 px-4 text-slate-400 font-bold">{idx + 1}</td>
                          <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">{m.month}</td>
                          <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 text-sm">
                            {m.totalQty?.toLocaleString('en-IN')} units
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-md font-bold text-slate-800">
                              {m.orderCount} Orders
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold">
                            <span className={diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-500'}>
                              {diff > 0 ? `+${diff}%` : `${diff}%`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                No prior completed months available for this dimension.
              </div>
            )}
          </div>

          {/* Dynamic Period Demand Drivers */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Users size={18} className="text-purple-600" />
                  <span>Period Demand Drivers Breakdown</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a specific trailing horizon or calendar month to see which customers drove volume
                </p>
              </div>

              {d.availableMonths && d.availableMonths.length > 0 && (
                <select
                  value={selectedDriverMonth}
                  onChange={(e) => setSelectedDriverMonth(e.target.value)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl cursor-pointer"
                >
                  <option value="trailing">
                    Trailing Horizon ({d.trailingPeriodLabel || `${trailingMonths} Mo`})
                  </option>
                  {d.availableMonths.map(m => (
                    <option key={m.yearMonth} value={m.yearMonth}>
                      {m.month} ({m.totalQty?.toLocaleString('en-IN')} units)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {(() => {
              const activeGroup = d.monthlyDrivers?.[selectedDriverMonth] || {
                month: d.trailingPeriodLabel || 'Trailing Period',
                totalQty: d.sumTrailing,
                drivers: d.topContributingCustomers || []
              };
              const drivers = activeGroup.drivers || [];

              return drivers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Customer Name</th>
                        <th className="py-3 px-4">Company</th>
                        <th className="py-3 px-4 text-right">Units Ordered</th>
                        <th className="py-3 px-4 text-center">Orders</th>
                        <th className="py-3 px-4 text-right">Contribution %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {drivers.map((drv, di) => (
                        <tr key={di} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 text-slate-400 font-bold">{di + 1}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{drv.customerName}</td>
                          <td className="py-3 px-4 text-slate-600">{drv.company || '—'}</td>
                          <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                            {drv.qty?.toLocaleString('en-IN')} units
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-bold">
                              {drv.orderCount || 1}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-purple-700">
                            {drv.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  No drivers recorded for this period.
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 7. FOOTER NOTE */}
      <div className="flex items-center justify-start gap-1.5 text-xs text-slate-400 font-medium pt-2">
        <Info size={14} className="shrink-0" />
        <span>
          Production Planning Engine • Dimension Key [{d.dimensionKey}] • Multi-order machine setup and batching optimization
        </span>
      </div>

    </div>
  );
}
