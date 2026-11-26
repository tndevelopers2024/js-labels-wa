import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import NewOrderModal from '../components/NewOrderModal';
import AccordionCard from '../components/ui/AccordionCard';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import LoadingButton from '../components/ui/LoadingButton';
import {
  Calendar,
  Download,
  Plus,
  FileText,
  CheckSquare,
  Truck,
  Clock,
  XCircle,
  FileX,
  ArrowUpDown,
  Eye,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  User,
  Search,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { SkeletonTable } from '../components/ui/Skeleton';
import { exportAllOrdersToExcel, exportSingleOrderToExcel } from '../utils/exportUtils';

export default function Orders() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const notify = useNotification();
  const confirm = useConfirm();

  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exportingAll, setExportingAll] = useState(false);
  const [exportingOrderId, setExportingOrderId] = useState(null);

  // Month & Date Filtering State
  const [availableMonths, setAvailableMonths] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('all'); // 'all' or 'YYYY-MM'
  const [selectedYear, setSelectedYear] = useState('all');   // 'all' or 'YYYY'
  const [dateFrom, setDateFrom] = useState('');              // 'YYYY-MM-DD'
  const [dateTo, setDateTo] = useState('');                  // 'YYYY-MM-DD'

  // Bulk Import Invoices State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Mark as Lost State
  const [orderToMarkLost, setOrderToMarkLost] = useState(null);
  const [lossReason, setLossReason] = useState('Price too high / Competitor quoted lower');
  const [lossNotes, setLossNotes] = useState('');
  const [isSubmittingLoss, setIsSubmittingLoss] = useState(false);

  const canDelete = role === 'super_admin';

  const fetchAvailableMonths = async () => {
    try {
      const res = await api.get('/orders/available-months');
      if (res.data) {
        setAvailableMonths(res.data.months || []);
        setAvailableYears(res.data.years || []);
      }
    } catch (err) {
      console.error('Error fetching available order months:', err);
    }
  };

  const handleConfirmMarkLost = async (e) => {
    e?.preventDefault();
    if (!orderToMarkLost) return;
    try {
      setIsSubmittingLoss(true);
      await api.put(`/orders/${orderToMarkLost._id}/mark-lost`, {
        reason: lossReason,
        notes: lossNotes
      });
      notify.success(`Order "${orderToMarkLost.orderNo || 'ORD'}" marked as lost`);
      setOrderToMarkLost(null);
      setLossNotes('');
      if (viewingOrder?._id === orderToMarkLost._id) {
        setViewingOrder(null);
      }
      fetchOrders();
    } catch (err) {
      console.error('Mark as lost error:', err);
      notify.error(err.response?.data?.message || 'Failed to mark order as lost');
    } finally {
      setIsSubmittingLoss(false);
    }
  };

  const handleImportSubmit = async (e) => {
    e?.preventDefault();
    if (!importFile) {
      notify.error('Please select an Excel file (.xlsx or .xls) to import');
      return;
    }

    try {
      setIsImporting(true);
      setImportResult(null);

      const form = new FormData();
      form.append('file', importFile);

      const res = await api.post('/orders/import-excel', form, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setImportResult(res.data);
      notify.success(res.data?.message || 'Invoice orders imported successfully!');
      fetchOrders();
      fetchAvailableMonths();
    } catch (err) {
      console.error('Invoice orders import failed:', err);
      const msg = err.response?.data?.message || 'Failed to import orders from Excel file';
      notify.error(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportAllOrders = async () => {
    try {
      setExportingAll(true);
      await exportAllOrdersToExcel({
        status: statusFilter,
        month: selectedMonth,
        year: selectedYear,
        from: dateFrom,
        to: dateTo,
        search: searchQuery,
        notify
      });
    } catch (err) {
      console.error('Export all orders error:', err);
    } finally {
      setExportingAll(false);
    }
  };

  const handleExportSingleOrder = async (ord) => {
    if (!ord?._id) return;
    try {
      setExportingOrderId(ord._id);
      const safeNo = ord.orderNo || `ORD-${ord._id.slice(-6)}`;
      await exportSingleOrderToExcel(ord._id, safeNo, notify);
    } catch (err) {
      console.error('Export single order error:', err);
    } finally {
      setExportingOrderId(null);
    }
  };

  const fetchOrders = async (overrideParams = {}) => {
    try {
      setLoading(true);
      const params = {
        status: overrideParams.status !== undefined ? overrideParams.status : statusFilter,
        month: overrideParams.month !== undefined ? overrideParams.month : selectedMonth,
        year: overrideParams.year !== undefined ? overrideParams.year : selectedYear,
        from: overrideParams.from !== undefined ? overrideParams.from : dateFrom,
        to: overrideParams.to !== undefined ? overrideParams.to : dateTo,
        search: overrideParams.search !== undefined ? overrideParams.search : searchQuery
      };

      const cleanParams = {};
      if (params.status && params.status !== 'all') cleanParams.status = params.status;
      if (params.month && params.month !== 'all') cleanParams.month = params.month;
      if (params.year && params.year !== 'all') cleanParams.year = params.year;
      if (params.from) cleanParams.from = params.from;
      if (params.to) cleanParams.to = params.to;
      if (params.search && params.search.trim()) cleanParams.search = params.search.trim();

      const res = await api.get('/orders', { params: cleanParams });
      setOrders(res.data?.orders || []);
      setSummary(res.data?.summary || null);
    } catch (err) {
      console.error('Error fetching orders:', err);
      notify.error(err.response?.data?.message || 'Error loading orders from database');
      setOrders([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableMonths();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders();
    }, 200);
    return () => clearTimeout(timer);
  }, [statusFilter, selectedMonth, selectedYear, dateFrom, dateTo, searchQuery]);

  const handleResetFilters = () => {
    setStatusFilter('all');
    setSelectedMonth('all');
    setSelectedYear('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  };

  const handleDeleteOrder = async (orderId, orderNo) => {
    const isConfirmed = await confirm({
      title: 'Move Order to Trash',
      message: `Are you sure you want to soft-delete order "${orderNo || orderId}"?`,
      confirmLabel: 'Move to Trash',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });

    if (!isConfirmed) return;

    try {
      await api.delete(`/orders/${orderId}`);
      notify.success(`Order "${orderNo || orderId}" moved to Trash`);
      fetchOrders();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to delete order');
    }
  };

  // Status Badge Styling matching reference design
  const renderStatusBadge = (statusStr) => {
    const s = (statusStr || '').toLowerCase();
    switch (s) {
      case 'delivered':
        return (
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Delivered
          </span>
        );
      case 'confirmed':
        return (
          <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Confirmed
          </span>
        );
      case 'dispatched':
        return (
          <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Dispatched
          </span>
        );
      case 'pending':
        return (
          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            Pending
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Cancelled
          </span>
        );
      case 'lost':
        return (
          <span className="px-3 py-1 bg-red-100 text-red-800 border border-red-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
            Lost
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            {statusStr || 'Pending'}
          </span>
        );
    }
  };

  const getInitials = (name) => {
    if (!name) return 'EX';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6 pb-12 font-sans">

      {/* Top Controls Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Order Management</h1>
          <p className="text-slate-500 text-sm mt-1 font-normal">Track confirmed customer orders, fulfillment status, and revenue</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          {/* Import Invoices Button */}
          <button
            onClick={() => {
              setImportFile(null);
              setImportResult(null);
              setShowImportModal(true);
            }}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 shadow-2xs transition cursor-pointer"
            title="Import orders from invoice Excel spreadsheet (.xlsx)"
          >
            <UploadCloud size={14} className="text-emerald-600" />
            <span>Import Invoices (.xlsx)</span>
          </button>

          {/* Export to Excel Button */}
          <button
            onClick={handleExportAllOrders}
            disabled={exportingAll}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Export filtered orders report to Excel (.xlsx)"
          >
            <Download size={14} className={`text-slate-400 ${exportingAll ? 'animate-bounce' : ''}`} />
            <span>{exportingAll ? 'Exporting...' : 'Export to Excel (.xlsx)'}</span>
          </button>

          {/* Lost Orders Dedicated Page Link */}
          <button
            onClick={() => navigate('/orders/lost')}
            className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-2xs transition cursor-pointer"
            title="View Lost & Cancelled Orders Archive"
          >
            <FileX size={14} className="text-rose-600" />
            <span>Lost Orders</span>
            {summary?.statusCounts?.lost > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-200 text-rose-800 text-[10px] font-bold">
                {summary.statusCounts.lost}
              </span>
            )}
          </button>

          {/* New Order Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={16} />
            <span>New Order</span>
          </button>
        </div>
      </div>

      {/* Top 5 KPI Metric Summary Cards Row (Dispatched removed, all clickable to dedicated pages) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">

        {/* 1. Total Orders */}
        <div
          onClick={() => setStatusFilter('all')}
          className={`bg-white p-4 rounded-2xl border ${statusFilter === 'all' ? 'border-indigo-400 ring-2 ring-indigo-500/10' : 'border-slate-200/80'} shadow-2xs flex items-center justify-between gap-3 cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group`}
          title="Filter all orders on this dashboard"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <FileText size={18} />
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block leading-none">Total Orders</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">
                {(summary?.totalOrders ?? orders.length).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
          <ChevronRight size={15} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>

        {/* 2. Confirmed */}
        <div
          onClick={() => navigate('/orders/confirmed')}
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
          title="Open separate Confirmed Orders page"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <CheckSquare size={18} />
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block leading-none">Confirmed</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">
                {summary?.statusCounts?.confirmed ?? orders.filter(o => o.status === 'confirmed').length}
              </span>
            </div>
          </div>
          <ChevronRight size={15} className="text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>

        {/* 3. Delivered */}
        <div
          onClick={() => navigate('/orders/delivered')}
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all group"
          title="Open separate Delivered Orders page"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Truck size={18} />
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block leading-none">Delivered</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">
                {summary?.statusCounts?.delivered ?? orders.filter(o => o.status === 'delivered').length}
              </span>
            </div>
          </div>
          <ChevronRight size={15} className="text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>

        {/* 4. Pending */}
        <div
          onClick={() => navigate('/orders/pending')}
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 cursor-pointer hover:border-purple-400 hover:shadow-md transition-all group"
          title="Open separate Pending Orders page"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Clock size={18} />
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block leading-none">Pending</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">
                {summary?.statusCounts?.pending ?? orders.filter(o => o.status === 'pending').length}
              </span>
            </div>
          </div>
          <ChevronRight size={15} className="text-slate-300 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>

        {/* 5. Cancelled */}
        <div
          onClick={() => navigate('/orders/cancelled')}
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 cursor-pointer hover:border-rose-400 hover:shadow-md transition-all group"
          title="Open separate Cancelled Orders page"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <XCircle size={18} />
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block leading-none">Cancelled</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">
                {summary?.statusCounts?.cancelled ?? orders.filter(o => o.status === 'cancelled').length}
              </span>
            </div>
          </div>
          <ChevronRight size={15} className="text-slate-300 group-hover:text-rose-600 group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>

      </div>

      {/* Filter & Search Controls Wrapped in CollapsibleFilterCard */}
      {(() => {
        const filteredOrders = orders;

        const activeCount =
          (statusFilter !== 'all' ? 1 : 0) +
          (selectedMonth !== 'all' ? 1 : 0) +
          (selectedYear !== 'all' ? 1 : 0) +
          (dateFrom || dateTo ? 1 : 0) +
          (searchQuery ? 1 : 0);

        return (
          <>
            <CollapsibleFilterCard
              title="Order Filters & Search"
              activeCount={activeCount}
              defaultOpen={true}
              onClear={handleResetFilters}
            >
              <div className="space-y-3.5">
                {/* Row 1: Month, Year, and Date Range Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                  
                  {/* Month Dropdown */}
                  <div className="lg:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Calendar size={13} className="text-red-500" />
                      <span>Filter by Month</span>
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedMonth(val);
                        if (val !== 'all') {
                          setDateFrom('');
                          setDateTo('');
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 transition cursor-pointer"
                    >
                      <option value="all">All Months</option>
                      {availableMonths.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label} ({m.orderCount} {m.orderCount === 1 ? 'order' : 'orders'})
                        </option>
                      ))}
                      {availableMonths.length === 0 && (
                        <option value={new Date().toISOString().slice(0, 7)}>Current Month</option>
                      )}
                    </select>
                  </div>

                  {/* Year Dropdown */}
                  <div className="lg:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Filter by Year
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedYear(val);
                        if (val !== 'all') {
                          setDateFrom('');
                          setDateTo('');
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 transition cursor-pointer"
                    >
                      <option value="all">All Years</option>
                      {availableYears.map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date Range: From & To */}
                  <div className="lg:col-span-5">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Custom Date Range
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                          setDateFrom(e.target.value);
                          setSelectedMonth('all');
                          setSelectedYear('all');
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                        title="Start Date"
                      />
                      <span className="text-xs text-slate-400 font-medium shrink-0">to</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                          setDateTo(e.target.value);
                          setSelectedMonth('all');
                          setSelectedYear('all');
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                        title="End Date"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 2: Status Tabs and Search */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-100">
                  {/* Status Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                    {[
                      { key: 'all', label: 'All Orders' },
                      { key: 'confirmed', label: 'Confirmed' },
                      { key: 'delivered', label: 'Delivered' },
                      { key: 'pending', label: 'Pending' },
                      { key: 'cancelled', label: 'Cancelled' },
                      { key: 'lost', label: 'Lost' }
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setStatusFilter(tab.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${statusFilter === tab.key
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Search Input & Reset Button */}
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-[240px]">
                      <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search order ID, customer, executive..."
                        className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {activeCount > 0 && (
                      <button
                        onClick={handleResetFilters}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl border border-rose-200 transition shrink-0 cursor-pointer flex items-center gap-1"
                        title="Clear all active filters"
                      >
                        <RotateCcw size={13} />
                        <span className="hidden sm:inline">Reset</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleFilterCard>

            {/* Main Data View */}
            {loading ? (
              <SkeletonTable rows={8} cols={7} />
            ) : filteredOrders.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-2xl border border-slate-200/80 space-y-3">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                  <FileText size={24} />
                </div>
                <h3 className="font-semibold text-slate-800 text-base">No Orders Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto font-normal">
                  {searchQuery || statusFilter !== 'all'
                    ? 'No orders match your search query or selected filter criteria.'
                    : 'There are no active order records in the database.'}
                </p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-2xs hover:bg-red-700"
                >
                  <Plus size={16} />
                  <span>Create New Order</span>
                </button>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden scrollbar-hide">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold text-[11px] bg-slate-50/50">
                          <th className="p-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span>Order ID</span>
                              <ArrowUpDown size={12} className="text-slate-400" />
                            </div>
                          </th>
                          <th className="p-4 py-3.5">Customer</th>
                          <th className="p-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span>PO Date</span>
                              <ArrowUpDown size={12} className="text-slate-400" />
                            </div>
                          </th>
                          <th className="p-4 py-3.5">Status</th>
                          <th className="p-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span>Delivery Date</span>
                              <ArrowUpDown size={12} className="text-slate-400" />
                            </div>
                          </th>
                          <th className="p-4 py-3.5">Sales Executive</th>
                          <th className="p-4 py-3.5 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredOrders.map((ord) => {
                          const custName = ord.customerId?.name || ord.customerName || 'N/A';
                          const company = ord.customerId?.company || ord.company || 'Individual Account';
                          const formattedOrderNo = ord.orderNo || `ORD-${ord._id?.slice(-6)}`;
                          const orderDateStr = ord.orderDate ? new Date(ord.orderDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
                          const amountVal = ord.amount || 0;
                          const deliveryDateStr = ord.deliveryDate ? new Date(ord.deliveryDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
                          const execName = ord.salesExecutive?.name || 'Unassigned';
                          const execRole = ord.salesExecutive?.role ? (ord.salesExecutive.role === 'caller' ? 'Caller' : ord.salesExecutive.role) : 'Executive';

                          return (
                            <tr key={ord._id} className="hover:bg-slate-50/80 transition group">
                              <td
                                className="p-4 font-bold text-blue-600 hover:underline cursor-pointer"
                                onClick={() => setViewingOrder(ord)}
                              >
                                {formattedOrderNo}
                              </td>
                              <td className="p-4">
                                <p className="font-bold text-slate-900 leading-tight">{custName}</p>
                                <p className="text-[11px] text-slate-400 font-normal mt-0.5">{company}</p>
                              </td>
                              <td className="p-4 text-slate-700 font-medium">{orderDateStr}</td>
                              <td className="p-4">{renderStatusBadge(ord.status)}</td>
                              <td className="p-4">
                                <div className="font-medium text-slate-900">{deliveryDateStr}</div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2.5">
                                  {ord.salesExecutive?.avatarUrl ? (
                                    <img
                                      src={ord.salesExecutive.avatarUrl}
                                      alt={execName}
                                      className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                                      {getInitials(execName)}
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-[10px] text-slate-400 font-medium leading-tight capitalize">{execRole}</p>
                                    <p className="text-xs font-semibold text-slate-800">{execName}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => setViewingOrder(ord)}
                                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                                    title="View Order Details"
                                  >
                                    <Eye size={15} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExportSingleOrder(ord);
                                    }}
                                    disabled={exportingOrderId === ord._id}
                                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 transition cursor-pointer disabled:opacity-50"
                                    title="Export Order Dossier to Excel (.xlsx)"
                                  >
                                    <Download size={14} className={exportingOrderId === ord._id ? 'animate-bounce' : ''} />
                                  </button>
                                  {ord.status !== 'lost' && ord.status !== 'cancelled' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOrderToMarkLost(ord);
                                      }}
                                      className="w-8 h-8 rounded-lg border border-rose-200 flex items-center justify-center text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition cursor-pointer"
                                      title="Mark Order as Lost"
                                    >
                                      <FileX size={14} />
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
                  <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                    <span className="text-slate-500 font-medium">Showing {filteredOrders.length} of {orders.length} orders</span>
                  </div>
                </div>

                {/* Mobile Accordion View */}
                <div className="md:hidden space-y-3">
                  {filteredOrders.map((ord) => {
                    const custName = ord.customerId?.name || ord.customerName || 'N/A';
                    const company = ord.customerId?.company || ord.company || 'Individual Account';
                    const formattedOrderNo = ord.orderNo || `ORD-${ord._id?.slice(-6)}`;
                    const orderDateStr = ord.orderDate ? new Date(ord.orderDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
                    const amountVal = ord.amount || 0;
                    const deliveryDateStr = ord.deliveryDate ? new Date(ord.deliveryDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
                    const execName = ord.salesExecutive?.name || 'Unassigned';

                    return (
                      <AccordionCard
                        key={ord._id}
                        title={
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm truncate">{formattedOrderNo}</span>
                            </div>
                            <p className="text-xs text-slate-500 font-normal truncate mt-0.5">{custName} • {company}</p>
                          </div>
                        }
                        headerExtra={
                          <div className="flex items-center gap-2 shrink-0">
                            {renderStatusBadge(ord.status)}
                          </div>
                        }
                      >
                        <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                          <div>
                            <span className="text-slate-400 font-medium text-[11px] block">PO Date</span>
                            <span className="font-semibold text-slate-800">{orderDateStr}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium text-[11px] block">Expected Delivery</span>
                            <span className="font-semibold text-slate-800">{deliveryDateStr}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium text-[11px] block">Sales Executive</span>
                            <span className="font-semibold text-slate-800">{execName}</span>
                          </div>
                          {ord.lineItems && ord.lineItems.length > 0 && (
                            <div className="col-span-2 bg-slate-100/70 p-2.5 rounded-xl">
                              <span className="text-slate-500 font-semibold text-[11px] block mb-1">
                                Order Items ({ord.lineItems.length}):
                              </span>
                              <div className="space-y-1">
                                {ord.lineItems.slice(0, 3).map((item, i) => (
                                  <div key={i} className="flex items-center justify-between text-[11px] text-slate-700">
                                    <span className="truncate">
                                      <span className="font-semibold text-slate-900">{item.name || 'Label Product'}</span>
                                      {item.dimensionKey && (
                                        <span className="ml-1 text-[10px] text-slate-500 font-mono">[{item.dimensionKey}]</span>
                                      )}
                                    </span>
                                    <span className="font-semibold shrink-0">x{item.qty?.toLocaleString('en-IN')}</span>
                                  </div>
                                ))}
                                {ord.lineItems.length > 3 && (
                                  <span className="text-[10px] text-slate-400 italic block font-normal">+ {ord.lineItems.length - 3} more items</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingOrder(ord);
                            }}
                            className="flex-1 py-2 px-3 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition text-center cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Eye size={14} />
                            <span>Details</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportSingleOrder(ord);
                            }}
                            disabled={exportingOrderId === ord._id}
                            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                            title="Export Order Dossier to Excel (.xlsx)"
                          >
                            <Download size={13} className={exportingOrderId === ord._id ? 'animate-bounce' : ''} />
                            <span>Export</span>
                          </button>
                          {ord.status !== 'lost' && ord.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOrderToMarkLost(ord);
                              }}
                              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                              title="Mark Order as Lost"
                            >
                              <FileX size={13} />
                              <span>Mark Lost</span>
                            </button>
                          )}
                          {ord.customerId?._id && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/customers/${ord.customerId._id}`);
                              }}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                            >
                              Customer →
                            </button>
                          )}
                        </div>
                      </AccordionCard>
                    );
                  })}
                </div>
              </>
            )}
          </>
        );
      })()}

      {/* View Order Details Popup Modal */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto scrollbar-hide font-sans">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order Details</span>
                <h3 className="text-base font-bold text-slate-900">{viewingOrder.orderNo || `ORD-${viewingOrder._id?.slice(-6)}`}</h3>
              </div>
              <button onClick={() => setViewingOrder(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">

              {/* Customer Account Info */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 font-medium">Customer Account</p>
                  <p className="font-bold text-slate-900">{viewingOrder.customerId?.name || viewingOrder.customerName || 'Customer Account'}</p>
                  {viewingOrder.customerId?.company && (
                    <p className="text-[11px] text-slate-500 font-normal">{viewingOrder.customerId.company}</p>
                  )}
                </div>
                {viewingOrder.customerId?._id && (
                  <button
                    onClick={() => {
                      setViewingOrder(null);
                      navigate(`/customers/${viewingOrder.customerId._id}`);
                    }}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Customer Details →
                  </button>
                )}
              </div>

              {/* Status & Order Date */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <p className="text-[10px] text-slate-400 font-medium mb-0.5">Order Status</p>
                  {renderStatusBadge(viewingOrder.status)}
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-medium">PO Date</p>
                  <p className="font-semibold text-slate-800">
                    {new Date(viewingOrder.poDate || viewingOrder.orderDate || viewingOrder.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {viewingOrder.expectedReorderDate && (
                <div className="p-3 bg-red-50/50 border border-red-100 rounded-xl flex items-center justify-between">
                  <span className="font-medium text-slate-700">Expected Reorder Date:</span>
                  <span className="font-bold text-red-600">
                    {new Date(viewingOrder.expectedReorderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}

              {viewingOrder.deliveryDate && (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <span className="font-medium text-slate-600">Delivery Date:</span>
                  <span className="font-semibold text-slate-900">
                    {new Date(viewingOrder.deliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}

              {viewingOrder.poNumber && (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <span className="font-medium text-slate-600">PO Number:</span>
                  <span className="font-semibold text-slate-900">{viewingOrder.poNumber}</span>
                </div>
              )}

              {viewingOrder.salesExecutive?.name && (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <span className="font-medium text-slate-600">Sales Executive:</span>
                  <span className="font-semibold text-slate-900">{viewingOrder.salesExecutive.name}</span>
                </div>
              )}

              {/* Line Items Table */}
              {viewingOrder.lineItems && viewingOrder.lineItems.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">Order Line Items</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[10px] uppercase">
                          <th className="p-2.5">Product & Dimension</th>
                          <th className="p-2.5 text-right">Qty</th>
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
                                <div className="font-medium text-slate-800">{item.name || 'Label Product'}</div>
                                {item.dimensionKey && (
                                  <div className="text-[10px] text-slate-400 font-mono">Dimension: {item.dimensionKey}</div>
                                )}
                                {item.description && (
                                  <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2" title={item.description}>
                                    {item.description}
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-right text-slate-600 font-medium">{item.qty?.toLocaleString('en-IN')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}


              {viewingOrder.deliveryAddress && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600">
                  <span className="font-semibold text-slate-800 block mb-1">Delivery Address:</span>
                  {viewingOrder.deliveryAddress}
                </div>
              )}

              {viewingOrder.notes && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600">
                  <span className="font-semibold text-slate-800 block mb-1">Order Notes:</span>
                  {viewingOrder.notes}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
              <button
                type="button"
                onClick={() => handleExportSingleOrder(viewingOrder)}
                disabled={exportingOrderId === viewingOrder._id}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition disabled:opacity-50"
                title="Export Order Dossier to Excel (.xlsx)"
              >
                <Download size={14} className={exportingOrderId === viewingOrder._id ? 'animate-bounce' : ''} />
                <span>{exportingOrderId === viewingOrder._id ? 'Exporting...' : 'Export Order (.xlsx)'}</span>
              </button>

              <div className="flex items-center gap-2">
                {viewingOrder.status !== 'lost' && viewingOrder.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => {
                      setOrderToMarkLost(viewingOrder);
                    }}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                    title="Mark Order as Lost"
                  >
                    <FileX size={14} />
                    <span>Mark as Lost</span>
                  </button>
                )}
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
        </div>
      )}

      {/* Import Invoices Excel Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Import Orders from Invoice File</h3>
                  <p className="text-[11px] text-slate-400">Upload an Excel (.xlsx) file containing invoice rows</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportResult(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {importResult ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <span>{importResult.message || 'Import completed successfully!'}</span>
                  </div>
                  {importResult.summary && (
                    <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-medium border-t border-emerald-200">
                      <div>Parsed Line Items: <span className="font-bold text-slate-800">{importResult.summary.totalParsedLineItems}</span></div>
                      <div>Orders Created: <span className="font-bold text-emerald-700">{importResult.summary.createdOrdersCount}</span></div>
                      <div>Products Created: <span className="font-bold text-blue-700">{importResult.summary.productsCreatedCount}</span></div>
                      <div>Products Enriched: <span className="font-bold text-indigo-700">{importResult.summary.productsUpdatedCount}</span></div>
                    </div>
                  )}
                </div>

                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] space-y-1 max-h-36 overflow-y-auto">
                    <div className="flex items-center gap-1 font-semibold text-amber-900">
                      <AlertCircle size={14} />
                      <span>{importResult.errors.length} Warnings/Skipped Rows:</span>
                    </div>
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="pl-2 border-l-2 border-amber-300">{err}</div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportFile(null);
                      setImportResult(null);
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleImportSubmit} className="space-y-4 text-xs">
                <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/60 hover:bg-slate-50 transition text-center space-y-2">
                  <input
                    type="file"
                    id="order-excel-file-input"
                    accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setImportFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                  <label
                    htmlFor="order-excel-file-input"
                    className="cursor-pointer flex flex-col items-center justify-center space-y-2 py-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <UploadCloud size={20} />
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800 hover:text-emerald-700">
                        {importFile ? importFile.name : 'Click to select Excel file'}
                      </span>
                      <p className="text-[11px] text-slate-500 font-normal">
                        Supports invoice workbooks (.xlsx or .xls)
                      </p>
                    </div>
                  </label>
                  {importFile && (
                    <div className="text-[11px] text-emerald-700 font-medium">
                      Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1">
                  <span className="font-semibold text-slate-800 block">Automatic Processing Rules:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                    <li>Matches customer via exact name, phone number, and billing address.</li>
                    <li>Groups consecutive invoice lines by Customer and Date into single orders.</li>
                    <li>Sets Invoice Date as the order PO Date.</li>
                    <li>Matches items to product catalog and updates product descriptions.</li>
                  </ul>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => {
                      setShowImportModal(false);
                      setImportFile(null);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <LoadingButton
                    type="submit"
                    disabled={!importFile}
                    loading={isImporting}
                    loadingText="Importing..."
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    Upload & Import
                  </LoadingButton>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Mark Order as Lost Modal */}
      {orderToMarkLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <FileX size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Mark Order as Lost</h3>
                  <p className="text-[11px] text-slate-500">
                    Order: <span className="font-semibold text-slate-800">{orderToMarkLost.orderNo || `ORD-${orderToMarkLost._id?.slice(-6)}`}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setOrderToMarkLost(null);
                  setLossNotes('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmMarkLost} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Primary Reason for Loss <span className="text-rose-500">*</span>
                </label>
                <select
                  value={lossReason}
                  onChange={(e) => setLossReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer"
                >
                  <option value="Price too high / Competitor quoted lower">Price too high / Competitor quoted lower</option>
                  <option value="Lead time / Delivery timeline issue">Lead time / Delivery timeline issue</option>
                  <option value="Customer postponed/cancelled project">Customer postponed/cancelled project</option>
                  <option value="Quality / Specification mismatch">Quality / Specification mismatch</option>
                  <option value="Credit / Payment terms disagreement">Credit / Payment terms disagreement</option>
                  <option value="Customer unresponsive / Ghosted">Customer unresponsive / Ghosted</option>
                  <option value="Sample rejected">Sample rejected</option>
                  <option value="Other">Other reason</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Detailed Notes / Feedback (Optional)
                </label>
                <textarea
                  rows={3}
                  value={lossNotes}
                  onChange={(e) => setLossNotes(e.target.value)}
                  placeholder="Provide any feedback or specifics heard from the client..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-normal focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200/60 rounded-xl flex items-start gap-2 text-amber-800 text-[11px] leading-relaxed">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                <span>
                  This order will be moved to the dedicated <strong>Lost Orders</strong> register. You can review or restore it at any time from the Lost Orders page.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmittingLoss}
                  onClick={() => {
                    setOrderToMarkLost(null);
                    setLossNotes('');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  loading={isSubmittingLoss}
                  loadingText="Marking..."
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  Confirm as Lost
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {isModalOpen && (
        <NewOrderModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchOrders();
          }}
        />
      )}

    </div>
  );
}


