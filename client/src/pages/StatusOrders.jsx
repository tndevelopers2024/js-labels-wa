import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
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
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Building2,
  Package,
  Layers,
  ArrowLeft,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { SkeletonTable } from '../components/ui/Skeleton';
import { exportAllOrdersToExcel, exportSingleOrderToExcel } from '../utils/exportUtils';

const STATUS_CONFIGS = {
  confirmed: {
    statusKey: 'confirmed',
    title: 'Confirmed Orders',
    subtitle: 'Verified customer orders approved for manufacturing, scheduling, and fulfillment',
    icon: <CheckSquare size={22} className="text-blue-600" />,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
    cardBorderHover: 'hover:border-blue-400',
    kpiBg: 'bg-blue-50 text-blue-600',
    exportPrefix: 'Confirmed_Orders'
  },
  delivered: {
    statusKey: 'delivered',
    title: 'Delivered Orders',
    subtitle: 'Successfully completed, dispatched, and confirmed delivered shipments',
    icon: <Truck size={22} className="text-emerald-600" />,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    cardBorderHover: 'hover:border-emerald-400',
    kpiBg: 'bg-emerald-50 text-emerald-600',
    exportPrefix: 'Delivered_Orders'
  },
  pending: {
    statusKey: 'pending',
    title: 'Pending Orders',
    subtitle: 'New customer orders awaiting specification check, PO confirmation, or clearance',
    icon: <Clock size={22} className="text-purple-600" />,
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    dotClass: 'bg-purple-500',
    cardBorderHover: 'hover:border-purple-400',
    kpiBg: 'bg-purple-50 text-purple-600',
    exportPrefix: 'Pending_Orders'
  },
  cancelled: {
    statusKey: 'cancelled',
    title: 'Cancelled Orders',
    subtitle: 'Orders cancelled prior to or during fulfillment with optional restoration workflow',
    icon: <XCircle size={22} className="text-rose-600" />,
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-500',
    cardBorderHover: 'hover:border-rose-400',
    kpiBg: 'bg-rose-50 text-rose-600',
    exportPrefix: 'Cancelled_Orders'
  }
};

const STATUS_NAV_ITEMS = [
  { key: 'confirmed', label: 'Confirmed', path: '/orders/confirmed', color: 'text-blue-600', icon: <CheckSquare size={14} /> },
  { key: 'delivered', label: 'Delivered', path: '/orders/delivered', color: 'text-emerald-600', icon: <Truck size={14} /> },
  { key: 'pending', label: 'Pending', path: '/orders/pending', color: 'text-purple-600', icon: <Clock size={14} /> },
  { key: 'cancelled', label: 'Cancelled', path: '/orders/cancelled', color: 'text-rose-600', icon: <XCircle size={14} /> },
  { key: 'lost', label: 'Lost Orders', path: '/orders/lost', color: 'text-red-700', icon: <FileX size={14} /> }
];

