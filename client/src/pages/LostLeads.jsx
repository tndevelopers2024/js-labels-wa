import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import LoadingButton from '../components/ui/LoadingButton';
import { SkeletonTable } from '../components/ui/Skeleton';
import { exportLostLeadsToExcel } from '../utils/exportUtils';
import {
  UserX,
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
  X,
  MessageSquare,
  Sparkles,
  MapPin,
  Flag,
  ArrowDownAZ,
  Users
} from 'lucide-react';

const COMMON_REASONS = [
  'Price Issue / Competitor',
  'Client Cancelled Project',
  'Delivery Timeline Delay',
  'Specification / Size Mismatch',
  'Quality / Sample Rejection',
  'Budget Constraints',
  'Duplicate / Test Lead'
];

export default function LostLeads() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const notify = useNotification();

  const [leads, setLeads] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [executiveFilter, setExecutiveFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all'); // 'all', 'today', 'this_week', 'this_month', 'last_30_days', 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortBy, setSortBy] = useState('lostAt_desc');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'

  // Modals
  const [viewingLead, setViewingLead] = useState(null);
  const [reopeningLead, setReopeningLead] = useState(null);
  const [reopenStatus, setReopenStatus] = useState('contacted');
  const [reopenNotes, setReopenNotes] = useState('');
  const [reopenFollowUpDate, setReopenFollowUpDate] = useState('');
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

  // Fetch Lost Leads from API
  const fetchLostLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (reasonFilter !== 'all') params.append('reason', reasonFilter);
      if (executiveFilter !== 'all') params.append('salesExecutive', executiveFilter);
      if (sourceFilter !== 'all') params.append('source', sourceFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (computedDateRange.from) params.append('from', computedDateRange.from);
      if (computedDateRange.to) params.append('to', computedDateRange.to);
      if (sortBy) params.append('sortBy', sortBy);
      params.append('limit', '200');

      const res = await api.get(`/leads/lost?${params.toString()}`);
      if (res.data) {
        setLeads(res.data.leads || []);
        setSummary(res.data.summary || null);
      }
    } catch (err) {
      console.error('Error fetching lost leads:', err);
      // Fallback: try generic leads endpoint if /lost endpoint had any hiccup
      try {
        const fallbackRes = await api.get('/leads?limit=200');
        if (fallbackRes.data && Array.isArray(fallbackRes.data.leads)) {
          const lostOnly = fallbackRes.data.leads.filter(l =>
            ['cancelled', 'order_lost', 'order-lost'].includes(l.status)
          );
          setLeads(lostOnly);
          setSummary({
            totalLostLeads: lostOnly.length,
            topReason: lostOnly[0]?.cancelReason || 'None',
            highPriorityCount: lostOnly.filter(l => l.priority === 'high').length,
            topSource: lostOnly[0]?.source || 'None'
          });
        }
      } catch (e) {
        notify.error(err.response?.data?.message || 'Failed to load lost leads');
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery, reasonFilter, executiveFilter, sourceFilter, priorityFilter, computedDateRange, sortBy]);

  // Fetch Executives for filter dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/users');
        if (Array.isArray(res.data)) {
          setExecutives(res.data.filter(u => u.status === 'active'));
        }
      } catch (err) {
        // silent
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchLostLeads();
  }, [fetchLostLeads]);

  // Handle Export to Excel
  const handleExport = async () => {
    try {
      setExporting(true);
      await exportLostLeadsToExcel({
        search: searchQuery,
        reason: reasonFilter,
        from: computedDateRange.from,
        to: computedDateRange.to,
        salesExecutive: executiveFilter,
        source: sourceFilter,
        priority: priorityFilter
      }, notify);
    } catch (err) {
      // notification handled in export utility
    } finally {
      setExporting(false);
    }
  };

  // Reopen Lost Lead Handler
  const handleReopenSubmit = async (e) => {
    e.preventDefault();
    if (!reopeningLead) return;

    try {
      setIsReopening(true);
      await api.post(`/leads/${reopeningLead._id}/reopen`, {
        newStatus: reopenStatus,
        notes: reopenNotes,
        nextFollowUpDate: reopenFollowUpDate || undefined
      });
      notify.success(`Lead "${reopeningLead.name}" has been successfully restored to the ${reopenStatus.replace('_', '-')} stage.`);
      setReopeningLead(null);
      setReopenNotes('');
      setReopenFollowUpDate('');
      fetchLostLeads();
    } catch (err) {
      // Fallback to PATCH /status if needed
      try {
        await api.patch(`/leads/${reopeningLead._id}/status`, {
          status: reopenStatus,
          notes: reopenNotes
        });
        notify.success(`Lead restored successfully.`);
        setReopeningLead(null);
        setReopenNotes('');
        setReopenFollowUpDate('');
        fetchLostLeads();
      } catch (fallbackErr) {
        notify.error(fallbackErr.response?.data?.message || err.response?.data?.message || 'Failed to reopen lead');
      }
    } finally {
      setIsReopening(false);
    }
  };

  // Formatting helpers
  const formatDateTime = (dateString) => {
    if (!dateString) return { date: '—', time: '—', full: '—', relative: '—' };
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return { date: '—', time: '—', full: '—', relative: '—' };

    const formattedDate = dateObj.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const formattedTime = dateObj.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Relative time
    const diffMs = Date.now() - dateObj.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    let relative = '';
    if (diffHours < 1) relative = 'Just now';
    else if (diffHours < 24) relative = `${diffHours}h ago`;
    else if (diffDays === 1) relative = 'Yesterday';
    else if (diffDays < 30) relative = `${diffDays}d ago`;
    else relative = formattedDate;

    return {
      date: formattedDate,
      time: formattedTime,
      full: `${formattedDate}, ${formattedTime}`,
      relative
    };
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setReasonFilter('all');
    setExecutiveFilter('all');
    setSourceFilter('all');
    setPriorityFilter('all');
    setDatePreset('all');
    setCustomFrom('');
    setCustomTo('');
    setSortBy('lostAt_desc');
  };

  const hasActiveFilters = searchQuery || reasonFilter !== 'all' || executiveFilter !== 'all' ||
    sourceFilter !== 'all' || priorityFilter !== 'all' || datePreset !== 'all' || sortBy !== 'lostAt_desc';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate('/leads')}
              className="p-1.5 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
              title="Return to Active Leads"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Lost Leads</span>
              <span className="text-xs px-2.5 py-0.5 font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 rounded-full">
                Leads Loss & Churn Audit
              </span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-normal">
            Track cancelled leads and lost inquiries from the Leads section, reasons for loss, and exact dates and times to prevent lost opportunities
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => navigate('/leads')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
          >
            <Users size={15} className="text-slate-500" />
            <span>Active Leads</span>
          </button>

          <button
            onClick={handleExport}
            disabled={exporting || leads.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition shadow-2xs hover:border-slate-300 disabled:opacity-50 cursor-pointer"
            title="Download Lost Leads Register (.xlsx)"
          >
            <Download size={15} className="text-slate-500" />
            <span>{exporting ? 'Exporting...' : 'Export Lost Leads (.xlsx)'}</span>
          </button>

          <button
            onClick={fetchLostLeads}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition shadow-2xs cursor-pointer"
            title="Refresh lost leads list"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Total Lost Leads */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 block leading-tight truncate">Total Lost Leads</span>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {(summary?.totalLostLeads ?? leads.length).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <UserX size={20} />
          </div>
        </div>

        {/* 2. Top Loss Reason */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <span className="text-[11px] font-medium text-slate-500 block leading-tight truncate">Primary Loss Reason</span>
            <p className="text-sm sm:text-base font-bold text-slate-900 mt-1 truncate" title={summary?.topReason || 'None'}>
              {summary?.topReason && summary.topReason !== 'None' ? summary.topReason : 'None'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
        </div>

        {/* 3. High Priority Lost */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 block leading-tight truncate">High Priority Lost</span>
            <p className="text-xl sm:text-2xl font-bold text-rose-700 mt-1">
              {(summary?.highPriorityCount ?? 0).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Flag size={20} />
          </div>
        </div>

        {/* 4. Top Lead Source */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <span className="text-[11px] font-medium text-slate-500 block leading-tight truncate">Top Source Channel</span>
            <p className="text-sm sm:text-base font-bold text-slate-900 mt-1 capitalize truncate" title={summary?.topSource || 'Direct'}>
              {summary?.topSource && summary.topSource !== 'None' ? summary.topSource.replace('_', ' ') : 'Direct'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Tag size={20} />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH CARD */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 sm:p-5 space-y-4">
        {/* Main Search Row */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Lead Name, Company, Phone, Email, City, or Reason..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-red-500 focus:outline-hidden transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Quick Sort & View Mode */}
          <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="font-medium hidden sm:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:border-red-500 cursor-pointer"
              >
                <option value="lostAt_desc">Marked as Lost (Newest First)</option>
                <option value="lostAt_asc">Marked as Lost (Oldest First)</option>
                <option value="name_asc">Lead Name (A–Z)</option>
                <option value="name_desc">Lead Name (Z–A)</option>
                <option value="priority_desc">Priority (High to Low)</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Table
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                  viewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Cards
              </button>
            </div>
          </div>
        </div>

        {/* Reason Quick Filter Chips */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Filter by Reason:
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1"
              >
                <X size={12} />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setReasonFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition cursor-pointer ${
                reasonFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs font-bold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Reasons
            </button>
            {COMMON_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReasonFilter(reasonFilter === r ? 'all' : r)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition cursor-pointer ${
                  reasonFilter === r
                    ? 'bg-rose-600 text-white shadow-2xs font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Detailed Dropdowns Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Date Preset */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Date Marked as Lost:</label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          {/* Assigned Executive */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Assigned Representative:</label>
            <select
              value={executiveFilter}
              onChange={(e) => setExecutiveFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">All Sales Executives</option>
              {executives.map((exec) => (
                <option key={exec._id} value={exec._id}>
                  {exec.name} ({exec.role})
                </option>
              ))}
            </select>
          </div>

          {/* Source Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Lead Source:</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">All Sources</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="google_ads">Google Ads</option>
              <option value="tele_caller">Tele Caller</option>
              <option value="walk_in">Walk-in</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Priority:</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>
        </div>

        {/* Custom Date Inputs if 'custom' is active */}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">FROM DATE:</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">TO DATE:</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* MAIN DATA SECTION */}
      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} />
          </div>
          <h3 className="font-bold text-slate-800 text-base">No Lost Leads Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {hasActiveFilters
              ? 'No lost leads match your current filter and search criteria. Try clearing or widening your filters.'
              : 'Great news! There are currently no lost or cancelled leads recorded in the system.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="mt-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-4 py-3.5">Lead & Company</th>
                  <th className="p-4 py-3.5">Contact Details</th>
                  <th className="p-4 py-3.5">Priority & Source</th>
                  <th className="p-4 py-3.5">Assigned Rep</th>
                  <th className="p-4 py-3.5">Reason for Loss</th>
                  <th className="p-4 py-3.5">Marked as Lost (Date & Time)</th>
                  <th className="p-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => {
                  const lossTime = formatDateTime(lead.updatedAt || lead.createdAt);
                  const markedBy = lead.assignedTo?.name || lead.createdBy?.name || 'Staff';

                  return (
                    <tr
                      key={lead._id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => setViewingLead(lead)}
                    >
                      {/* 1. Lead & Company */}
                      <td className="p-4 py-3.5">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900 group-hover:text-red-600 transition flex items-center gap-1.5 text-xs sm:text-sm">
                            <span>{lead.name}</span>
                          </p>
                          {lead.company && (
                            <p className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Building size={11} className="text-slate-400 shrink-0" />
                              <span className="truncate max-w-[200px]">{lead.company}</span>
                            </p>
                          )}
                          {lead.city && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                              <MapPin size={10} className="text-slate-400 shrink-0" />
                              <span>{lead.city}</span>
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 2. Contact Details */}
                      <td className="p-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              className="text-xs font-semibold text-slate-800 hover:text-red-600 flex items-center gap-1.5"
                            >
                              <Phone size={12} className="text-slate-400" />
                              <span>{lead.phone}</span>
                            </a>
                          )}
                          {lead.email && (
                            <a
                              href={`mailto:${lead.email}`}
                              className="text-[11px] text-slate-500 hover:text-red-600 flex items-center gap-1.5 truncate max-w-[180px]"
                            >
                              <Mail size={11} className="text-slate-400 shrink-0" />
                              <span className="truncate">{lead.email}</span>
                            </a>
                          )}
                        </div>
                      </td>

                      {/* 3. Priority & Source */}
                      <td className="p-4 py-3.5">
                        <div className="space-y-1">
                          <div>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                lead.priority === 'high'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : lead.priority === 'medium'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {lead.priority || 'Medium'}
                            </span>
                          </div>
                          {lead.source && (
                            <span className="inline-block text-[10px] text-slate-500 capitalize bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              {lead.source.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Assigned Rep */}
                      <td className="p-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 text-[10px] shrink-0">
                            {lead.assignedTo?.name ? lead.assignedTo.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">
                              {lead.assignedTo?.name || 'Unassigned'}
                            </p>
                            <p className="text-[10px] text-slate-400 capitalize">
                              {lead.assignedTo?.role ? lead.assignedTo.role.replace('_', ' ') : 'Caller'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* 5. Reason for Loss */}
                      <td className="p-4 py-3.5 max-w-[240px]">
                        <div className="space-y-1">
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/80"
                            title={lead.cancelReason || 'Unspecified Reason'}
                          >
                            <AlertTriangle size={12} className="shrink-0 text-rose-600" />
                            <span className="line-clamp-1">{lead.cancelReason || 'Unspecified Reason'}</span>
                          </span>
                          {lead.followUpNotes && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 italic" title={lead.followUpNotes}>
                              "{lead.followUpNotes}"
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 6. Date & Time Marked as Lost */}
                      <td className="p-4 py-3.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                            <Clock size={12} className="text-rose-500" />
                            <span>{lossTime.time}</span>
                            <span className="text-[10px] text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded font-normal">
                              {lossTime.relative}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Calendar size={11} className="text-slate-400" />
                            <span>{lossTime.date}</span>
                          </p>
                        </div>
                      </td>

                      {/* 7. Actions */}
                      <td className="p-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewingLead(lead)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                            title="View Full Lost Lead Dossier"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => {
                              setReopeningLead(lead);
                              setReopenStatus('contacted');
                              setReopenNotes('');
                              setReopenFollowUpDate('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg transition shadow-2xs cursor-pointer"
                            title="Restore lead back to active pipeline"
                          >
                            <RotateCcw size={12} />
                            <span>Reopen</span>
                          </button>
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
        /* CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads.map((lead) => {
            const lossTime = formatDateTime(lead.updatedAt || lead.createdAt);

            return (
              <div
                key={lead._id}
                onClick={() => setViewingLead(lead)}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition p-4 sm:p-5 flex flex-col justify-between space-y-4 cursor-pointer"
              >
                {/* Header */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm hover:text-red-600 transition">
                        {lead.name}
                      </h4>
                      {lead.company && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building size={12} className="text-slate-400" />
                          <span>{lead.company}</span>
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full font-bold border border-rose-200">
                      Order-Lost
                    </span>
                  </div>

                  {/* Contact Badges */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600">
                    {lead.phone && (
                      <span className="flex items-center gap-1 font-mono font-medium">
                        <Phone size={11} className="text-slate-400" />
                        {lead.phone}
                      </span>
                    )}
                    {lead.city && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <MapPin size={11} />
                        {lead.city}
                      </span>
                    )}
                  </div>
                </div>

                {/* Loss Reason Callout */}
                <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200/60 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block">
                    Reason for Loss:
                  </span>
                  <p className="font-semibold text-rose-800 text-xs">
                    {lead.cancelReason || 'Unspecified'}
                  </p>
                  {lead.followUpNotes && (
                    <p className="text-[11px] text-rose-600 italic">"{lead.followUpNotes}"</p>
                  )}
                </div>

                {/* Footer details */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div>
                    <span className="text-slate-400 block font-medium text-[10px]">Marked Lost At:</span>
                    <span className="font-semibold text-slate-700 text-xs">{lossTime.full}</span>
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        setReopeningLead(lead);
                        setReopenStatus('contacted');
                        setReopenNotes('');
                        setReopenFollowUpDate('');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                    >
                      Reopen
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULL LOST LEAD DOSSIER MODAL */}
      {viewingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
                    Lost Lead Dossier
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    ID: {viewingLead._id.slice(-6)}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900">{viewingLead.name}</h3>
                {viewingLead.company && (
                  <p className="text-xs text-slate-600 flex items-center gap-1.5">
                    <Building size={13} className="text-slate-400" />
                    <span>{viewingLead.company}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => setViewingLead(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Prominent Loss Reason Banner */}
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  <span>Cancellation & Loss Cause</span>
                </span>
                <span className="text-xs text-rose-600 font-medium">
                  {formatDateTime(viewingLead.updatedAt || viewingLead.createdAt).relative}
                </span>
              </div>
              <p className="text-sm font-bold text-rose-900">
                "{viewingLead.cancelReason || 'Unspecified Reason'}"
              </p>
              <div className="text-[11px] text-rose-700/80 pt-1 border-t border-rose-200/60 flex items-center justify-between flex-wrap gap-2">
                <span>
                  <strong>Date & Time Marked:</strong> {formatDateTime(viewingLead.updatedAt || viewingLead.createdAt).full}
                </span>
                <span>
                  <strong>Assigned Rep:</strong> {viewingLead.assignedTo?.name || 'Staff'}
                </span>
              </div>
            </div>

            {/* Contact Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Lead Contact Information
                </span>
                <div className="space-y-1 text-xs">
                  <p className="flex items-center gap-2 text-slate-800 font-medium">
                    <Phone size={13} className="text-slate-400" />
                    <a href={`tel:${viewingLead.phone}`} className="hover:text-red-600">
                      {viewingLead.phone}
                    </a>
                  </p>
                  {viewingLead.email && (
                    <p className="flex items-center gap-2 text-slate-800">
                      <Mail size={13} className="text-slate-400" />
                      <a href={`mailto:${viewingLead.email}`} className="hover:text-red-600">
                        {viewingLead.email}
                      </a>
                    </p>
                  )}
                  {viewingLead.address && (
                    <p className="flex items-center gap-2 text-slate-600">
                      <MapPin size={13} className="text-slate-400 shrink-0" />
                      <span>{viewingLead.address}, {viewingLead.city}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Lead Attributes
                </span>
                <div className="space-y-1 text-xs text-slate-700">
                  <p><strong>Source:</strong> <span className="capitalize">{viewingLead.source?.replace('_', ' ') || 'Direct'}</span></p>
                  <p><strong>Priority:</strong> <span className="capitalize">{viewingLead.priority || 'Medium'}</span></p>
                  <p><strong>Created Date:</strong> {formatDateTime(viewingLead.createdAt).date}</p>
                </div>
              </div>
            </div>

            {/* Notes & Activity History */}
            {viewingLead.followUpNotesList && viewingLead.followUpNotesList.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Follow-up Notes & Interactions History
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto p-1">
                  {viewingLead.followUpNotesList.map((note, index) => (
                    <div key={note._id || index} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{note.createdBy?.name || 'Representative'}</span>
                        <span>{formatDateTime(note.createdAt).full}</span>
                      </div>
                      <p className="text-slate-800 font-medium">{note.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button
                onClick={() => setViewingLead(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const leadToReopen = viewingLead;
                  setViewingLead(null);
                  setReopeningLead(leadToReopen);
                  setReopenStatus('contacted');
                  setReopenNotes('');
                  setReopenFollowUpDate('');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm flex items-center gap-1.5"
              >
                <RotateCcw size={14} />
                <span>Reopen Lead</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REOPEN LEAD MODAL */}
      {reopeningLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-5">
            <div className="space-y-1">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                <RotateCcw size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Reopen & Restore Lead
              </h3>
              <p className="text-xs text-slate-500">
                Restore <strong className="text-slate-800">{reopeningLead.name}</strong> ({reopeningLead.company || 'Direct Contact'}) back into active leads pipeline.
              </p>
            </div>

            <form onSubmit={handleReopenSubmit} className="space-y-4">
              {/* Target Stage */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Restore to Stage:
                </label>
                <select
                  value={reopenStatus}
                  onChange={(e) => setReopenStatus(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800"
                >
                  <option value="contacted">Contacted</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="new">New Lead</option>
                </select>
              </div>

              {/* Next Follow-up Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Next Follow-up Date (Optional):
                </label>
                <input
                  type="date"
                  value={reopenFollowUpDate}
                  onChange={(e) => setReopenFollowUpDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Reopening Remarks / Next Action Plan:
                </label>
                <textarea
                  value={reopenNotes}
                  onChange={(e) => setReopenNotes(e.target.value)}
                  placeholder="e.g. Customer re-engaged, client has budget approval, price renegotiation requested..."
                  rows={3}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm placeholder-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReopeningLead(null)}
                  disabled={isReopening}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReopening}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isReopening ? (
                    <span>Restoring...</span>
                  ) : (
                    <>
                      <RotateCcw size={14} />
                      <span>Confirm Reopen</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
