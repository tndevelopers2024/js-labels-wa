import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';
import { SkeletonTable } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import {
  Ruler,
  Search,
  Filter,
  ArrowLeft,
  Layers,
  Box,
  Tag,
  Palette,
  Eye,
  RefreshCw,
  X,
  ExternalLink,
  ArrowDownAZ,
  ArrowUpDown,
  SlidersHorizontal,
  ChevronRight,
  Briefcase
} from 'lucide-react';

export default function UniqueDimensions() {
  const navigate = useNavigate();
  const notify = useNotification();

  const [dimensions, setDimensions] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('products_desc');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'

  // Modal for inspecting products under a specific dimension
  const [inspectingDimension, setInspectingDimension] = useState(null);
  const [modalSearch, setModalSearch] = useState('');

  // Fetch unique dimensions from backend
  const fetchDimensions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (unitFilter !== 'all') params.append('unit', unitFilter);
      if (industryFilter !== 'all') params.append('industry', industryFilter);
      if (sortBy) params.append('sortBy', sortBy);

      const res = await api.get(`/products/unique-dimensions?${params.toString()}`);
      if (res.data) {
        setDimensions(res.data.dimensions || []);
        setTotalProducts(res.data.totalProducts || 0);
      }
    } catch (err) {
      console.error('Error fetching unique dimensions:', err);
      notify.error(err.response?.data?.message || 'Failed to load unique dimensions');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, unitFilter, industryFilter, sortBy]);

  useEffect(() => {
    fetchDimensions();
  }, [fetchDimensions]);

  // Extract distinct industries across all dimensions for filter dropdown
  const allIndustryOptions = useMemo(() => {
    const set = new Set();
    dimensions.forEach(d => {
      (d.industries || []).forEach(ind => {
        if (ind) set.add(ind);
      });
    });
    return Array.from(set).sort();
  }, [dimensions]);

  // Derived metrics for summary cards
  const mmCount = useMemo(() => {
    return dimensions.filter(d => (d.unit || 'MM').toUpperCase() === 'MM').length;
  }, [dimensions]);

  const mtrCount = useMemo(() => {
    return dimensions.filter(d => (d.unit || '').toUpperCase() === 'MTR').length;
  }, [dimensions]);

  // Filtered products inside modal
  const modalProducts = useMemo(() => {
    if (!inspectingDimension || !inspectingDimension.products) return [];
    if (!modalSearch.trim()) return inspectingDimension.products;
    const q = modalSearch.toLowerCase().trim();
    return inspectingDimension.products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.jobName || '').toLowerCase().includes(q) ||
      (p.material || '').toLowerCase().includes(q) ||
      (p.colour || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    );
  }, [inspectingDimension, modalSearch]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setUnitFilter('all');
    setIndustryFilter('all');
    setSortBy('products_desc');
  };

  const hasActiveFilters = searchQuery || unitFilter !== 'all' || industryFilter !== 'all' || sortBy !== 'products_desc';

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
              <span>Unique Dimensions</span>
              <span className="text-xs px-2.5 py-0.5 font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-full">
                Label Specification Matrix
              </span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-normal">
            Browse, filter, and inspect all distinct label sizes, dimension keys, associated industries, and products across the catalog
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
            onClick={() => navigate('/products/industries')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-xl transition cursor-pointer"
          >
            <Tag size={15} className="text-amber-600" />
            <span>View Industries</span>
          </button>

          <button
            onClick={fetchDimensions}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition shadow-2xs cursor-pointer"
            title="Refresh dimensions list"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Total Unique Dimensions */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Unique Dimensions
            </span>
            <p className="text-xl sm:text-2xl font-bold text-indigo-600 mt-1">
              {dimensions.length.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Ruler size={20} />
          </div>
        </div>

        {/* 2. Total Products Covered */}
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

        {/* 3. MM Standard Labels */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              MM Standard Sizes
            </span>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">
              {mmCount.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Box size={20} />
          </div>
        </div>

        {/* 4. MTR Ribbon & Roll Sizes */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              MTR Ribbon / Rolls
            </span>
            <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">
              {mtrCount.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Tag size={20} />
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
              placeholder="Search by dimension (e.g. 50x25, 4x45), industry, material, or product name..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition"
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
            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer focus:border-indigo-500"
          >
            <option value="all">All Units</option>
            <option value="MM">MM (Millimeter)</option>
            <option value="MTR">MTR (Meter - Ribbon / Roll)</option>
          </select>

          {/* Industry Filter */}
          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer focus:border-indigo-500"
          >
            <option value="all">All Industries</option>
            {allIndustryOptions.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>

          {/* Sort Switcher */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer focus:border-indigo-500"
            >
              <option value="products_desc">Most Products First</option>
              <option value="products_asc">Fewest Products First</option>
              <option value="dim_asc">Smallest Size (Area)</option>
              <option value="dim_desc">Largest Size (Area)</option>
              <option value="name_asc">Dimension Key (A–Z)</option>
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
              Showing <strong>{dimensions.length}</strong> matching unique dimensions
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
        <SkeletonTable rows={6} cols={6} />
      ) : dimensions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Ruler size={24} />
          </div>
          <h3 className="font-bold text-slate-800 text-base">No Dimensions Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {hasActiveFilters
              ? 'No dimensions match your active search and filter criteria. Try adjusting your query.'
              : 'No label dimensions are currently recorded in the product catalog.'}
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
                  <th className="p-4 py-3.5">Dimension Specification</th>
                  <th className="p-4 py-3.5 text-center">Unit</th>
                  <th className="p-4 py-3.5 text-center">Products</th>
                  <th className="p-4 py-3.5">Industries</th>
                  <th className="p-4 py-3.5">Materials & Colours</th>
                  <th className="p-4 py-3.5">Sample Products</th>
                  <th className="p-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dimensions.map((d, idx) => {
                  return (
                    <tr
                      key={d.dimensionKey + idx}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => {
                        setInspectingDimension(d);
                        setModalSearch('');
                      }}
                    >
                      {/* Dimension Specification */}
                      <td className="p-4 py-3.5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 text-white font-mono font-bold text-xs rounded-xl shadow-2xs border border-slate-800 group-hover:bg-indigo-600 group-hover:border-indigo-600 transition">
                          <Ruler size={13} className="text-red-400 stroke-[2.5]" />
                          <span>{d.displayDimension}</span>
                        </div>
                      </td>

                      {/* Size Unit */}
                      <td className="p-4 py-3.5 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase font-mono ${
                          d.unit === 'MTR'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {d.unit}
                        </span>
                      </td>

                      {/* Products Count */}
                      <td className="p-4 py-3.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                          <span>{d.productCount}</span>
                          <span className="text-[10px] font-normal">items</span>
                        </span>
                      </td>

                      {/* Industries */}
                      <td className="p-4 py-3.5 max-w-[200px]">
                        <div className="flex flex-wrap items-center gap-1">
                          {d.industries.length > 0 ? (
                            d.industries.slice(0, 2).map((ind, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/70"
                              >
                                {ind}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">General</span>
                          )}
                          {d.industries.length > 2 && (
                            <span className="text-[10px] font-bold text-slate-400">
                              +{d.industries.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Materials & Colours */}
                      <td className="p-4 py-3.5 max-w-[200px]">
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
                          {d.materials.slice(0, 2).map((mat, i) => (
                            <span key={i} className="inline-block bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              {mat}
                            </span>
                          ))}
                          {d.materials.length > 2 && (
                            <span className="text-[10px] font-bold text-slate-400">
                              +{d.materials.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sample Products */}
                      <td className="p-4 py-3.5 max-w-[220px]">
                        <div className="space-y-0.5">
                          {d.products.slice(0, 2).map((p, i) => (
                            <p key={i} className="text-xs text-slate-800 font-medium truncate" title={p.name}>
                              {p.name}
                            </p>
                          ))}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setInspectingDimension(d);
                              setModalSearch('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl transition cursor-pointer"
                            title="View all products with this dimension"
                          >
                            <Eye size={13} />
                            <span>View ({d.productCount})</span>
                          </button>

                          <button
                            onClick={() => navigate(`/products?search=${encodeURIComponent(d.dimensionKey)}`)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Filter main catalog by this dimension"
                          >
                            <ExternalLink size={14} />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dimensions.map((d, idx) => (
            <div
              key={d.dimensionKey + idx}
              onClick={() => {
                setInspectingDimension(d);
                setModalSearch('');
              }}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all p-4 sm:p-5 flex flex-col justify-between space-y-4 cursor-pointer group"
            >
              <div className="space-y-2.5">
                {/* Header: Dimension Key & Unit */}
                <div className="flex items-start justify-between gap-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white font-mono font-bold text-sm rounded-xl shadow-2xs group-hover:bg-indigo-600 transition">
                    <Ruler size={14} className="text-red-400" />
                    <span>{d.displayDimension}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                    d.unit === 'MTR'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {d.unit}
                  </span>
                </div>

                {/* Products Count Metric */}
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-indigo-600">{d.productCount}</span>
                  <span className="text-xs text-slate-500 font-medium">associated products</span>
                </div>

                {/* Industries */}
                {d.industries.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    {d.industries.map((ind, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded-md"
                      >
                        {ind}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
                <span className="text-[11px] text-slate-400 font-medium truncate max-w-[140px]">
                  {d.materials[0] || 'Standard Material'}
                </span>
                <button
                  onClick={() => {
                    setInspectingDimension(d);
                    setModalSearch('');
                  }}
                  className="px-3 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition"
                >
                  View Products &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: VIEW ALL PRODUCTS UNDER SELECTED DIMENSION */}
      {inspectingDimension && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                    Dimension Catalog
                  </span>
                  <span className="text-xs text-slate-400">
                    Total: <strong>{inspectingDimension.productCount}</strong> products
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 text-white font-mono font-bold text-sm rounded-xl">
                    <Ruler size={14} className="text-red-400" />
                    <span>{inspectingDimension.displayDimension}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Key: <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{inspectingDimension.dimensionKey}</code>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setInspectingDimension(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Search within Dimension */}
            <div className="p-4 border-b border-slate-100 bg-white">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder={`Search among these ${inspectingDimension.productCount} products...`}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
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
                      <th className="p-3">Label Name</th>
                      <th className="p-3">Industry</th>
                      <th className="p-3">Material & Colour</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modalProducts.map((p) => (
                      <tr key={p._id} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-bold text-slate-900">{p.name}</td>
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
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                            {p.category || 'General'}
                          </span>
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
                Showing {modalProducts.length} of {inspectingDimension.productCount} products
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInspectingDimension(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    navigate(`/products?search=${encodeURIComponent(inspectingDimension.dimensionKey)}`);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
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