export default function StatusOrders({ status: propStatus }) {
  const navigate = useNavigate();
  const { status: paramStatus } = useParams();
  const activeStatusKey = (propStatus || paramStatus || 'confirmed').toLowerCase();
  const config = STATUS_CONFIGS[activeStatusKey] || STATUS_CONFIGS.confirmed;

  const { role } = useAuth();
  const notify = useNotification();
  const confirm = useConfirm();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // all, today, week, month, custom
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedExecutive, setSelectedExecutive] = useState('all');
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest, units_desc, amount_desc

  // Modal States
  const [viewingOrder, setViewingOrder] = useState(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [orderToMarkLost, setOrderToMarkLost] = useState(null);
  const [lossReason, setLossReason] = useState('Price too high / Competitor quoted lower');
  const [lossNotes, setLossNotes] = useState('');
  const [isSubmittingLoss, setIsSubmittingLoss] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportingOrderId, setExportingOrderId] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  // Fetch orders for this status
  const fetchStatusOrders = async () => {
    try {
      setLoading(true);
      const res = await api.get('/orders', {
        params: {
          status: activeStatusKey,
          limit: 1000
        }
      });
      setOrders(res.data?.orders || []);
    } catch (err) {
      console.error('Error fetching status orders:', err);
      notify.error(err.response?.data?.message || `Failed to load ${config.title}`);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusOrders();
  }, [activeStatusKey]);

  // Extract unique sales executives
  const executivesList = useMemo(() => {
    const map = new Map();
    orders.forEach((o) => {
      if (o.salesExecutive?._id && o.salesExecutive?.name) {
        map.set(o.salesExecutive._id.toString(), o.salesExecutive.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  // Client-side filtering & sorting
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((ord) => {
        const orderNo = (ord.orderNo || `ORD-${ord._id?.slice(-6)}`).toLowerCase();
        const custName = (ord.customerId?.name || ord.customerName || '').toLowerCase();
        const company = (ord.customerId?.company || ord.company || '').toLowerCase();
        const phone = (ord.customerId?.phone || '').toLowerCase();
        const city = (ord.customerId?.city || '').toLowerCase();
        const poNo = (ord.poNumber || '').toLowerCase();
        const execName = (ord.salesExecutive?.name || '').toLowerCase();
        const itemNames = (ord.lineItems || []).map(li => (li.name || '').toLowerCase()).join(' ');

        return (
          orderNo.includes(q) ||
          custName.includes(q) ||
          company.includes(q) ||
          phone.includes(q) ||
          city.includes(q) ||
          poNo.includes(q) ||
          execName.includes(q) ||
          itemNames.includes(q)
        );
      });
    }

    // Date Presets Filter
    if (dateFilter !== 'all') {
      const now = new Date();
      result = result.filter((ord) => {
        const d = new Date(ord.poDate || ord.orderDate || ord.createdAt);
        if (isNaN(d.getTime())) return true;

        if (dateFilter === 'today') {
          return d.toDateString() === now.toDateString();
        }
        if (dateFilter === 'week') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          return d >= sevenDaysAgo && d <= now;
        }
        if (dateFilter === 'month') {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        if (dateFilter === 'custom') {
          if (customFrom && new Date(customFrom) > d) return false;
          if (customTo) {
            const end = new Date(customTo);
            end.setHours(23, 59, 59, 999);
            if (end < d) return false;
          }
          return true;
        }
        return true;
      });
    }

    // Sales Executive filter
    if (selectedExecutive !== 'all') {
      result = result.filter(o => o.salesExecutive?._id?.toString() === selectedExecutive);
    }

    // Sorting
    result.sort((a, b) => {
      const dateA = new Date(a.poDate || a.orderDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.poDate || b.orderDate || b.createdAt || 0).getTime();
      const unitsA = (a.lineItems || []).reduce((acc, i) => acc + (i.qty || 0), 0);
      const unitsB = (b.lineItems || []).reduce((acc, i) => acc + (i.qty || 0), 0);
      const amtA = a.amount || 0;
      const amtB = b.amount || 0;

      if (sortBy === 'newest') return dateB - dateA;
      if (sortBy === 'oldest') return dateA - dateB;
      if (sortBy === 'units_desc') return unitsB - unitsA;
      if (sortBy === 'amount_desc') return amtB - amtA;
      return dateB - dateA;
    });

    return result;
  }, [orders, searchQuery, dateFilter, customFrom, customTo, selectedExecutive, sortBy]);

  // Aggregate KPI Calculations
  const stats = useMemo(() => {
    const totalCount = orders.length;
    const filteredCount = filteredOrders.length;
    let totalUnits = 0;
    let totalAmount = 0;
    const uniqueCustomers = new Set();

    filteredOrders.forEach((o) => {
      totalAmount += (o.amount || 0);
      const cId = o.customerId?._id || o.customerId || o.customerName;
      if (cId) uniqueCustomers.add(cId.toString());
      (o.lineItems || []).forEach((li) => {
        totalUnits += (li.qty || 0);
      });
    });

    return {
      totalCount,
      filteredCount,
      totalUnits,
      totalAmount,
      uniqueCustomersCount: uniqueCustomers.size
    };
  }, [orders, filteredOrders]);

  // Export Excel
  const handleExportStatusOrders = async () => {
    try {
      setExportingAll(true);
      await exportAllOrdersToExcel({
        status: activeStatusKey,
        notify
      });
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExportingAll(false);
    }
  };

  // Export single order
  const handleExportSingle = async (ord) => {
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

  // Status Change Actions
  const handleUpdateStatus = async (orderId, targetStatus, label) => {
    const isConfirmed = await confirm({
      title: `${label} Order`,
      message: `Are you sure you want to change order status to "${targetStatus.toUpperCase()}"?`,
      confirmLabel: `Yes, ${label}`,
      cancelLabel: 'Cancel',
      variant: targetStatus === 'cancelled' ? 'danger' : 'primary'
    });

    if (!isConfirmed) return;

    try {
      setUpdatingOrderId(orderId);
      await api.patch(`/orders/${orderId}/status`, { status: targetStatus });
      notify.success(`Order marked as ${targetStatus}`);
      if (viewingOrder?._id === orderId) {
        setViewingOrder(null);
      }
      fetchStatusOrders();
    } catch (err) {
      console.error('Failed to update order status:', err);
      notify.error(err.response?.data?.message || 'Failed to update order status');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Mark as Lost submit
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
      fetchStatusOrders();
    } catch (err) {
      console.error('Mark as lost error:', err);
      notify.error(err.response?.data?.message || 'Failed to mark order as lost');
    } finally {
      setIsSubmittingLoss(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'EX';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const activeFilterCount = (searchQuery ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0) + (selectedExecutive !== 'all' ? 1 : 0);

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Top Breadcrumb & Status Navigation Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Link
            to="/orders"
            className="hover:text-slate-900 inline-flex items-center gap-1 font-semibold text-slate-600 transition"
          >
            <ArrowLeft size={13} />
            <span>Order Management Dashboard</span>
          </Link>
          <span>/</span>
          <span className="capitalize font-bold text-slate-800">{config.title}</span>
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl ${config.kpiBg} flex items-center justify-center shrink-0 shadow-2xs border border-slate-200/60`}>
              {config.icon}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{config.title}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${config.badgeClass}`}>
                  {stats.totalCount} orders
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-0.5 font-normal max-w-xl">{config.subtitle}</p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            <button
              onClick={handleExportStatusOrders}
              disabled={exportingAll || orders.length === 0}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 shadow-2xs transition cursor-pointer disabled:opacity-50"
              title={`Download ${config.title} in Excel format`}
            >
              <Download size={14} className={`text-slate-400 ${exportingAll ? 'animate-bounce' : ''}`} />
              <span>{exportingAll ? 'Exporting...' : `Export ${config.title} (.xlsx)`}</span>
            </button>

            <button
              onClick={() => setIsNewOrderModalOpen(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} />
              <span>New Order</span>
            </button>
          </div>
        </div>

        {/* Status Switcher Tabs Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide pt-1">
          <Link
            to="/orders"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1.5"
          >
            <Layers size={13} />
            <span>All Orders Dashboard</span>
          </Link>
          {STATUS_NAV_ITEMS.map((item) => {
            const isActive = activeStatusKey === item.key;
            return (
              <Link
                key={item.key}
                to={item.path}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={isActive ? 'text-white' : item.color}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 4 Focused KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Status Orders */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${config.kpiBg} flex items-center justify-center shrink-0`}>
            {config.icon}
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block leading-none">{config.title}</span>
            <span className="text-xl font-bold text-slate-900 mt-1 block">
              {stats.filteredCount.toLocaleString('en-IN')}
              {stats.filteredCount !== stats.totalCount && (
                <span className="text-xs text-slate-400 font-normal ml-1">/ {stats.totalCount}</span>
              )}
            </span>
          </div>
        </div>

        {/* Total Label Units */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Package size={18} />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block leading-none">Total Units</span>
            <span className="text-xl font-bold text-slate-900 mt-1 block">
              {stats.totalUnits.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Total Value */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block leading-none">Total Value</span>
            <span className="text-xl font-bold text-slate-900 mt-1 block">
              ₹{stats.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Unique Accounts */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Building2 size={18} />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block leading-none">Accounts</span>
            <span className="text-xl font-bold text-slate-900 mt-1 block">
              {stats.uniqueCustomersCount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <CollapsibleFilterCard
        title={`Filter & Search ${config.title}`}
        activeCount={activeFilterCount}
        onClear={() => {
          setSearchQuery('');
          setDateFilter('all');
          setCustomFrom('');
          setCustomTo('');
          setSelectedExecutive('all');
          setSortBy('newest');
        }}
      >
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Order #, Customer, Company, Product, City..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Sales Executive Selector */}
            {executivesList.length > 0 && (
              <div className="min-w-[180px]">
                <select
                  value={selectedExecutive}
                  onChange={(e) => setSelectedExecutive(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">All Sales Executives</option>
                  {executivesList.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Dropdown */}
            <div className="min-w-[160px]">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
              >
                <option value="newest">Sort: Newest First</option>
                <option value="oldest">Sort: Oldest First</option>
                <option value="units_desc">Sort: Highest Units</option>
                <option value="amount_desc">Sort: Highest Amount</option>
              </select>
            </div>
          </div>

          {/* Date Preset Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
            <span className="text-slate-400 font-medium text-[11px]">PO Date Filter:</span>
            {[
              { key: 'all', label: 'All Dates' },
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'Past 7 Days' },
              { key: 'month', label: 'This Month' },
              { key: 'custom', label: 'Custom Range' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setDateFilter(tab.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  dateFilter === tab.key
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                />
              </div>
            )}
          </div>
        </div>
      </CollapsibleFilterCard>

      {/* Main Orders Display Table & Mobile Views */}
      {loading ? (
        <SkeletonTable rows={8} />
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-2xs">
          <div className={`w-14 h-14 rounded-2xl ${config.kpiBg} mx-auto flex items-center justify-center mb-3`}>
            {config.icon}
          </div>
          <h3 className="text-base font-bold text-slate-900">No {config.title} Found</h3>
          <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
            {orders.length === 0
              ? `There are currently no orders with "${activeStatusKey}" status in the system.`
              : 'No orders match the current search or date filters. Try clearing your filters to see more.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setDateFilter('all');
                  setSelectedExecutive('all');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Clear Filters
              </button>
            )}
            <button
              onClick={() => setIsNewOrderModalOpen(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              Create New Order
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                    <th className="p-4">Order No</th>
                    <th className="p-4">Customer & Company</th>
                    <th className="p-4">PO Date</th>
                    <th className="p-4">Products & Total Units</th>
                    <th className="p-4">Expected Delivery</th>
                    <th className="p-4">Sales Executive</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((ord) => {
                    const formattedOrderNo = ord.orderNo || `ORD-${ord._id?.slice(-6)}`;
                    const custName = ord.customerId?.name || ord.customerName || 'N/A';
                    const company = ord.customerId?.company || ord.company || 'Individual Account';
                    const orderDateStr = ord.orderDate ? new Date(ord.orderDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
                    const deliveryDateStr = ord.deliveryDate ? new Date(ord.deliveryDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
                    const execName = ord.salesExecutive?.name || 'Unassigned';
                    const execRole = ord.salesExecutive?.role ? (ord.salesExecutive.role === 'caller' ? 'Caller' : ord.salesExecutive.role) : 'Executive';
                    const totalUnits = (ord.lineItems || []).reduce((sum, item) => sum + (item.qty || 0), 0);
                    const primaryProduct = ord.lineItems?.[0]?.name || 'Label Order';

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
                        <td className="p-4">
                          <div className="font-semibold text-slate-800 truncate max-w-[200px]" title={primaryProduct}>
                            {primaryProduct}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {totalUnits.toLocaleString('en-IN')} units
                            {ord.lineItems?.length > 1 && ` • ${ord.lineItems.length} items`}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-medium text-slate-800">{deliveryDateStr}</div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            {ord.salesExecutive?.avatarUrl ? (
                              <img
                                src={ord.salesExecutive.avatarUrl}
                                alt={execName}
                                className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[9px] shrink-0">
                                {getInitials(execName)}
                              </div>
                            )}
                            <div>
                              <p className="text-[10px] text-slate-400 font-medium leading-none capitalize">{execRole}</p>
                              <p className="text-xs font-semibold text-slate-800 mt-0.5">{execName}</p>
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
                              onClick={() => handleExportSingle(ord)}
                              disabled={exportingOrderId === ord._id}
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 transition cursor-pointer disabled:opacity-50"
                              title="Export Order Dossier (.xlsx)"
                            >
                              <Download size={14} className={exportingOrderId === ord._id ? 'animate-bounce' : ''} />
                            </button>

                            {/* Status-specific action buttons */}
                            {activeStatusKey === 'pending' && (
                              <button
                                onClick={() => handleUpdateStatus(ord._id, 'confirmed', 'Confirm')}
                                disabled={updatingOrderId === ord._id}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-semibold text-[11px] transition cursor-pointer flex items-center gap-1"
                                title="Approve & Confirm Order"
                              >
                                <CheckSquare size={13} />
                                <span>Confirm</span>
                              </button>
                            )}

                            {activeStatusKey === 'confirmed' && (
                              <button
                                onClick={() => handleUpdateStatus(ord._id, 'delivered', 'Mark Delivered')}
                                disabled={updatingOrderId === ord._id}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold text-[11px] transition cursor-pointer flex items-center gap-1"
                                title="Mark as Delivered"
                              >
                                <Truck size={13} />
                                <span>Delivered</span>
                              </button>
                            )}

                            {activeStatusKey === 'cancelled' && (
                              <button
                                onClick={() => handleUpdateStatus(ord._id, 'confirmed', 'Restore')}
                                disabled={updatingOrderId === ord._id}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-semibold text-[11px] transition cursor-pointer flex items-center gap-1"
                                title="Restore Order to Confirmed"
                              >
                                <RotateCcw size={13} />
                                <span>Restore</span>
                              </button>
                            )}

                            {activeStatusKey !== 'cancelled' && (
                              <button
                                onClick={() => setOrderToMarkLost(ord)}
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
              <span className="text-slate-500 font-medium">
                Showing {filteredOrders.length} of {orders.length} {config.title.toLowerCase()}
              </span>
            </div>
          </div>

          {/* Mobile Accordion View */}
          <div className="md:hidden space-y-3">
            {filteredOrders.map((ord) => {
              const formattedOrderNo = ord.orderNo || `ORD-${ord._id?.slice(-6)}`;
              const custName = ord.customerId?.name || ord.customerName || 'N/A';
              const company = ord.customerId?.company || ord.company || 'Individual Account';
              const orderDateStr = ord.orderDate ? new Date(ord.orderDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
              const deliveryDateStr = ord.deliveryDate ? new Date(ord.deliveryDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
              const totalUnits = (ord.lineItems || []).reduce((sum, item) => sum + (item.qty || 0), 0);

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
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${config.badgeClass}`}>
                      {totalUnits.toLocaleString('en-IN')} units
                    </span>
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
                      <span className="font-semibold text-slate-800">{ord.salesExecutive?.name || 'Unassigned'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium text-[11px] block">Line Items</span>
                      <span className="font-semibold text-slate-800">{ord.lineItems?.length || 0} product(s)</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setViewingOrder(ord)}
                      className="flex-1 py-2 px-3 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition text-center cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Eye size={14} />
                      <span>Details</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingle(ord)}
                      disabled={exportingOrderId === ord._id}
                      className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      title="Export (.xlsx)"
                    >
                      <Download size={13} className={exportingOrderId === ord._id ? 'animate-bounce' : ''} />
                      <span>Export</span>
                    </button>
                    {activeStatusKey !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => setOrderToMarkLost(ord)}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                      >
                        <FileX size={13} />
                        <span>Lost</span>
                      </button>
                    )}
                  </div>
                </AccordionCard>
              );
            })}
          </div>
        </>
      )}

      {/* View Order Details Modal */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white max-w-lg w-full rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto scrollbar-hide font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order Dossier</span>
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

              {/* Status & PO Date */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <p className="text-[10px] text-slate-400 font-medium mb-1">Status</p>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${config.badgeClass} inline-flex items-center gap-1.5`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`}></span>
                    {config.title}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-medium">PO Date</p>
                  <p className="font-semibold text-slate-800">
                    {new Date(viewingOrder.poDate || viewingOrder.orderDate || viewingOrder.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {viewingOrder.deliveryDate && (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <span className="font-medium text-slate-600">Expected Delivery:</span>
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
                  <h4 className="font-semibold text-slate-700 mb-2">Order Line Items ({viewingOrder.lineItems.length})</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[10px] uppercase">
                          <th className="p-2.5">Product & Dimension</th>
                          <th className="p-2.5 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewingOrder.lineItems.map((item, idx) => (
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
                        ))}
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
                onClick={() => handleExportSingle(viewingOrder)}
                disabled={exportingOrderId === viewingOrder._id}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition disabled:opacity-50"
              >
                <Download size={14} className={exportingOrderId === viewingOrder._id ? 'animate-bounce' : ''} />
                <span>{exportingOrderId === viewingOrder._id ? 'Exporting...' : 'Export (.xlsx)'}</span>
              </button>

              <div className="flex items-center gap-2">
                {activeStatusKey !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => setOrderToMarkLost(viewingOrder)}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
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
      {isNewOrderModalOpen && (
        <NewOrderModal
          isOpen={isNewOrderModalOpen}
          onClose={() => setIsNewOrderModalOpen(false)}
          onSuccess={() => {
            setIsNewOrderModalOpen(false);
            fetchStatusOrders();
          }}
        />
      )}
    </div>
  );
}
