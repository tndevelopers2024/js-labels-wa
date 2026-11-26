import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';
import { SkeletonTable } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import {
  Tag,
  Search,
  Filter,
  ArrowLeft,
  Layers,
  Ruler,
  Box,
  Eye,
  RefreshCw,
  X,
  ExternalLink,
  ArrowDownAZ,
  ArrowUpDown,
  Building2,
  Briefcase
} from 'lucide-react';

export default function ProductIndustries() {
  const navigate = useNavigate();
  const notify = useNotification();

  const [industries, setIndustries] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [sortBy, setSortBy] = useState('products_desc');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'

  // Modal for inspecting products under a specific industry
  const [inspectingIndustry, setInspectingIndustry] = useState(null);
  const [modalSearch, setModalSearch] = useState('');

  // Fetch industries summary from backend
  const fetchIndustries = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (unitFilter !== 'all') params.append('unit', unitFilter);
      if (sortBy) params.append('sortBy', sortBy);

      const res = await api.get(`/products/industries-summary?${params.toString()}`);
      if (res.data) {
        setIndustries(res.data.industries || []);
        setTotalProducts(res.data.totalProducts || 0);
      }
    } catch (err) {
      console.error('Error fetching industries summary:', err);
      notify.error(err.response?.data?.message || 'Failed to load industries summary');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, unitFilter, sortBy]);

  useEffect(() => {
    fetchIndustries();
  }, [fetchIndustries]);

  // Derived metrics for summary cards
  const avgDimensions = useMemo(() => {
    if (industries.length === 0) return 0;
    const sum = industries.reduce((acc, ind) => acc + (ind.uniqueDimensionsCount || 0), 0);
    return Math.round(sum / industries.length);
  }, [industries]);

  const topIndustry = useMemo(() => {
    if (industries.length === 0) return 'None';
    return [...industries].sort((a, b) => b.productCount - a.productCount)[0]?.industry || 'None';
  }, [industries]);

  // Filtered products inside modal
  const modalProducts = useMemo(() => {
    if (!inspectingIndustry || !inspectingIndustry.products) return [];
    if (!modalSearch.trim()) return inspectingIndustry.products;
    const q = modalSearch.toLowerCase().trim();
    return inspectingIndustry.products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.jobName || '').toLowerCase().includes(q) ||
      (p.dimensionKey || '').toLowerCase().includes(q) ||
      (p.material || '').toLowerCase().includes(q) ||
      (p.colour || '').toLowerCase().includes(q)
    );
  }, [inspectingIndustry, modalSearch]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setUnitFilter('all');
    setSortBy('products_desc');
  };

  const hasActiveFilters = searchQuery || unitFilter !== 'all' || sortBy !== 'products_desc';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate('/products')}
              className="p-1.5 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              title="Return to Product Catalog"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Industries Directory</span>
              <span className="text-xs px-2.5 py-0.5 font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 rounded-full">
                Market Segments & Portfolios
              </span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-normal">
            Explore products and label specifications organized by Industry, with dimension counts and material coverage
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => navigate('/products')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
          >
            <Layers size={15} className="text-slate-500" />
            <span>Product Catalog</span>
          </button>

          <button
            onClick={() => navigate('/products/dimensions')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl transition cursor-pointer"
          >
            <Ruler size={15} className="text-indigo-600" />
            <span>Unique Dimensions</span>
          </button>

          <button
            onClick={fetchIndustries}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition shadow-2xs cursor-pointer"
            title="Refresh industries list"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Total Industries */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Active Industries
            </span>
            <p className="text-xl sm:text-2xl font-bold text-amber-600 mt-1">
              {industries.length.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Tag size={20} />
          </div>
        </div>

        {/* 2. Total Catalog Products */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Catalog Products
            </span>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {totalProducts.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Layers size={20} />
          </div>
        </div>

        {/* 3. Average Dimensions per Industry */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Avg Dimensions / Industry
            </span>
            <p className="text-xl sm:text-2xl font-bold text-indigo-600 mt-1">
              {avgDimensions.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Ruler size={20} />
          </div>
        </div>

        {/* 4. Primary Industry */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Primary Industry
            </span>
            <p className="text-base sm:text-lg font-bold text-slate-900 mt-1 truncate" title={topIndustry}>
              {topIndustry}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Building2 size={20} />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by industry name, product name, or dimension..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-amber-500 focus:outline-hidden transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Unit Filter */}
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer focus:border-amber-500"
          >
            <option value="all">All Units</option>
            <option value="MM">MM (Millimeter)</option>
            <option value="MTR">MTR (Meter - Ribbon / Roll)</option>
          </select>

          {/* Sort Switcher */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer focus:border-amber-500"
            >
              <option value="products_desc">Most Products First</option>
              <option value="dims_desc">Most Unique Dimensions First</option>
              <option value="name_asc">Industry Name (A–Z)</option>
              <option value="name_desc">Industry Name (Z–A)</option>
            </select>
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                viewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Cards
            </button>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Showing <strong>{industries.length}</strong> matching industries
            </span>
            <button
              onClick={clearAllFilters}
              className="text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <X size={13} />
              <span>Reset Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* MAIN DATA SECTION */}
      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : industries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Tag size={24} />
          </div>
          <h3 className="font-bold text-slate-800 text-base">No Industries Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {hasActiveFilters
              ? 'No industries match your current filter and search criteria.'
              : 'No industry sectors are currently defined in the product catalog.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="mt-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
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
                  <th className="p-4 py-3.5">Industry Name</th>
                  <th className="p-4 py-3.5 text-center">Products Count</th>
                  <th className="p-4 py-3.5 text-center">Unique Dimensions</th>
                  <th className="p-4 py-3.5">Key Dimensions</th>
                  <th className="p-4 py-3.5">Materials Covered</th>
                  <th className="p-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {industries.map((ind, idx) => (
                  <tr
                    key={ind.industry + idx}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => {
                      setInspectingIndustry(ind);
                      setModalSearch('');
                    }}
                  >
                    {/* Industry Name */}
                    <td className="p-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
                          <Tag size={15} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 group-hover:text-amber-600 transition text-sm">
                            {ind.industry}
                          </p>
                          <span className="text-[10px] text-slate-400">Sector</span>
                        </div>
                      </div>
                    </td>

                    {/* Products Count */}
                    <td className="p-4 py-3.5 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                        <span>{ind.productCount}</span>
                        <span className="text-[10px] font-normal">items</span>
                      </span>
                    </td>

                    {/* Unique Dimensions */}
                    <td className="p-4 py-3.5 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                        <Ruler size={11} className="text-indigo-500" />
                        <span>{ind.uniqueDimensionsCount}</span>
                        <span className="text-[10px] font-normal">sizes</span>
                      </span>
                    </td>

                    {/* Key Dimensions */}
                    <td className="p-4 py-3.5 max-w-[220px]">
                      <div className="flex flex-wrap items-center gap-1">
                        {ind.uniqueDimensions.slice(0, 3).map((dim, i) => (
                          <span
                            key={i}
                            className="inline-block bg-slate-900 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-md"
                          >
                            {dim}
                          </span>
                        ))}
                        {ind.uniqueDimensions.length > 3 && (
                          <span className="text-[10px] font-bold text-slate-400">
                            +{ind.uniqueDimensions.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Materials Covered */}
                    <td className="p-4 py-3.5 max-w-[200px]">
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
                        {ind.materials.slice(0, 2).map((mat, i) => (
                          <span key={i} className="inline-block bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            {mat}
                          </span>
                        ))}
                        {ind.materials.length > 2 && (
                          <span className="text-[10px] font-bold text-slate-400">
                            +{ind.materials.length - 2}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="p-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setInspectingIndustry(ind);
                            setModalSearch('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-xl transition cursor-pointer"
                          title="View all products in this industry"
                        >
                          <Eye size={13} />
                          <span>View ({ind.productCount})</span>
                        </button>

                        <button
                          onClick={() => navigate(`/products?category=${encodeURIComponent(ind.industry)}`)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="Filter main catalog by this industry"
                        >
                          <ExternalLink size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {industries.map((ind, idx) => (
            <div
              key={ind.industry + idx}
              onClick={() => {
                setInspectingIndustry(ind);
                setModalSearch('');
              }}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all p-4 sm:p-5 flex flex-col justify-between space-y-4 cursor-pointer group"
            >
              <div className="space-y-3">
                {/* Header: Industry Name */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
                      <Tag size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 group-hover:text-amber-600 transition text-base">
                        {ind.industry}
                      </h3>
                      <p className="text-[11px] text-slate-400">Industry Sector</p>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Products</span>
                    <span className="text-lg font-bold text-amber-600">{ind.productCount}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Dimensions</span>
                    <span className="text-lg font-bold text-indigo-600">{ind.uniqueDimensionsCount}</span>
                  </div>
                </div>

                {/* Dimensions pills */}
                {ind.uniqueDimensions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    {ind.uniqueDimensions.slice(0, 3).map((dim, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-slate-900 text-white font-mono text-[10px] font-bold rounded-md"
                      >
                        {dim}
                      </span>
                    ))}
                    {ind.uniqueDimensions.length > 3 && (
                      <span className="text-[10px] font-bold text-slate-400">
                        +{ind.uniqueDimensions.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
                <span className="text-[11px] text-slate-400 font-medium">
                  {ind.materials[0] || 'Standard Materials'}
                </span>
                <button
                  onClick={() => {
                    setInspectingIndustry(ind);
                    setModalSearch('');
                  }}
                  className="px-3 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition"
                >
                  View Products &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: VIEW ALL PRODUCTS UNDER SELECTED INDUSTRY */}
      {inspectingIndustry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                    Industry Portfolio
                  </span>
                  <span className="text-xs text-slate-400">
                    Total: <strong>{inspectingIndustry.productCount}</strong> products | <strong>{inspectingIndustry.uniqueDimensionsCount}</strong> unique sizes
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2 mt-1">
                  <Tag size={18} className="text-amber-600" />
                  <span>{inspectingIndustry.industry}</span>
                </h3>
              </div>
              <button
                onClick={() => setInspectingIndustry(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Search within Industry */}
            <div className="p-4 border-b border-slate-100 bg-white">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder={`Search among these ${inspectingIndustry.productCount} products...`}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-amber-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Modal Body: Products Table */}
            <div className="overflow-y-auto flex-1 p-4">
              {modalProducts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No products matched "{modalSearch}".
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Dimension</th>
                      <th className="p-3">Label Name</th>
                      <th className="p-3">Material & Colour</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modalProducts.map((p) => (
                      <tr key={p._id} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-bold text-slate-900">{p.name}</td>
                        <td className="p-3 font-mono">
                          <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                            {p.widthMm > 0 || p.heightMm > 0 ? `${p.widthMm} × ${p.heightMm} ${p.unit || 'MM'}` : (p.dimensionKey || 'N/A')}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600">
                          {p.jobName ? (
                            <span className="flex items-center gap-1 font-medium">
                              <Briefcase size={11} className="text-slate-400" />
                              {p.jobName}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600">
                          {p.material || p.colour ? `${p.material || ''} ${p.colour ? `(${p.colour})` : ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs text-slate-400">
                Showing {modalProducts.length} of {inspectingIndustry.productCount} products
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInspectingIndustry(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    navigate(`/products?category=${encodeURIComponent(inspectingIndustry.industry)}`);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>Open in Catalog</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
