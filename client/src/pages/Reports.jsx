import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';
import {
  Calendar,
  Filter,
  Download,
  ShoppingBag,
  RefreshCw,
  TrendingUp,
  Users,
  FileText,
  ChevronDown,
  ChevronRight,
  Info,
  ArrowUp,
  FileSpreadsheet,
  Layers,
  Search,
  Package,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowUpDown,
  ExternalLink,
  DollarSign,
  Maximize2
} from 'lucide-react';
import AccordionCard from '../components/ui/AccordionCard';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import { Skeleton, SkeletonCard, SkeletonStatsGrid } from '../components/ui/Skeleton';
import {
  exportMonthlyReportToExcel,
  exportIndividualCustomerReportToExcel,
  exportIndividualProductReportToExcel
} from '../utils/exportUtils';

export default function Reports() {
  const navigate = useNavigate();
  const notify = useNotification();

  // Navigation / View Tabs: 'overview', 'customers', 'products'
  const [activeTab, setActiveTab] = useState('overview');

  // Month & Date Filtering State
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectionType, setSelectionType] = useState('month'); // 'month' | 'preset' | 'custom'
  const [selectedMonth, setSelectedMonth] = useState(''); // e.g. '2026-10'
  const [selectedPreset, setSelectedPreset] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Additional Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedExecutive, setSelectedExecutive] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [executives, setExecutives] = useState([]);

  // Data Loading & State
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [ordersStatusData, setOrdersStatusData] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [execPerformance, setExecPerformance] = useState([]);

  // Tabular Summaries
  const [customerSummaries, setCustomerSummaries] = useState([]);
  const [productSummaries, setProductSummaries] = useState([]);

  // Export Loading Indicators
  const [exportingMonthly, setExportingMonthly] = useState(false);
  const [exportingCustomerId, setExportingCustomerId] = useState(null);
  const [exportingProductId, setExportingProductId] = useState(null);

  // Sorting
  const [sortField, setSortField] = useState('revenue');
  const [sortAsc, setSortAsc] = useState(false);

  // Load available months on mount
  useEffect(() => {
    async function loadMeta() {
      try {
        const [monthsRes, usersRes] = await Promise.all([
          api.get('/reports/available-months'),
          api.get('/users?role=caller').catch(() => ({ data: [] }))
        ]);

        const monthsList = Array.isArray(monthsRes.data) ? monthsRes.data : (monthsRes.data?.months || []);
        setAvailableMonths(monthsList);

        // Default to the most active month or most recent month
        if (monthsList.length > 0) {
          const mostActive = [...monthsList].sort((a, b) => (b.orderCount || b.count || 0) - (a.orderCount || a.count || 0))[0];
          setSelectedMonth(mostActive.key || mostActive.month);
        } else {
          const nowStr = new Date().toISOString().slice(0, 7);
          setSelectedMonth(nowStr);
        }

        const callerUsers = Array.isArray(usersRes.data)
          ? usersRes.data.filter(u => u.role === 'caller' || u.role === 'manager')
          : [];
        setExecutives(callerUsers);
      } catch (err) {
        console.error('Failed to load reports metadata:', err);
      }
    }
    loadMeta();
  }, []);

  // Build current query params
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();

    if (selectionType === 'month' && selectedMonth) {
      params.append('month', selectedMonth);
    } else if (selectionType === 'preset') {
      params.append('period', selectedPreset);
    } else if (selectionType === 'custom') {
      if (customFrom) params.append('from', customFrom);
      if (customTo) params.append('to', customTo);
    }

    if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
    if (selectedExecutive && selectedExecutive !== 'all') params.append('salesExecutive', selectedExecutive);
    if (searchQuery) params.append('search', searchQuery);

    return params;
  }, [selectionType, selectedMonth, selectedPreset, customFrom, customTo, statusFilter, selectedExecutive, searchQuery]);

  // Fetch report data
  const fetchReportsData = useCallback(async () => {
    if (!selectedMonth && selectionType === 'month') return;
    try {
      setLoading(true);
      const qs = buildQueryParams().toString();
      const queryParam = qs ? `?${qs}` : '';

      const [overRes, trendRes, prodRes, statRes, custRes, execRes, custSummaryRes, prodSummaryRes] = await Promise.allSettled([
        api.get(`/reports/overview${queryParam}`),
        api.get(`/reports/revenue-trend${queryParam}`),
        api.get(`/reports/top-products${queryParam}`),
        api.get(`/reports/orders-by-status${queryParam}`),
        api.get(`/reports/top-customers${queryParam}`),
        api.get(`/reports/executive-performance${queryParam}`),
        api.get(`/reports/customer-summary${queryParam}`),
        api.get(`/reports/product-summary${queryParam}`)
      ]);

      setOverview(overRes.status === 'fulfilled' ? overRes.value.data : null);
      setTrendData(trendRes.status === 'fulfilled' ? trendRes.value.data : []);
      setTopProducts(prodRes.status === 'fulfilled' ? prodRes.value.data : []);
      setOrdersStatusData(statRes.status === 'fulfilled' ? statRes.value.data : []);
      setTopCustomers(custRes.status === 'fulfilled' ? custRes.value.data : []);
      setExecPerformance(execRes.status === 'fulfilled' ? execRes.value.data : []);
      setCustomerSummaries(custSummaryRes.status === 'fulfilled' ? (Array.isArray(custSummaryRes.value.data) ? custSummaryRes.value.data : (custSummaryRes.value.data?.customers || [])) : []);
      setProductSummaries(prodSummaryRes.status === 'fulfilled' ? (Array.isArray(prodSummaryRes.value.data) ? prodSummaryRes.value.data : (prodSummaryRes.value.data?.products || [])) : []);
    } catch (err) {
      console.error('Error fetching reports:', err);
      notify.error('Failed to load reports for the selected period');
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams, selectedMonth, selectionType, notify]);

  useEffect(() => {
    fetchReportsData();
  }, [fetchReportsData]);

  // Handle Full Monthly Report Excel Export
  const handleExportMonthly = async () => {
    try {
      setExportingMonthly(true);
      const opts = {
        month: selectionType === 'month' ? selectedMonth : undefined,
        period: selectionType === 'preset' ? selectedPreset : undefined,
        from: selectionType === 'custom' ? customFrom : undefined,
        to: selectionType === 'custom' ? customTo : undefined,
        status: statusFilter,
        salesExecutive: selectedExecutive,
        search: searchQuery
      };
      await exportMonthlyReportToExcel(opts, notify);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExportingMonthly(false);
    }
  };

  // Handle Individual Customer Export
  const handleExportSingleCustomer = async (cust) => {
    const custId = cust.id || cust.customerId;
    const custName = cust.name || cust.customerName || 'Customer';
    try {
      setExportingCustomerId(custId);
      const opts = {
        month: selectionType === 'month' ? selectedMonth : undefined,
        period: selectionType === 'preset' ? selectedPreset : undefined,
        from: selectionType === 'custom' ? customFrom : undefined,
        to: selectionType === 'custom' ? customTo : undefined
      };
      await exportIndividualCustomerReportToExcel(custId, custName, opts, notify);
    } catch (err) {
      console.error('Single customer export error:', err);
    } finally {
      setExportingCustomerId(null);
    }
  };

  // Handle Individual Product Export
  const handleExportSingleProduct = async (prod) => {
    const prodId = prod.id || prod.productId;
    const prodName = prod.name || prod.productName || 'Product';
    try {
      setExportingProductId(prodId);
      const opts = {
        month: selectionType === 'month' ? selectedMonth : undefined,
        period: selectionType === 'preset' ? selectedPreset : undefined,
        from: selectionType === 'custom' ? customFrom : undefined,
        to: selectionType === 'custom' ? customTo : undefined
      };
      await exportIndividualProductReportToExcel(prodId, prodName, opts, notify);
    } catch (err) {
      console.error('Single product export error:', err);
    } finally {
      setExportingProductId(null);
    }
  };

  // Customer summaries filtered & sorted
  const sortedCustomers = useMemo(() => {
    const list = [...customerSummaries];
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'name') {
        valA = (a.name || a.customerName || '').toLowerCase();
        valB = (b.name || b.customerName || '').toLowerCase();
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortField === 'orderCount') {
        valA = a.ordersCount ?? a.orderCount ?? 0;
        valB = b.ordersCount ?? b.orderCount ?? 0;
      } else if (sortField === 'totalQty') {
        valA = a.totalUnits ?? a.totalQty ?? 0;
        valB = b.totalUnits ?? b.totalQty ?? 0;
      } else if (sortField === 'revenue') {
        valA = a.totalRevenue ?? a.revenue ?? 0;
        valB = b.totalRevenue ?? b.revenue ?? 0;
      } else {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }
      return sortAsc ? valA - valB : valB - valA;
    });
    return list;
  }, [customerSummaries, sortField, sortAsc]);

  // Product summaries filtered & sorted
  const sortedProducts = useMemo(() => {
    const list = [...productSummaries];
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'name') {
        valA = (a.name || a.productName || '').toLowerCase();
        valB = (b.name || b.productName || '').toLowerCase();
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortField === 'orderCount') {
        valA = a.ordersCount ?? a.orderCount ?? 0;
        valB = b.ordersCount ?? b.orderCount ?? 0;
      } else if (sortField === 'totalQty') {
        valA = a.totalUnits ?? a.totalQty ?? 0;
        valB = b.totalUnits ?? b.totalQty ?? 0;
      } else if (sortField === 'revenue') {
        valA = a.totalRevenue ?? a.revenue ?? 0;
        valB = b.totalRevenue ?? b.revenue ?? 0;
      } else {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }
      return sortAsc ? valA - valB : valB - valA;
    });
    return list;
  }, [productSummaries, sortField, sortAsc]);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (selectedExecutive !== 'all' ? 1 : 0) + (searchQuery ? 1 : 0);

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Top Header & Export Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Reports & Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5 font-normal">
            Month-based sales performance, product dimensions analysis, and customer dossier exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            onClick={handleExportMonthly}
            disabled={exportingMonthly || loading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Download multi-sheet monthly report workbook in Excel (.xlsx)"
          >
            <FileSpreadsheet size={15} className={`shrink-0 ${exportingMonthly ? 'animate-bounce' : ''}`} />
            <span>{exportingMonthly ? 'Generating Excel...' : 'Export Monthly Report (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* Month & Period Selector Card */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar size={15} className="text-indigo-600" />
              <span>Reporting Period:</span>
            </span>
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setSelectionType('month')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  selectionType === 'month'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Month-Wise
              </button>
              <button
                type="button"
                onClick={() => setSelectionType('preset')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  selectionType === 'preset'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Quick Preset
              </button>
              <button
                type="button"
                onClick={() => setSelectionType('custom')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  selectionType === 'custom'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom Range
              </button>
            </div>
          </div>

          {/* Month Selector or Preset Selector */}
          <div className="flex flex-wrap items-center gap-2.5">
            {selectionType === 'month' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Select Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {availableMonths.map((m) => {
                    const monthKey = m.key || m.month;
                    const orderNum = m.orderCount ?? m.count ?? 0;
                    return (
                      <option key={monthKey} value={monthKey}>
                        {m.label} ({orderNum} {orderNum === 1 ? 'order' : 'orders'} • ₹{(m.totalAmount || 0).toLocaleString('en-IN')})
                      </option>
                    );
                  })}
                  {availableMonths.length === 0 && (
                    <option value={new Date().toISOString().slice(0, 7)}>Current Month</option>
                  )}
                </select>
              </div>
            )}

            {selectionType === 'preset' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Preset:</span>
                <select
                  value={selectedPreset}
                  onChange={(e) => setSelectedPreset(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="last_30_days">Last 30 Days</option>
                  <option value="this_quarter">This Quarter</option>
                  <option value="this_year">This Year</option>
                  <option value="all_time">All Time</option>
                </select>
              </div>
            )}

            {selectionType === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Filter Controls Card */}
      <CollapsibleFilterCard
        title="Filter & Search Reports"
        activeFilterCount={activeFilterCount}
        onReset={() => {
          setStatusFilter('all');
          setSelectedExecutive('all');
          setSearchQuery('');
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Order Status */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Order Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="delivered">Delivered</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Sales Executive */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Sales Executive
            </label>
            <select
              value={selectedExecutive}
              onChange={(e) => setSelectedExecutive(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Executives</option>
              {executives.map((ex) => (
                <option key={ex._id} value={ex._id}>
                  {ex.name} ({ex.email || 'Exec'})
                </option>
              ))}
            </select>
          </div>

          {/* Search Term */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Search Customer / Product
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, PO, dimension..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </div>
      </CollapsibleFilterCard>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Period Orders</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview?.totalOrders?.display || '0'}
          </div>
          <div className="text-[11px] font-semibold text-blue-600">
            {overview?.periodOrders ? `${overview.periodOrders} orders in filter` : 'Database records'}
          </div>
        </div>

        {/* Total Units */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Units</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Package size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {(overview?.totalUnits || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-semibold text-indigo-600">
            Ordered label volume
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview?.totalRevenue?.display || '₹0'}
          </div>
          <div className="text-[11px] font-semibold text-emerald-600">
            Gross booking amount
          </div>
        </div>

        {/* Average Order Value */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Avg Order Value (AOV)</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview?.aov?.display || '₹0'}
          </div>
          <div className="text-[11px] font-semibold text-purple-600">
            Per confirmed invoice
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-bold transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp size={16} />
          <span>Overview & Trends</span>
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`pb-3 text-sm font-bold transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeTab === 'customers'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users size={16} />
          <span>Customer Reports ({customerSummaries.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`pb-3 text-sm font-bold transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeTab === 'products'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package size={16} />
          <span>Product Reports with Dimensions ({productSummaries.length})</span>
        </button>
      </div>

      {/* Tab 1: Overview & Analytics */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Revenue Trend Area Chart */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Monthly Revenue Trend</h3>
                <p className="text-xs text-slate-400">Day-by-day revenue generated across the filtered timeline</p>
              </div>
            </div>
            {trendData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Revenue']}
                      contentStyle={{ backgroundColor: '#1E293B', borderRadius: 8, color: '#fff', fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#4F46E5" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-slate-400 text-xs italic">
                No revenue points in the selected range.
              </div>
            )}
          </div>

          {/* Top Products & Orders by Status Donuts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Products Volume Donut */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm">Top Products by Volume</h3>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                  {topProducts.length} Items
                </span>
              </div>
              {topProducts.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-40 h-40 relative shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={topProducts}
                          dataKey="percentage"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="60%"
                          outerRadius="85%"
                          paddingAngle={2}
                        >
                          {topProducts.map((entry, idx) => (
                            <Cell key={`prod-${idx}`} fill={entry.color || '#4F46E5'} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1 w-full min-w-0">
                    {topProducts.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-xl text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color || '#4F46E5' }} />
                          <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                        </div>
                        <span className="font-bold text-slate-900 shrink-0">{p.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">No product volume recorded</div>
              )}
            </div>

            {/* Orders Status Donut */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm">Orders by Status</h3>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                  {overview?.totalOrders?.display || '0'} Total
                </span>
              </div>
              {ordersStatusData.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-40 h-40 relative shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={ordersStatusData}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="60%"
                          outerRadius="85%"
                          paddingAngle={2}
                        >
                          {ordersStatusData.map((entry, idx) => (
                            <Cell key={`stat-${idx}`} fill={entry.color || '#10B981'} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1 w-full min-w-0">
                    {ordersStatusData.map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-xl text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color || '#10B981' }} />
                          <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                        </div>
                        <span className="font-bold text-slate-900 shrink-0">{s.count} orders ({s.percentage})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">No status breakdown recorded</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Separate Customer Reports */}
      {activeTab === 'customers' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Customer Performance & Reports</h3>
              <p className="text-xs text-slate-400">
                Individual customer sales summary for the filtered period with one-click Excel dossier export
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Showing {sortedCustomers.length} active customers
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 cursor-pointer" onClick={() => toggleSort('name')}>
                    <div className="flex items-center gap-1">
                      <span>Customer & Company</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer" onClick={() => toggleSort('orderCount')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Orders</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer" onClick={() => toggleSort('totalQty')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Total Units</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer" onClick={() => toggleSort('revenue')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Revenue (₹)</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Last Order</th>
                  <th className="py-3 px-4 text-right">Individual Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedCustomers.length > 0 ? (
                  sortedCustomers.map((cust) => {
                    const cId = cust.id || cust.customerId;
                    const cName = cust.name || cust.customerName || 'Customer';
                    const ordCount = cust.ordersCount ?? cust.orderCount ?? 0;
                    const totalQty = cust.totalUnits ?? cust.totalQty ?? 0;
                    const rev = cust.totalRevenue ?? cust.revenue ?? 0;
                    return (
                      <tr key={cId} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{cName}</div>
                          <div className="text-[11px] text-slate-400 font-normal">{cust.company || '—'}</div>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-800">
                          {ordCount}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-700">
                          {totalQty.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                          ₹{rev.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 text-[11px]">
                          {cust.lastOrderDate ? new Date(cust.lastOrderDate).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleExportSingleCustomer(cust)}
                            disabled={exportingCustomerId === cId}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                            title={`Export complete order dossier for ${cName} (.xlsx)`}
                          >
                            <Download size={13} className={exportingCustomerId === cId ? 'animate-bounce' : ''} />
                            <span>{exportingCustomerId === cId ? 'Exporting...' : 'Export (.xlsx)'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                      No customer orders found in the selected period and filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Separate Product Reports with Dimensions */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Product Reports & Dimensions Breakdown</h3>
              <p className="text-xs text-slate-400">
                Detailed dimensions (width, height, unit), dimension keys, and individual sales report export
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Showing {sortedProducts.length} ordered products
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 cursor-pointer" onClick={() => toggleSort('name')}>
                    <div className="flex items-center gap-1">
                      <span>Product Name & Key</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4">Dimensions (W x H)</th>
                  <th className="py-3 px-4 text-center cursor-pointer" onClick={() => toggleSort('orderCount')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Orders</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer" onClick={() => toggleSort('totalQty')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Total Units</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer" onClick={() => toggleSort('revenue')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Revenue (₹)</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right">Individual Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedProducts.length > 0 ? (
                  sortedProducts.map((prod) => {
                    const pId = prod.id || prod.productId;
                    const pName = prod.name || prod.productName || 'Product';
                    const ordCount = prod.ordersCount ?? prod.orderCount ?? 0;
                    const totalQty = prod.totalUnits ?? prod.totalQty ?? 0;
                    const rev = prod.totalRevenue ?? prod.revenue ?? 0;
                    const dimFormatted = prod.dimensions || prod.dimensionsFormatted || (prod.widthMm && prod.heightMm ? `${prod.widthMm} x ${prod.heightMm} ${prod.unit || 'MM'}` : 'N/A');
                    return (
                      <tr key={pId} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{pName}</div>
                          <div className="text-[11px] text-indigo-600 font-medium">{prod.dimensionKey || 'Standard'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-800 font-mono font-semibold text-[11px] inline-flex items-center gap-1">
                            <Maximize2 size={11} className="text-slate-400" />
                            {dimFormatted}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-800">
                          {ordCount}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-700">
                          {totalQty.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                          ₹{rev.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleExportSingleProduct(prod)}
                            disabled={exportingProductId === pId}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                            title={`Export sales dossier for ${pName} (.xlsx)`}
                          >
                            <Download size={13} className={exportingProductId === pId ? 'animate-bounce' : ''} />
                            <span>{exportingProductId === pId ? 'Exporting...' : 'Export (.xlsx)'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                      No product sales found in the selected period and filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer Info Note */}
      <div className="flex items-center justify-start gap-1.5 text-xs text-slate-400 font-medium pt-2">
        <span>All reports, dimensions, and financial KPIs calculated live from database records</span>
        <Info size={14} />
      </div>
    </div>
  );
}
