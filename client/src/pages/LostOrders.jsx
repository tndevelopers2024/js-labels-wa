import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import AccordionCard from '../components/ui/AccordionCard';
import LoadingButton from '../components/ui/LoadingButton';
import { SkeletonTable } from '../components/ui/Skeleton';
import { exportLostOrdersToExcel, exportSingleOrderToExcel } from '../utils/exportUtils';
import {
  FileX,
  Search,
  Filter,
  Download,
  RefreshCw,
  Calendar,
  Clock,
  User,
  Building,
  Phone,
  Mail,
  AlertTriangle,
  ArrowUpDown,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  Layers,
  ArrowLeft,
  Tag,
  DollarSign,
  Package,
  SlidersHorizontal,
  X
} from 'lucide-react';

const COMMON_REASONS = [
  'Selected Competitor / Price',
  'Client Cancelled Project',
  'Delivery Timeline Delay',
  'Specification / Size Mismatch',
  'Quality / Sample Rejection',
  'Budget Constraints',
  'Duplicate / Test Order'
];

export default function LostOrders() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const notify = useNotification();
  const confirm = useConfirm();

  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingOrderId, setExportingOrderId] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [executiveFilter, setExecutiveFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all'); // 'all', 'today', 'this_week', 'this_month', 'last_30_days', 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortBy, setSortBy] = useState('lostAt_desc');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'card'

  // Modals
  const [viewingOrder, setViewingOrder] = useState(null);
  const [reopeningOrder, setReopeningOrder] = useState(null);
  const [reopenNotes, setReopenNotes] = useState('');
  const [isReopening, setIsReopening] = useState(false);

  // Executives list for filter
  const [executives, setExecutives] = useState([]);

  // Compute date range from preset
  const computedDateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
      return { from: start, to: end };
    }
    if (datePreset === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(now.setDate(diff));
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to: new Date().toISOString() };
    }
    if (datePreset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      return { from: start, to: new Date().toISOString() };
    }
    if (datePreset === 'last_30_days') {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return { from: start, to: new Date().toISOString() };
    }
    if (datePreset === 'custom') {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : '',
        to: customTo ? new Date(customTo + 'T23:59:59.999Z').toISOString() : ''
      };
    }
    return { from: '', to: '' };
  }, [datePreset, customFrom, customTo]);

  // Fetch Lost Orders from API
  const fetchLostOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (reasonFilter !== 'all') params.append('reason', reasonFilter);
      if (executiveFilter !== 'all') params.append('salesExecutive', executiveFilter);
      if (computedDateRange.from) params.append('from', computedDateRange.from);
      if (computedDateRange.to) params.append('to', computedDateRange.to);
      if (sortBy) params.append('sortBy', sortBy);

      const res = await api.get(`/orders/lost?${params.toString()}`);
      setOrders(res.data?.orders || []);
      setSummary(res.data?.summary || null);

      // Collect unique executives for filter dropdown if not yet set
      if (res.data?.orders) {
        const execMap = new Map();
        res.data.orders.forEach(o => {
          if (o.salesExecutive?._id && o.salesExecutive?.name) {
            execMap.set(o.salesExecutive._id.toString(), o.salesExecutive.name);
          }
        });
        setExecutives(Array.from(execMap.entries()).map(([id, name]) => ({ id, name })));
      }
    } catch (err) {
      console.error('Error fetching lost orders:', err);
      notify.error(err.response?.data?.message || 'Failed to load lost orders');
      setOrders([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, reasonFilter, executiveFilter, computedDateRange, sortBy, notify]);

  useEffect(() => {
    fetchLostOrders();
  }, [fetchLostOrders]);

  // Handle Export to Excel
  const handleExport = async () => {
    try {
      setExporting(true);
      await exportLostOrdersToExcel({
        search: searchQuery,
        reason: reasonFilter,
        from: computedDateRange.from,
        to: computedDateRange.to,
        salesExecutive: executiveFilter,
        notify
      });
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // Handle Single Order Dossier Export
  const handleExportSingle = async (ord) => {
    if (!ord?._id) return;
    try {
      setExportingOrderId(ord._id);
      const safeNo = ord.orderNo || `ORD-${ord._id.slice(-6)}`;
      await exportSingleOrderToExcel(ord._id, safeNo, notify);
    } catch (err) {
      console.error('Export single dossier error:', err);
    } finally {
      setExportingOrderId(null);
    }
  };

  // Handle Reopen Order
  const handleConfirmReopen = async (e) => {
    e?.preventDefault();
    if (!reopeningOrder?._id) return;

    try {
      setIsReopening(true);
      const res = await api.put(`/orders/${reopeningOrder._id}/reopen`, {
        notes: reopenNotes
      });
      notify.success(res.data?.message || `Order restored back to confirmed!`);
      setReopeningOrder(null);
      setReopenNotes('');
      if (viewingOrder?._id === reopeningOrder._id) {
        setViewingOrder(null);
      }
      fetchLostOrders();
    } catch (err) {
      console.error('Failed to reopen order:', err);
      notify.error(err.response?.data?.message || 'Failed to reopen order');
    } finally {
      setIsReopening(false);
    }
  };

  // Handle Delete Order (super_admin)
  const handleDeleteOrder = async (orderId, orderNo) => {
    const isConfirmed = await confirm({
      title: 'Move Order to Trash',
      message: `Are you sure you want to move order "${orderNo || orderId}" to Trash?`,
      confirmLabel: 'Move to Trash',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });

    if (!isConfirmed) return;

    try {
      await api.delete(`/orders/${orderId}`);
      notify.success(`Order "${orderNo || orderId}" moved to Trash`);
      if (viewingOrder?._id === orderId) {
        setViewingOrder(null);
      }
      fetchLostOrders();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to delete order');
    }
  };

  // Helper to format date & time nicely
  const formatDateTime = (dateVal) => {
    if (!dateVal) return { formatted: '—', relative: '' };
    const dateObj = new Date(dateVal);
    if (isNaN(dateObj.getTime())) return { formatted: '—', relative: '' };

    const formatted = dateObj.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) + ', ' + dateObj.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Calculate relative time
    const diffMs = Date.now() - dateObj.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let relative = '';
    if (diffDays === 0) relative = 'Today';
    else if (diffDays === 1) relative = 'Yesterday';
    else if (diffDays < 30) relative = `${diffDays} days ago`;
    else relative = `${Math.floor(diffDays / 30)} mo ago`;

    return { formatted, relative };
  };

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (reasonFilter !== 'all') count++;
    if (executiveFilter !== 'all') count++;
    if (datePreset !== 'all') count++;
    return count;
  }, [searchQuery, reasonFilter, executiveFilter, datePreset]);

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setReasonFilter('all');
    setExecutiveFilter('all');
    setDatePreset('all');
    setCustomFrom('');
    setCustomTo('');
    setSortBy('lostAt_desc');
  };

  return (
    <div className="space-y-6 pb-16 font-sans">

      {/* TOP CONTROLS ROW */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Link
              to="/orders"
              className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition shadow-2xs"
              title="Back to Active Orders"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <span>Lost Orders</span>
              <span className="px-2.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-lg flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                Retention & Loss Review
              </span>
            </h1>
          </div>
          <p className="text-slate-500 text-sm mt-1 font-normal">
            Track cancelled customer orders, reasons for loss, and exact dates and times to prevent future customer churn
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
          {/* Active Orders Quick Link */}
          <Link
            to="/orders"
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Layers size={14} className="text-slate-500" />
            <span>Active Orders</span>
          </Link>

          {/* Export to Excel */}
          <button
            onClick={handleExport}
            disabled={exporting || loading || orders.length === 0}
            className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Download Lost Orders Audit Register (.xlsx)"
          >
            <Download size={14} className={`text-slate-400 ${exporting ? 'animate-bounce' : ''}`} />
            <span>{exporting ? 'Exporting...' : 'Export Lost Orders (.xlsx)'}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={fetchLostOrders}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl shadow-2xs transition cursor-pointer"
            title="Refresh lost orders list"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI METRIC SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Lost Orders */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            <FileX size={20} />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-slate-500 block leading-tight truncate">Total Lost Orders</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">
              {(summary?.totalLostOrders ?? orders.length).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* 2. Lost Revenue Potential */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <TrendingDown size={20} />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-slate-500 block leading-tight truncate">Lost Order Value</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block truncate">
              {summary?.totalLostAmount ? `₹${summary.totalLostAmount.toLocaleString('en-IN')}` : '₹0'}
            </span>
          </div>
        </div>

        {/* 3. Lost Label Units */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
            <Package size={20} />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-slate-500 block leading-tight truncate">Total Lost Units</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">
              {(summary?.totalLostUnits ?? 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* 4. Top Reason for Loss */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-slate-500 block leading-tight truncate">Primary Loss Reason</span>
            <span className="text-sm font-bold text-slate-900 mt-1 block truncate" title={summary?.topReason || 'None'}>
              {summary?.topReason || 'Unspecified'}
            </span>
          </div>
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <CollapsibleFilterCard
        title="Search & Filter Lost Orders"
        activeCount={activeFilterCount}
        onClear={handleResetFilters}
        defaultOpen={true}
      >
        <div className="space-y-4">
          {/* Top Row: Search Input & Quick Controls */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Order #, Customer, Company, Product, or Loss Reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9.5 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-slate-500 hidden sm:inline">Sort:</span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-rose-500/40 cursor-pointer"
                >
                  <option value="lostAt_desc">Marked as Lost (Newest First)</option>
                  <option value="lostAt_asc">Marked as Lost (Oldest First)</option>
                  <option value="amount_desc">Order Value (Highest First)</option>
                  <option value="amount_asc">Order Value (Lowest First)</option>
                  <option value="orderDate_desc">Original PO Date (Newest)</option>
                  <option value="orderDate_asc">Original PO Date (Oldest)</option>
                  <option value="orderNo_asc">Order No (A - Z)</option>
                </select>
                <ArrowUpDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* View Mode Toggle */}
              <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    viewMode === 'card' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cards
                </button>
              </div>
            </div>
          </div>

          {/* Quick Reason Filter Pills */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Filter by Reason:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setReasonFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  reasonFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Reasons
              </button>
              {COMMON_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReasonFilter(reasonFilter === r ? 'all' : r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                    reasonFilter === r
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{r}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date Range & Sales Executive Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            {/* Date Preset */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">Date Marked as Lost:</label>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 cursor-pointer"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
                <option value="last_30_days">Last 30 Days</option>
                <option value="custom">Custom Date Range...</option>
              </select>
            </div>

            {/* Custom From / To */}
            {datePreset === 'custom' && (
              <>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">From Date:</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">To Date:</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                  />
                </div>
              </>
            )}

            {/* Sales Executive Filter */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">Sales Executive:</label>
              <select
                value={executiveFilter}
                onChange={(e) => setExecutiveFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 cursor-pointer"
              >
                <option value="all">All Sales Executives</option>
                {executives.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </CollapsibleFilterCard>

      {/* MAIN ORDERS VIEW */}
      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : orders.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-2xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-400 mx-auto flex items-center justify-center border border-slate-200">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">No Lost Orders Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto font-normal">
            {activeFilterCount > 0
              ? 'No lost orders match your current filter and search criteria. Try clearing or widening your filters.'
              : 'Great news! There are currently no lost or cancelled orders recorded in the system.'}
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="mt-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition shadow-2xs"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80 text-[11px] uppercase tracking-wider">
                  <th className="p-4 py-3.5">Order No & PO Date</th>
                  <th className="p-4 py-3.5">Customer & Account</th>
                  <th className="p-4 py-3.5">Items & Specs</th>
                  <th className="p-4 py-3.5 text-right">Order Value</th>
                  <th className="p-4 py-3.5">Reason for Loss</th>
                  <th className="p-4 py-3.5">Marked as Lost (Date & Time)</th>
                  <th className="p-4 py-3.5">Marked By</th>
                  <th className="p-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((ord) => {
                  const safeOrderNo = ord.orderNo || `ORD-${ord._id.slice(-6)}`;
                  const poDateStr = ord.orderDate
                    ? new Date(ord.orderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—';
                  const custName = ord.customerId?.name || 'Unnamed Customer';
                  const company = ord.customerId?.company;
                  const phone = ord.customerId?.phone;
                  const totalUnits = (ord.lineItems || []).reduce((sum, li) => sum + (li.qty || 0), 0);
                  const firstItem = ord.lineItems?.[0];
                  const itemSummary = firstItem
                    ? `${firstItem.name || 'Label Product'}${firstItem.dimensionKey ? ` (${firstItem.dimensionKey})` : ''}`
                    : 'Standard Label';
                  const extraItemsCount = (ord.lineItems?.length || 0) - 1;

                  const lossTime = formatDateTime(ord.lostAt || ord.updatedAt);
                  const markedBy = ord.lostBy?.name || ord.salesExecutive?.name || 'Staff';

                  return (
                    <tr
                      key={ord._id}
                      onClick={() => setViewingOrder(ord)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      {/* 1. Order No & PO Date */}
                      <td className="p-4">
                        <div className="font-bold text-slate-900 group-hover:text-rose-600 transition font-mono">
                          {safeOrderNo}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                          <Calendar size={11} />
                          <span>PO Date: {poDateStr}</span>
                        </div>
                      </td>

                      {/* 2. Customer & Account */}
                      <td className="p-4">
                        <div className="font-semibold text-slate-900 line-clamp-1 max-w-[200px]" title={custName}>
                          {custName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-normal line-clamp-1">
                          {company || phone || '—'}
                        </div>
                      </td>

                      {/* 3. Items & Specs */}
                      <td className="p-4">
                        <div className="font-medium text-slate-800 line-clamp-1 max-w-[220px]" title={itemSummary}>
                          {itemSummary}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span className="font-semibold text-slate-600">{totalUnits.toLocaleString('en-IN')} units</span>
                          {extraItemsCount > 0 && (
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded text-[10px] font-bold">
                              +{extraItemsCount} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Order Value */}
                      <td className="p-4 text-right">
                        <div className="font-bold text-slate-900">
                          {ord.amount != null ? `₹${ord.amount.toLocaleString('en-IN')}` : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase">
                          {ord.advanceReceived ? 'Adv Paid' : 'Unpaid'}
                        </div>
                      </td>

                      {/* 5. Reason for Loss */}
                      <td className="p-4">
                        <div className="max-w-[240px]">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200/80 rounded-lg text-xs font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                            <span className="line-clamp-1" title={ord.lostReason || 'Unspecified Reason'}>
                              {ord.lostReason || 'Unspecified Reason'}
                            </span>
                          </span>
                          {ord.lostNotes && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-1 italic" title={ord.lostNotes}>
                              "{ord.lostNotes}"
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 6. Date & Time Marked as Lost */}
                      <td className="p-4">
                        <div className="font-medium text-slate-800 flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-400 shrink-0" />
                          <span>{lossTime.formatted}</span>
                        </div>
                        {lossTime.relative && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5 pl-4">
                            ({lossTime.relative})
                          </div>
                        )}
                      </td>

                      {/* 7. Marked By */}
                      <td className="p-4">
                        <div className="font-medium text-slate-800 line-clamp-1">{markedBy}</div>
                        {ord.salesExecutive?.name && ord.salesExecutive?.name !== markedBy && (
                          <div className="text-[10px] text-slate-400">Exec: {ord.salesExecutive.name}</div>
                        )}
                      </td>

                      {/* 8. Actions */}
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Dossier */}
                          <button
                            type="button"
                            onClick={() => setViewingOrder(ord)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                            title="View Full Lost Order Dossier"
                          >
                            <Eye size={14} />
                          </button>

                          {/* Reopen Order */}
                          <button
                            type="button"
                            onClick={() => {
                              setReopeningOrder(ord);
                              setReopenNotes('');
                            }}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition cursor-pointer"
                            title="Reopen / Restore Order to Confirmed"
                          >
                            <RotateCcw size={14} />
                          </button>

                          {/* Delete (super_admin) */}
                          {role === 'super_admin' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(ord._id, safeOrderNo)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg transition cursor-pointer"
                              title="Move Order to Trash"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orders.map((ord) => {
            const safeOrderNo = ord.orderNo || `ORD-${ord._id.slice(-6)}`;
            const poDateStr = ord.orderDate
              ? new Date(ord.orderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : '—';
            const custName = ord.customerId?.name || 'Unnamed Customer';
            const company = ord.customerId?.company;
            const totalUnits = (ord.lineItems || []).reduce((sum, li) => sum + (li.qty || 0), 0);
            const lossTime = formatDateTime(ord.lostAt || ord.updatedAt);

            return (
              <AccordionCard
                key={ord._id}
                title={
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                      <FileX size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 font-mono text-xs">{safeOrderNo}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full font-bold">Lost</span>
                      </div>
                      <div className="font-medium text-slate-600 text-[11px] truncate">{custName}</div>
                    </div>
                  </div>
                }
                action={
                  <div className="text-right">
                    <span className="font-bold text-slate-900 text-xs block">
                      {ord.amount != null ? `₹${ord.amount.toLocaleString('en-IN')}` : '—'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {totalUnits.toLocaleString('en-IN')} units
                    </span>
                  </div>
                }
              >
                <div className="space-y-3 pt-2 text-xs">
                  {/* Reason Banner */}
                  <div className="p-3 bg-rose-50/70 border border-rose-200/70 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-rose-900 text-[11px] uppercase tracking-wider">
                      <AlertTriangle size={13} className="text-rose-600" />
                      <span>Reason for Loss</span>
                    </div>
                    <p className="font-semibold text-rose-800 text-xs">{ord.lostReason || 'Unspecified'}</p>
                    {ord.lostNotes && <p className="text-[11px] text-rose-600 italic">"{ord.lostNotes}"</p>}
                  </div>

                  {/* Timestamp & Team Member */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 block font-medium">Marked Lost At:</span>
                      <span className="font-semibold text-slate-800">{lossTime.formatted}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Original PO Date:</span>
                      <span className="font-semibold text-slate-800">{poDateStr}</span>
                    </div>
                  </div>

                  {/* Line Items List */}
                  {ord.lineItems && ord.lineItems.length > 0 && (
                    <div className="space-y-1 border-t border-slate-100 pt-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Items:</span>
                      <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto">
                        {ord.lineItems.map((li, idx) => (
                          <div key={idx} className="py-1.5 flex items-center justify-between text-[11px]">
                            <div className="min-w-0 pr-2">
                              <span className="font-medium text-slate-800 block truncate">{li.name || 'Label'}</span>
                              {li.dimensionKey && <span className="text-slate-400 text-[10px] font-mono">{li.dimensionKey}</span>}
                            </div>
                            <span className="font-semibold text-slate-700 shrink-0">{li.qty?.toLocaleString('en-IN')} pcs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Card Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setViewingOrder(ord)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Eye size={13} />
                      <span>Full Dossier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReopeningOrder(ord);
                        setReopenNotes('');
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer shadow-2xs transition"
                    >
                      <RotateCcw size={13} />
                      <span>Reopen Order</span>
                    </button>
                  </div>
                </div>
              </AccordionCard>
            );
          })}
        </div>
      )}

      {/* FULL LOST ORDER DOSSIER MODAL */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200/80 space-y-5 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-lg font-mono">
                    {viewingOrder.orderNo || `ORD-${viewingOrder._id.slice(-6)}`}
                  </h3>
                  <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-full">
                    Lost Order
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-0.5">
                  Original PO Date: {viewingOrder.orderDate ? new Date(viewingOrder.orderDate).toLocaleDateString('en-IN') : '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* HIGHLIGHTED LOSS REASON & TIMESTAMP CARD */}
            <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-rose-600" />
                  Reason for Loss
                </span>
                <span className="text-[11px] font-semibold text-rose-700">
                  {formatDateTime(viewingOrder.lostAt || viewingOrder.updatedAt).relative}
                </span>
              </div>
              <p className="text-sm font-bold text-rose-950">
                "{viewingOrder.lostReason || 'Unspecified Reason'}"
              </p>
              {viewingOrder.lostNotes && (
                <p className="text-xs text-rose-700 italic border-l-2 border-rose-300 pl-2 mt-1">
                  Notes: {viewingOrder.lostNotes}
                </p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-rose-200/60 text-[11px] text-rose-800">
                <span>
                  <strong>Date & Time Marked:</strong> {formatDateTime(viewingOrder.lostAt || viewingOrder.updatedAt).formatted}
                </span>
                <span>
                  <strong>Marked By:</strong> {viewingOrder.lostBy?.name || viewingOrder.salesExecutive?.name || 'Staff'}
                </span>
              </div>
            </div>

            {/* Customer Details Box */}
            <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Customer</span>
                  <div className="font-bold text-slate-900 text-sm">{viewingOrder.customerId?.name}</div>
                  {viewingOrder.customerId?.company && (
                    <div className="text-slate-600 text-xs font-medium">{viewingOrder.customerId.company}</div>
                  )}
                </div>
                {viewingOrder.customerId?._id && (
                  <button
                    onClick={() => {
                      setViewingOrder(null);
                      navigate(`/customers/${viewingOrder.customerId._id}`);
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
                  >
                    View Account →
                  </button>
                )}
              </div>
              {(viewingOrder.customerId?.phone || viewingOrder.customerId?.email) && (
                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-200/60 text-slate-600 text-[11px]">
                  {viewingOrder.customerId?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={12} className="text-slate-400" />
                      {viewingOrder.customerId.phone}
                    </span>
                  )}
                  {viewingOrder.customerId?.email && (
                    <span className="flex items-center gap-1">
                      <Mail size={12} className="text-slate-400" />
                      {viewingOrder.customerId.email}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Line Items Table */}
            {viewingOrder.lineItems && viewingOrder.lineItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Order Items</h4>
                  <span className="text-xs font-semibold text-slate-500">
                    Total: {viewingOrder.lineItems.reduce((s, li) => s + (li.qty || 0), 0).toLocaleString('en-IN')} units
                  </span>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[10px] uppercase">
                        <th className="p-2.5">Product & Specs</th>
                        <th className="p-2.5 text-right">Qty</th>
                        <th className="p-2.5 text-right">Price</th>
                        <th className="p-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingOrder.lineItems.map((item, idx) => {
                        const lineAmt = item.lineTotal != null
                          ? item.lineTotal
                          : (item.price != null && item.qty ? item.qty * item.price : null);

                        return (
                          <tr key={idx}>
                            <td className="p-2.5">
                              <div className="font-semibold text-slate-800">{item.name || 'Label Product'}</div>
                              {item.dimensionKey && (
                                <div className="text-[10px] text-slate-400 font-mono">Dimension: {item.dimensionKey}</div>
                              )}
                              {item.description && (
                                <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2" title={item.description}>
                                  {item.description}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-medium text-slate-700">
                              {item.qty?.toLocaleString('en-IN')}
                            </td>
                            <td className="p-2.5 text-right text-slate-500">
                              {item.price != null ? `₹${item.price.toFixed(2)}` : '—'}
                            </td>
                            <td className="p-2.5 text-right font-bold text-slate-800">
                              {lineAmt != null ? `₹${lineAmt.toLocaleString('en-IN')}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Delivery Address & Notes */}
            {viewingOrder.deliveryAddress && (
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600">
                <span className="font-semibold text-slate-800 block mb-0.5">Delivery Address:</span>
                {viewingOrder.deliveryAddress}
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportSingle(viewingOrder)}
                  disabled={exportingOrderId === viewingOrder._id}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition disabled:opacity-50"
                  title="Export Order Dossier to Excel (.xlsx)"
                >
                  <Download size={14} className={exportingOrderId === viewingOrder._id ? 'animate-bounce' : ''} />
                  <span>Export Dossier</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReopeningOrder(viewingOrder);
                    setReopenNotes('');
                  }}
                  className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-emerald-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                >
                  <RotateCcw size={14} />
                  <span>Reopen Order</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setViewingOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REOPEN ORDER CONFIRMATION MODAL */}
      {reopeningOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200/80 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                  <RotateCcw size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Reopen / Restore Order</h3>
                  <p className="text-[11px] text-slate-400">Restore order to Confirmed active status</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReopeningOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to restore order{' '}
              <strong className="text-slate-900 font-mono">
                {reopeningOrder.orderNo || `ORD-${reopeningOrder._id.slice(-6)}`}
              </strong>{' '}
              back to active <strong>Confirmed</strong> orders?
            </p>

            {reopeningOrder.lostReason && (
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700 block">Previous Loss Reason:</span>
                "{reopeningOrder.lostReason}"
              </div>
            )}

            <form onSubmit={handleConfirmReopen} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Reopen Notes (Optional):
                </label>
                <textarea
                  rows={2}
                  value={reopenNotes}
                  onChange={(e) => setReopenNotes(e.target.value)}
                  placeholder="e.g. Customer re-engaged, agreed on adjusted unit price..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isReopening}
                  onClick={() => setReopeningOrder(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  loading={isReopening}
                  loadingText="Restoring..."
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  Confirm & Reopen
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
