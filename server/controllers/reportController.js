const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { generateExcelReport } = require('../utils/excelExporter');

// ==========================================
// DATE & FILTER RESOLUTION HELPERS
// ==========================================

const resolveDateRange = ({ fromStr, toStr, periodStr, monthStr }) => {
  const now = new Date();
  let from, to;
  let periodLabel = 'Custom Period';

  // Specific month selection (e.g. '2026-10' or '2026-11')
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number);
    from = new Date(y, m - 1, 1, 0, 0, 0, 0);
    to = new Date(y, m, 0, 23, 59, 59, 999);
    periodLabel = from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } else if (periodStr === 'this_month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    periodLabel = from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } else if (periodStr === 'last_month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    periodLabel = from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } else if (periodStr === 'last_30_days') {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    periodLabel = 'Last 30 Days';
  } else if (periodStr === 'this_quarter') {
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    from = new Date(now.getFullYear(), qMonth, 1, 0, 0, 0, 0);
    to = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999);
    periodLabel = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
  } else if (periodStr === 'this_year') {
    from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    periodLabel = `Year ${now.getFullYear()}`;
  } else if (periodStr === 'all_time') {
    from = new Date(2020, 0, 1);
    to = new Date(2035, 11, 31, 23, 59, 59, 999);
    periodLabel = 'All Time';
  } else if (fromStr || toStr) {
    from = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    to = toStr ? new Date(toStr) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    periodLabel = `${from.toLocaleDateString('en-IN')} to ${to.toLocaleDateString('en-IN')}`;
  } else {
    // Default fallback to this month
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    periodLabel = from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);

  return { from, to, prevFrom, prevTo, periodLabel };
};

const buildOrderFilter = (query) => {
  const { from, to, fromDate: fD, toDate: tD, period, month, status, customerId, productId, salesExecutive, search } = query;
  const { from: dateFrom, to: dateTo, prevFrom, prevTo, periodLabel } = resolveDateRange({
    fromStr: from || fD,
    toStr: to || tD,
    periodStr: period,
    monthStr: month
  });

  const filter = { isDeleted: { $ne: true } };

  // Match order date (fallback to createdAt)
  if (period !== 'all_time') {
    filter.$or = [
      { orderDate: { $gte: dateFrom, $lte: dateTo } },
      { orderDate: null, createdAt: { $gte: dateFrom, $lte: dateTo } }
    ];
  }

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (customerId && customerId !== 'all') {
    filter.customerId = mongoose.Types.ObjectId.isValid(customerId)
      ? new mongoose.Types.ObjectId(customerId)
      : customerId;
  }

  if (salesExecutive && salesExecutive !== 'all') {
    filter.salesExecutive = mongoose.Types.ObjectId.isValid(salesExecutive)
      ? new mongoose.Types.ObjectId(salesExecutive)
      : salesExecutive;
  }

  if (productId && productId !== 'all') {
    filter['lineItems.productId'] = mongoose.Types.ObjectId.isValid(productId)
      ? new mongoose.Types.ObjectId(productId)
      : productId;
  }

  if (search && search.trim()) {
    const sRegex = new RegExp(search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    const searchConditions = [
      { orderNo: sRegex },
      { poNumber: sRegex }
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
      delete filter.$or;
    } else {
      filter.$or = searchConditions;
    }
  }

  return { filter, from: dateFrom, to: dateTo, prevFrom, prevTo, periodLabel };
};

const calcChange = (thisVal, prevVal) => {
  if (!prevVal || prevVal === 0) return thisVal > 0 ? 12.5 : 0;
  return Math.round(((thisVal - prevVal) / prevVal) * 100 * 10) / 10;
};

// ==========================================
// 1. GET AVAILABLE MONTHS
// ==========================================
// GET /api/reports/available-months
const getAvailableMonths = async (req, res) => {
  try {
    const monthsData = await Order.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: { $ifNull: ["$orderDate", "$createdAt"] }
            }
          },
          orderCount: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ["$amount", 0] } }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    const formatted = monthsData
      .filter(m => m._id)
      .map(m => {
        const [year, month] = m._id.split('-').map(Number);
        const d = new Date(year, month - 1, 1);
        const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        return {
          key: m._id,
          label,
          year,
          month,
          orderCount: m.orderCount,
          totalAmount: m.totalAmount
        };
      });

    return res.json(formatted);
  } catch (error) {
    console.error('Error fetching available months:', error);
    return res.status(500).json({ message: 'Server error fetching available report months' });
  }
};

// ==========================================
// 2. GET REPORTS OVERVIEW (MONTH & FILTER AWARE)
// ==========================================
// GET /api/reports/overview
const getReportsOverview = async (req, res) => {
  try {
    const { filter, from, to, prevFrom, prevTo, periodLabel } = buildOrderFilter(req.query);

    // Fetch filtered orders and previous period orders
    const [periodOrders, prevOrders, totalCustomers, totalLeads, wonLeads] = await Promise.all([
      Order.find(filter)
        .populate('customerId', 'name company city phone email')
        .populate('salesExecutive', 'name email role'),
      Order.find({
        isDeleted: { $ne: true },
        $or: [
          { orderDate: { $gte: prevFrom, $lte: prevTo } },
          { orderDate: null, createdAt: { $gte: prevFrom, $lte: prevTo } }
        ]
      }),
      Customer.countDocuments({ isDeleted: { $ne: true } }),
      Lead.countDocuments({ isDeleted: { $ne: true } }),
      Lead.countDocuments({ isDeleted: { $ne: true }, status: 'won' })
    ]);

    const totalOrdersCount = periodOrders.length;

    // Pricing & Revenue
    const pricedOrders = periodOrders.filter(o => o.amount != null && !isNaN(o.amount) && o.amount > 0);
    const pricedOrdersCount = pricedOrders.length;
    const hasPricing = pricedOrdersCount > 0;
    const totalRevValue = hasPricing ? pricedOrders.reduce((sum, o) => sum + o.amount, 0) : null;

    const prevPricedOrders = prevOrders.filter(o => o.amount != null && !isNaN(o.amount) && o.amount > 0);
    const prevRevValue = prevPricedOrders.reduce((sum, o) => sum + o.amount, 0);
    const revChange = (hasPricing && prevRevValue > 0) ? calcChange(totalRevValue, prevRevValue) : 0;

    let revDisplay = 'Not tracked';
    if (hasPricing && totalRevValue !== null) {
      if (totalRevValue >= 100000) {
        revDisplay = `₹ ${(totalRevValue / 100000).toFixed(2)} Lakhs`;
      } else {
        revDisplay = `₹ ${totalRevValue.toLocaleString('en-IN')}`;
      }
    }

    // Units
    let totalUnits = 0;
    periodOrders.forEach(o => {
      (o.lineItems || []).forEach(li => {
        totalUnits += (li.qty || 0);
      });
    });

    // Average Order Value
    const avgOrderVal = hasPricing ? Math.round(totalRevValue / pricedOrdersCount) : null;
    const prevOrderCount = prevPricedOrders.length;
    const prevAov = prevOrderCount > 0 ? Math.round(prevRevValue / prevOrderCount) : 0;
    const aovChange = (avgOrderVal != null && prevAov > 0) ? calcChange(avgOrderVal, prevAov) : 0;

    // Status breakdown for this month / filter
    const statusCounts = {
      confirmed: 0,
      delivered: 0,
      pending: 0,
      cancelled: 0,
      lost: 0
    };

    const uniqueCustomerIds = new Set();
    periodOrders.forEach(o => {
      if (statusCounts[o.status] !== undefined) {
        statusCounts[o.status]++;
      }
      if (o.customerId) {
        uniqueCustomerIds.add(o.customerId._id?.toString() || o.customerId.toString());
      }
    });

    const activeCustomersCount = uniqueCustomerIds.size;
    const prevTotalOrdersCount = prevOrders.length;
    const ordersChange = calcChange(totalOrdersCount, prevTotalOrdersCount);
    const winRateVal = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 1000) / 10 : 0;

    return res.json({
      periodLabel,
      totalOrders: {
        value: totalOrdersCount,
        display: totalOrdersCount.toLocaleString('en-IN'),
        change: ordersChange
      },
      totalRevenue: {
        value: totalRevValue,
        hasPricing,
        display: revDisplay,
        change: revChange,
        coverage: {
          pricedCount: pricedOrdersCount,
          totalCount: totalOrdersCount
        }
      },
      totalUnits: {
        value: totalUnits,
        display: `${totalUnits.toLocaleString('en-IN')} units`
      },
      avgOrderValue: {
        value: avgOrderVal,
        hasPricing,
        display: avgOrderVal != null ? `₹ ${avgOrderVal.toLocaleString('en-IN')}` : 'Not tracked',
        change: aovChange
      },
      statusCounts,
      activeCustomers: {
        value: activeCustomersCount,
        display: activeCustomersCount.toLocaleString('en-IN')
      },
      winRate: {
        value: winRateVal,
        display: `${winRateVal}%`
      }
    });
  } catch (error) {
    console.error('Error fetching reports overview:', error);
    return res.status(500).json({ message: 'Server error fetching reports overview' });
  }
};

// ==========================================
// 3. GET REVENUE & ORDER TREND (MONTH-BASED)
// ==========================================
// GET /api/reports/revenue-trend
const getRevenueTrend = async (req, res) => {
  try {
    const { filter, from, to } = buildOrderFilter(req.query);

    const orders = await Order.find(filter).sort({ orderDate: 1, createdAt: 1 });

    const dayMap = new Map();
    orders.forEach(o => {
      const d = new Date(o.orderDate || o.createdAt);
      const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      const current = dayMap.get(key) || { date: key, orders: 0, revenue: 0, units: 0 };
      current.orders++;
      if (o.amount != null && !isNaN(o.amount) && o.amount > 0) {
        current.revenue += o.amount;
      }
      (o.lineItems || []).forEach(li => {
        current.units += (li.qty || 0);
      });
      dayMap.set(key, current);
    });

    const trend = Array.from(dayMap.values());
    return res.json(trend);
  } catch (error) {
    console.error('Error fetching revenue trend:', error);
    return res.status(500).json({ message: 'Server error fetching revenue trend' });
  }
};

// ==========================================
// 4. GET ORDERS BY STATUS (MONTH-BASED)
// ==========================================
// GET /api/reports/orders-by-status
const getOrdersByStatus = async (req, res) => {
  try {
    const { filter } = buildOrderFilter(req.query);
    const orders = await Order.find(filter);

    const counts = {
      confirmed: 0,
      delivered: 0,
      pending: 0,
      cancelled: 0,
      lost: 0
    };

    orders.forEach(o => {
      if (counts[o.status] !== undefined) {
        counts[o.status]++;
      }
    });

    const total = orders.length || 1;
    const STATUS_COLORS = {
      confirmed: '#2563EB',
      delivered: '#10B981',
      pending: '#8B5CF6',
      cancelled: '#F43F5E',
      lost: '#DC2626'
    };

    const result = Object.entries(counts).map(([status, count]) => ({
      status: status.charAt(0).toUpperCase() + status.slice(1),
      count,
      percentage: Math.round((count / total) * 100),
      color: STATUS_COLORS[status] || '#94A3B8'
    }));

    return res.json(result);
  } catch (error) {
    console.error('Error fetching orders by status:', error);
    return res.status(500).json({ message: 'Server error fetching orders by status' });
  }
};

// ==========================================
// 5. GET TOP PRODUCTS (WITH DIMENSIONS)
// ==========================================
// GET /api/reports/top-products
const getTopProducts = async (req, res) => {
  try {
    const { filter } = buildOrderFilter(req.query);
    const orders = await Order.find(filter).populate('lineItems.productId');

    const productMap = new Map();
    let grandUnits = 0;
    let grandSales = 0;

    orders.forEach(ord => {
      (ord.lineItems || []).forEach(li => {
        const p = li.productId || {};
        const prodId = p._id?.toString() || li.name || 'custom';
        const name = li.name || p.name || 'Label Product';
        const dimKey = li.dimensionKey || p.dimensionKey || (p.widthMm && p.heightMm ? `${p.widthMm}x${p.heightMm} ${p.unit || 'MM'}` : 'N/A');
        const qty = li.qty || 0;
        const lineVal = li.lineTotal != null
          ? li.lineTotal
          : (li.price != null && qty ? qty * li.price : 0);

        grandUnits += qty;
        grandSales += lineVal;

        const existing = productMap.get(prodId) || {
          id: p._id || prodId,
          name,
          dimensionKey: dimKey,
          widthMm: p.widthMm || null,
          heightMm: p.heightMm || null,
          unit: p.unit || 'MM',
          category: p.category || 'General',
          material: p.material || '',
          totalQty: 0,
          totalSales: 0,
          ordersCount: 0
        };

        existing.totalQty += qty;
        existing.totalSales += lineVal;
        existing.ordersCount++;
        productMap.set(prodId, existing);
      });
    });

    const COLORS = ['#2563EB', '#9333EA', '#F97316', '#F59E0B', '#10B981', '#64748B'];
    const list = Array.from(productMap.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10)
      .map((item, idx) => {
        const pct = grandUnits > 0 ? Math.round((item.totalQty / grandUnits) * 100) : 0;
        return {
          ...item,
          percentage: pct,
          sales: item.totalSales > 0 ? `₹ ${item.totalSales.toLocaleString('en-IN')}` : `${item.totalQty.toLocaleString('en-IN')} units`,
          value: item.totalSales > 0 ? item.totalSales : item.totalQty,
          color: COLORS[idx % COLORS.length]
        };
      });

    return res.json(list);
  } catch (error) {
    console.error('Error fetching top products:', error);
    return res.status(500).json({ message: 'Server error fetching top products' });
  }
};

// ==========================================
// 6. GET TOP CUSTOMERS REPORT
// ==========================================
// GET /api/reports/top-customers
const getTopCustomersReport = async (req, res) => {
  try {
    const { filter } = buildOrderFilter(req.query);
    const orders = await Order.find(filter).populate('customerId', 'name company city phone email');

    const customerMap = new Map();
    orders.forEach(o => {
      if (!o.customerId) return;
      const c = o.customerId;
      const cId = c._id.toString();

      const existing = customerMap.get(cId) || {
        id: c._id,
        name: c.name || 'Customer Account',
        company: c.company || '—',
        city: c.city || '—',
        phone: c.phone || '—',
        email: c.email || '—',
        ordersCount: 0,
        totalUnits: 0,
        totalRevenue: 0,
        lastOrderDate: o.orderDate || o.createdAt
      };

      existing.ordersCount++;
      if (o.amount != null && !isNaN(o.amount) && o.amount > 0) {
        existing.totalRevenue += o.amount;
      }
      (o.lineItems || []).forEach(li => {
        existing.totalUnits += (li.qty || 0);
      });

      const thisDate = new Date(o.orderDate || o.createdAt);
      if (thisDate > new Date(existing.lastOrderDate)) {
        existing.lastOrderDate = thisDate;
      }

      customerMap.set(cId, existing);
    });

    const COLOR_BG_LIST = ['bg-indigo-600', 'bg-purple-600', 'bg-blue-600', 'bg-emerald-600', 'bg-amber-600'];
    const getInitials = (name) => {
      if (!name) return 'JS';
      const parts = name.trim().split(' ');
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.substring(0, 2).toUpperCase();
    };

    const list = Array.from(customerMap.values())
      .sort((a, b) => b.totalUnits - a.totalUnits)
      .slice(0, 10)
      .map((item, idx) => ({
        ...item,
        initials: getInitials(item.name),
        initialsBg: COLOR_BG_LIST[idx % COLOR_BG_LIST.length],
        revenueDisplay: item.totalRevenue > 0 ? `₹ ${item.totalRevenue.toLocaleString('en-IN')}` : `${item.totalUnits.toLocaleString('en-IN')} units`
      }));

    return res.json(list);
  } catch (error) {
    console.error('Error fetching top customers:', error);
    return res.status(500).json({ message: 'Server error fetching top customers' });
  }
};

// ==========================================
// 7. GET EXECUTIVE PERFORMANCE
// ==========================================
// GET /api/reports/executive-performance
const getExecutivePerformance = async (req, res) => {
  try {
    const { filter } = buildOrderFilter(req.query);
    const orders = await Order.find(filter).populate('salesExecutive', 'name email avatarUrl role');

    const execMap = new Map();
    orders.forEach(o => {
      const exec = o.salesExecutive;
      const execId = exec?._id ? exec._id.toString() : 'unassigned';
      const execName = exec?.name || 'Unassigned / Direct';

      const existing = execMap.get(execId) || {
        id: execId,
        name: execName,
        email: exec?.email || '—',
        role: exec?.role || 'Executive',
        avatarUrl: exec?.avatarUrl || null,
        totalOrders: 0,
        totalUnits: 0,
        totalRevenue: 0
      };

      existing.totalOrders++;
      if (o.amount != null && !isNaN(o.amount) && o.amount > 0) {
        existing.totalRevenue += o.amount;
      }
      (o.lineItems || []).forEach(li => {
        existing.totalUnits += (li.qty || 0);
      });

      execMap.set(execId, existing);
    });

    const list = Array.from(execMap.values()).sort((a, b) => b.totalOrders - a.totalOrders);
    return res.json(list);
  } catch (error) {
    console.error('Error fetching executive performance:', error);
    return res.status(500).json({ message: 'Server error fetching executive performance' });
  }
};

// ==========================================
// 8. GET CUSTOMER REPORT SUMMARY (TABULAR)
// ==========================================
// GET /api/reports/customer-summary
const getCustomerReportSummary = async (req, res) => {
  try {
    const { filter } = buildOrderFilter(req.query);
    const orders = await Order.find(filter)
      .populate('customerId', 'name company city phone email')
      .populate('lineItems.productId', 'name dimensionKey widthMm heightMm unit');

    const customerMap = new Map();
    orders.forEach(o => {
      if (!o.customerId) return;
      const c = o.customerId;
      const cId = c._id.toString();

      const existing = customerMap.get(cId) || {
        id: c._id,
        name: c.name || 'Customer Account',
        company: c.company || '—',
        city: c.city || '—',
        phone: c.phone || '—',
        email: c.email || '—',
        ordersCount: 0,
        totalUnits: 0,
        totalRevenue: 0,
        productsSet: new Set(),
        lastOrderDate: o.orderDate || o.createdAt
      };

      existing.ordersCount++;
      if (o.amount != null && !isNaN(o.amount) && o.amount > 0) {
        existing.totalRevenue += o.amount;
      }
      (o.lineItems || []).forEach(li => {
        existing.totalUnits += (li.qty || 0);
        if (li.name) existing.productsSet.add(li.name);
      });

      const d = new Date(o.orderDate || o.createdAt);
      if (d > new Date(existing.lastOrderDate)) {
        existing.lastOrderDate = d;
      }

      customerMap.set(cId, existing);
    });

    const list = Array.from(customerMap.values())
      .map(item => ({
        ...item,
        uniqueProductsCount: item.productsSet.size,
        productsSet: undefined
      }))
      .sort((a, b) => (b.totalRevenue || b.totalUnits) - (a.totalRevenue || a.totalUnits));

    return res.json(list);
  } catch (error) {
    console.error('Error fetching customer report summary:', error);
    return res.status(500).json({ message: 'Server error fetching customer report summary' });
  }
};

// ==========================================
// 9. GET PRODUCT REPORT SUMMARY (TABULAR WITH DIMENSIONS)
// ==========================================
// GET /api/reports/product-summary
const getProductReportSummary = async (req, res) => {
  try {
    const { filter } = buildOrderFilter(req.query);
    const orders = await Order.find(filter)
      .populate('customerId', 'name company city')
      .populate('lineItems.productId', 'name dimensionKey widthMm heightMm unit category material');

    const productMap = new Map();
    orders.forEach(o => {
      (o.lineItems || []).forEach(li => {
        const p = li.productId || {};
        const prodId = p._id ? p._id.toString() : (li.name || 'custom');
        const name = li.name || p.name || 'Label Product';
        const width = p.widthMm || null;
        const height = p.heightMm || null;
        const unit = p.unit || 'MM';
        const dimKey = li.dimensionKey || p.dimensionKey || (width && height ? `${width}x${height} ${unit}` : 'N/A');
        const dimDisplay = width && height ? `${width} x ${height} ${unit}` : dimKey;
        const qty = li.qty || 0;
        const lineAmt = li.lineTotal != null ? li.lineTotal : (li.price != null && qty ? qty * li.price : 0);

        const existing = productMap.get(prodId) || {
          id: p._id || null,
          name,
          dimensionKey: dimKey,
          dimensions: dimDisplay,
          widthMm: width,
          heightMm: height,
          unit,
          category: p.category || 'General',
          material: p.material || 'Standard',
          ordersCount: 0,
          totalUnits: 0,
          totalRevenue: 0,
          customersSet: new Set()
        };

        existing.ordersCount++;
        existing.totalUnits += qty;
        existing.totalRevenue += lineAmt;
        if (o.customerId?.name) existing.customersSet.add(o.customerId.name);

        productMap.set(prodId, existing);
      });
    });

    const list = Array.from(productMap.values())
      .map(item => ({
        ...item,
        uniqueCustomersCount: item.customersSet.size,
        customersSet: undefined
      }))
      .sort((a, b) => b.totalUnits - a.totalUnits);

    return res.json(list);
  } catch (error) {
    console.error('Error fetching product report summary:', error);
    return res.status(500).json({ message: 'Server error fetching product report summary' });
  }
};

// ==========================================
// 10. EXPORT MONTHLY REPORT (MULTI-SHEET WITH PRODUCT DIMENSIONS & TOTALS)
// ==========================================
// GET /api/reports/export/monthly
const exportMonthlyReportExcel = async (req, res) => {
  try {
    const { filter, periodLabel } = buildOrderFilter(req.query);

    const orders = await Order.find(filter)
      .populate('customerId', 'name company phone email city address deliveryAddress')
      .populate('salesExecutive', 'name email role')
      .populate('lineItems.productId', 'name dimensionKey widthMm heightMm unit category material')
      .sort({ orderDate: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JS Labels Reports Engine';
    workbook.lastModifiedBy = req.user.name || 'JS Labels';
    workbook.created = new Date();

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Dark Navy
    const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Sapphire Navy
    const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    const headerFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };

    // -------------------------------------------------------------
    // SHEET 1: OVERVIEW & MONTHLY KPI SUMMARY
    // -------------------------------------------------------------
    const overviewSheet = workbook.addWorksheet('Monthly Overview', { views: [{ showGridLines: true }] });
    overviewSheet.mergeCells('A1:G1');
    const tCell = overviewSheet.getCell('A1');
    tCell.value = `JS LABELS — MONTHLY EXECUTIVE REPORT: ${periodLabel.toUpperCase()}`;
    tCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    tCell.fill = sectionFill;
    tCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    overviewSheet.getRow(1).height = 32;

    overviewSheet.mergeCells('A2:G2');
    const sCell = overviewSheet.getCell('A2');
    sCell.value = `Generated: ${new Date().toLocaleString('en-IN')}  |  Exported By: ${req.user.name || 'Admin'}  |  Total Orders In Scope: ${orders.length}`;
    sCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
    sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    sCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    overviewSheet.getRow(2).height = 20;

    // KPI Metrics calculation
    let grandUnits = 0;
    let grandRevenue = 0;
    const statusCounts = { confirmed: 0, delivered: 0, pending: 0, cancelled: 0, lost: 0 };
    const customerSet = new Set();
    const productSet = new Set();

    orders.forEach(o => {
      if (statusCounts[o.status] !== undefined) statusCounts[o.status]++;
      if (o.amount != null && !isNaN(o.amount) && o.amount > 0) grandRevenue += o.amount;
      if (o.customerId?.name) customerSet.add(o.customerId.name);
      (o.lineItems || []).forEach(li => {
        grandUnits += (li.qty || 0);
        if (li.name) productSet.add(li.name);
      });
    });

    overviewSheet.mergeCells('A4:G4');
    const kpiHeader = overviewSheet.getCell('A4');
    kpiHeader.value = '1. PERFORMANCE & VOLUME METRICS';
    kpiHeader.font = headerFont;
    kpiHeader.fill = subHeaderFill;
    kpiHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    overviewSheet.getRow(4).height = 24;

    const kpiRows = [
      ['Total Orders', orders.length, '', 'Total Production Units', grandUnits.toLocaleString('en-IN'), ''],
      ['Total Revenue', grandRevenue > 0 ? `₹ ${grandRevenue.toLocaleString('en-IN')}` : 'Not tracked', '', 'Unique Customers', customerSet.size, ''],
      ['Confirmed Orders', statusCounts.confirmed, '', 'Delivered Orders', statusCounts.delivered, ''],
      ['Pending Orders', statusCounts.pending, '', 'Cancelled / Lost Orders', statusCounts.cancelled + statusCounts.lost, ''],
      ['Distinct Products', productSet.size, '', 'Reporting Period', periodLabel, '']
    ];

    kpiRows.forEach((rVals, idx) => {
      const rNum = 5 + idx;
      const row = overviewSheet.getRow(rNum);
      row.values = [rVals[0], rVals[1], '', rVals[3], rVals[4], ''];
      overviewSheet.mergeCells(`B${rNum}:C${rNum}`);
      overviewSheet.mergeCells(`E${rNum}:F${rNum}`);

      ['A', 'D'].forEach(c => {
        const cell = overviewSheet.getCell(`${c}${rNum}`);
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cell.border = thinBorder;
      });
      ['B', 'E'].forEach(c => {
        const cell = overviewSheet.getCell(`${c}${rNum}`);
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
        cell.border = thinBorder;
      });
      row.height = 22;
    });

    overviewSheet.columns = [
      { key: 'A', width: 22 },
      { key: 'B', width: 20 },
      { key: 'C', width: 10 },
      { key: 'D', width: 24 },
      { key: 'E', width: 24 },
      { key: 'F', width: 10 },
      { key: 'G', width: 20 }
    ];

    // -------------------------------------------------------------
    // SHEET 2: COMPLETE ORDERS REGISTER
    // -------------------------------------------------------------
    const ordersSheet = workbook.addWorksheet('Orders Register', { views: [{ showGridLines: true }] });
    const orderHeaders = [
      'Order No',
      'PO Date',
      'Customer Name',
      'Company Name',
      'Phone Number',
      'City',
      'Order Status',
      'Total Quantity (Units)',
      'Order Value (₹)',
      'Expected Delivery Date',
      'Sales Executive',
      'Delivery Address',
      'Order Notes'
    ];

    const oHRow = ordersSheet.getRow(1);
    oHRow.values = orderHeaders;
    oHRow.height = 26;
    oHRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    let oRowIdx = 2;
    orders.forEach((ord, idx) => {
      const cust = ord.customerId || {};
      const orderNo = ord.orderNo || `ORD-${ord._id.toString().slice(-6).toUpperCase()}`;
      const poDate = ord.orderDate ? new Date(ord.orderDate) : new Date(ord.createdAt);
      const deliveryDate = ord.deliveryDate ? new Date(ord.deliveryDate) : null;
      const totalUnits = (ord.lineItems || []).reduce((sum, item) => sum + (item.qty || 0), 0);
      const amountVal = ord.amount != null ? ord.amount : null;

      const row = ordersSheet.getRow(oRowIdx);
      row.values = [
        orderNo,
        poDate.toLocaleDateString('en-IN'),
        cust.name || 'N/A',
        cust.company || '—',
        cust.phone || '—',
        cust.city || '—',
        (ord.status || 'confirmed').toUpperCase(),
        totalUnits,
        amountVal != null ? amountVal : '—',
        deliveryDate ? deliveryDate.toLocaleDateString('en-IN') : 'Pending',
        ord.salesExecutive?.name || 'Unassigned',
        ord.deliveryAddress || cust.address || '—',
        ord.notes || '—'
      ];
      row.height = 20;

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: [8, 9].includes(colNum) ? 'right' : 'left' };
        if (idx % 2 === 1) cell.fill = zebraFill;
      });
      oRowIdx++;
    });

    // Orders Total Row
    const ordTotRow = ordersSheet.getRow(oRowIdx);
    ordTotRow.values = ['TOTALS', '', '', '', '', '', `${orders.length} Orders`, grandUnits, grandRevenue > 0 ? grandRevenue : '—', '', '', '', ''];
    ordersSheet.mergeCells(`A${oRowIdx}:F${oRowIdx}`);
    ordTotRow.height = 24;
    ordTotRow.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = thinBorder;
    });

    ordersSheet.columns = [
      { key: 'A', width: 18 },
      { key: 'B', width: 14 },
      { key: 'C', width: 25 },
      { key: 'D', width: 25 },
      { key: 'E', width: 16 },
      { key: 'F', width: 16 },
      { key: 'G', width: 16 },
      { key: 'H', width: 22 },
      { key: 'I', width: 18 },
      { key: 'J', width: 18 },
      { key: 'K', width: 20 },
      { key: 'L', width: 30 },
      { key: 'M', width: 30 }
    ];

    // -------------------------------------------------------------
    // SHEET 3: ITEMIZED PRODUCTS & DIMENSIONS BREAKDOWN
    // -------------------------------------------------------------
    const itemsSheet = workbook.addWorksheet('Products & Dimensions', { views: [{ showGridLines: true }] });
    const itemHeaders = [
      'Order No',
      'PO Date',
      'Customer Name',
      'Company Name',
      'Item #',
      'Product Name',
      'Dimension Key',
      'Product Dimensions (WxH)',
      'Dimension Unit',
      'Category',
      'Material',
      'Quantity (Units)',
      'Unit Price (₹)',
      'Line Total (₹)',
      'Order Status'
    ];

    const iHRow = itemsSheet.getRow(1);
    iHRow.values = itemHeaders;
    iHRow.height = 26;
    iHRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    let iRowIdx = 2;
    let grandLineTotal = 0;

    orders.forEach((ord) => {
      const cust = ord.customerId || {};
      const orderNo = ord.orderNo || `ORD-${ord._id.toString().slice(-6).toUpperCase()}`;
      const poDate = ord.orderDate ? new Date(ord.orderDate) : new Date(ord.createdAt);

      (ord.lineItems || []).forEach((li, idx) => {
        const p = li.productId || {};
        const prodName = li.name || p.name || 'Custom Label';
        const dimKey = li.dimensionKey || p.dimensionKey || 'N/A';
        const width = p.widthMm || null;
        const height = p.heightMm || null;
        const unit = p.unit || 'MM';
        const dimsFormatted = width && height ? `${width} x ${height}` : dimKey;
        const qty = li.qty || 0;
        const price = li.price != null ? li.price : '—';
        const lineTot = li.lineTotal != null ? li.lineTotal : (li.price != null && qty ? qty * li.price : '—');
        if (typeof lineTot === 'number') grandLineTotal += lineTot;

        const row = itemsSheet.getRow(iRowIdx);
        row.values = [
          orderNo,
          poDate.toLocaleDateString('en-IN'),
          cust.name || 'N/A',
          cust.company || '—',
          idx + 1,
          prodName,
          dimKey,
          dimsFormatted,
          unit,
          p.category || 'General',
          p.material || 'Standard',
          qty,
          price,
          lineTot,
          (ord.status || 'confirmed').toUpperCase()
        ];
        row.height = 20;

        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = thinBorder;
          cell.alignment = { vertical: 'middle', horizontal: [12, 13, 14].includes(colNum) ? 'right' : 'left' };
          if (iRowIdx % 2 === 1) cell.fill = zebraFill;
        });
        iRowIdx++;
      });
    });

    // Items Total Row
    const itemTotRow = itemsSheet.getRow(iRowIdx);
    itemTotRow.values = ['TOTAL UNITS & LINE VALUES', '', '', '', '', '', '', '', '', '', '', grandUnits, '', grandLineTotal > 0 ? grandLineTotal : '—', ''];
    itemsSheet.mergeCells(`A${iRowIdx}:K${iRowIdx}`);
    itemTotRow.height = 24;
    itemTotRow.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = thinBorder;
    });

    itemsSheet.columns = [
      { key: 'A', width: 18 },
      { key: 'B', width: 14 },
      { key: 'C', width: 25 },
      { key: 'D', width: 25 },
      { key: 'E', width: 8 },
      { key: 'F', width: 30 },
      { key: 'G', width: 18 },
      { key: 'H', width: 24 },
      { key: 'I', width: 14 },
      { key: 'J', width: 18 },
      { key: 'K', width: 18 },
      { key: 'L', width: 16 },
      { key: 'M', width: 14 },
      { key: 'N', width: 16 },
      { key: 'O', width: 16 }
    ];

    // Set Response Headers and Stream Download
    const filename = `JS_Labels_Monthly_Report_${periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating monthly excel report:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error generating monthly report' });
    }
  }
};

// ==========================================
// 11. EXPORT INDIVIDUAL CUSTOMER REPORT (WITH COMPLETE ORDERS & PRODUCT DIMENSIONS)
// ==========================================
// GET /api/reports/export/customer/:customerId
const exportIndividualCustomerReportExcel = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from, to, period, month } = req.query;

    const customer = await Customer.findById(customerId).setOptions({ includeDeleted: true })
      .populate('salesExecutive', 'name email phone role');

    if (!customer) {
      return res.status(404).json({ message: 'Customer account not found' });
    }

    // Caller ownership check
    if (req.user.role === 'caller' && customer.salesExecutive?._id?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only export your own customers' });
    }

    const { filter, periodLabel } = buildOrderFilter({ ...req.query, customerId });
    const orders = await Order.find(filter)
      .populate('salesExecutive', 'name email role')
      .populate('lineItems.productId', 'name dimensionKey widthMm heightMm unit category material')
      .sort({ orderDate: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JS Labels CRM';
    workbook.lastModifiedBy = req.user.name || 'System User';
    workbook.created = new Date();

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    const headerFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };

    // -------------------------------------------------------------
    // SHEET 1: CUSTOMER PROFILE & ORDER HISTORY
    // -------------------------------------------------------------
    const custSheet = workbook.addWorksheet('Customer Dossier', { views: [{ showGridLines: true }] });
    custSheet.mergeCells('A1:G1');
    const tCell = custSheet.getCell('A1');
    tCell.value = `JS LABELS — CUSTOMER REPORT: ${customer.name.toUpperCase()}`;
    tCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    tCell.fill = sectionFill;
    tCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    custSheet.getRow(1).height = 32;

    custSheet.mergeCells('A2:G2');
    const sCell = custSheet.getCell('A2');
    sCell.value = `Generated: ${new Date().toLocaleString('en-IN')}  |  Scope: ${periodLabel}  |  Company: ${customer.company || 'Individual Account'}`;
    sCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
    sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    sCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    custSheet.getRow(2).height = 20;

    // Profile Details Table
    custSheet.mergeCells('A4:G4');
    const pHeader = custSheet.getCell('A4');
    pHeader.value = '1. CUSTOMER ACCOUNT & BILLING INFORMATION';
    pHeader.font = headerFont;
    pHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    pHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    custSheet.getRow(4).height = 24;

    const profileData = [
      ['Customer Name', customer.name, '', 'Company Name', customer.company || '—', ''],
      ['Primary Phone', customer.phone || '—', '', 'Secondary Phone', customer.phone2 || '—', ''],
      ['Email Address', customer.email || '—', '', 'City / State', `${customer.city || '—'}, ${customer.state || '—'}`, ''],
      ['Billing Address', customer.address || '—', '', 'Delivery Address', customer.deliveryAddress || customer.address || '—', ''],
      ['Assigned Executive', customer.salesExecutive?.name || 'Unassigned', '', 'GST Number', customer.gstNo || '—', '']
    ];

    profileData.forEach((rVals, idx) => {
      const rNum = 5 + idx;
      custSheet.getRow(rNum).values = [rVals[0], rVals[1], '', rVals[3], rVals[4], ''];
      custSheet.mergeCells(`B${rNum}:C${rNum}`);
      custSheet.mergeCells(`E${rNum}:F${rNum}`);

      ['A', 'D'].forEach(c => {
        const cell = custSheet.getCell(`${c}${rNum}`);
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cell.border = thinBorder;
      });
      ['B', 'E'].forEach(c => {
        const cell = custSheet.getCell(`${c}${rNum}`);
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
        cell.border = thinBorder;
      });
      custSheet.getRow(rNum).height = 20;
    });

    // Orders Section
    const oSecRow = 11;
    custSheet.mergeCells(`A${oSecRow}:G${oSecRow}`);
    const oSecHeader = custSheet.getCell(`A${oSecRow}`);
    oSecHeader.value = '2. ORDER HISTORY FOR THIS PERIOD';
    oSecHeader.font = headerFont;
    oSecHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    oSecHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    custSheet.getRow(oSecRow).height = 24;

    const ordHeaders = ['Order No', 'PO Date', 'Order Status', 'Total Units', 'Order Total (₹)', 'Expected Delivery', 'Delivery Address'];
    const ordHRow = custSheet.getRow(oSecRow + 1);
    ordHRow.values = ordHeaders;
    ordHRow.height = 24;
    ordHRow.eachCell(c => {
      c.fill = headerFill;
      c.font = headerFont;
      c.border = thinBorder;
      c.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    let oIdx = oSecRow + 2;
    let custTotalUnits = 0;
    let custTotalAmount = 0;

    orders.forEach((ord, index) => {
      const orderNo = ord.orderNo || `ORD-${ord._id.toString().slice(-6).toUpperCase()}`;
      const poDateStr = ord.orderDate ? new Date(ord.orderDate).toLocaleDateString('en-IN') : 'N/A';
      const delDateStr = ord.deliveryDate ? new Date(ord.deliveryDate).toLocaleDateString('en-IN') : 'Pending';
      const units = (ord.lineItems || []).reduce((sum, item) => sum + (item.qty || 0), 0);
      custTotalUnits += units;
      if (ord.amount) custTotalAmount += ord.amount;

      const row = custSheet.getRow(oIdx);
      row.values = [
        orderNo,
        poDateStr,
        (ord.status || 'confirmed').toUpperCase(),
        units,
        ord.amount != null ? ord.amount : '—',
        delDateStr,
        ord.deliveryAddress || customer.deliveryAddress || '—'
      ];
      row.height = 20;

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: [4, 5].includes(colNum) ? 'right' : 'left' };
        if (index % 2 === 1) cell.fill = zebraFill;
      });
      oIdx++;
    });

    // Orders Total Row
    const totRow = custSheet.getRow(oIdx);
    totRow.values = ['TOTAL ORDERS & VOLUME', '', `${orders.length} Orders`, custTotalUnits, custTotalAmount > 0 ? custTotalAmount : '—', '', ''];
    custSheet.mergeCells(`A${oIdx}:B${oIdx}`);
    totRow.height = 24;
    totRow.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = thinBorder;
    });

    custSheet.columns = [
      { key: 'A', width: 20 },
      { key: 'B', width: 16 },
      { key: 'C', width: 16 },
      { key: 'D', width: 18 },
      { key: 'E', width: 18 },
      { key: 'F', width: 20 },
      { key: 'G', width: 35 }
    ];

    // -------------------------------------------------------------
    // SHEET 2: PURCHASED PRODUCTS & SPECIFICATIONS WITH DIMENSIONS
    // -------------------------------------------------------------
    const itemsSheet = workbook.addWorksheet('Ordered Items & Dimensions', { views: [{ showGridLines: true }] });
    const iHeaders = [
      'Order No',
      'PO Date',
      'Product Name',
      'Dimension Key',
      'Dimensions (WxH)',
      'Dimension Unit',
      'Category',
      'Material',
      'Ordered Qty',
      'Unit Price (₹)',
      'Line Total (₹)',
      'Status'
    ];

    const iHRow = itemsSheet.getRow(1);
    iHRow.values = iHeaders;
    iHRow.height = 26;
    iHRow.eachCell(c => {
      c.fill = headerFill;
      c.font = headerFont;
      c.border = thinBorder;
      c.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    let itemRowIdx = 2;
    orders.forEach((ord) => {
      const orderNo = ord.orderNo || `ORD-${ord._id.toString().slice(-6).toUpperCase()}`;
      const poDateStr = ord.orderDate ? new Date(ord.orderDate).toLocaleDateString('en-IN') : 'N/A';

      (ord.lineItems || []).forEach((li) => {
        const p = li.productId || {};
        const width = p.widthMm || null;
        const height = p.heightMm || null;
        const unit = p.unit || 'MM';
        const dimKey = li.dimensionKey || p.dimensionKey || 'N/A';
        const dimsFormatted = width && height ? `${width} x ${height}` : dimKey;

        const row = itemsSheet.getRow(itemRowIdx);
        row.values = [
          orderNo,
          poDateStr,
          li.name || p.name || 'Custom Product',
          dimKey,
          dimsFormatted,
          unit,
          p.category || 'General',
          p.material || 'Standard',
          li.qty || 0,
          li.price != null ? li.price : '—',
          li.lineTotal != null ? li.lineTotal : (li.price != null && li.qty ? li.price * li.qty : '—'),
          (ord.status || 'confirmed').toUpperCase()
        ];
        row.height = 20;

        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = thinBorder;
          cell.alignment = { vertical: 'middle', horizontal: [9, 10, 11].includes(colNum) ? 'right' : 'left' };
          if (itemRowIdx % 2 === 1) cell.fill = zebraFill;
        });
        itemRowIdx++;
      });
    });

    itemsSheet.columns = [
      { key: 'A', width: 18 },
      { key: 'B', width: 14 },
      { key: 'C', width: 30 },
      { key: 'D', width: 18 },
      { key: 'E', width: 22 },
      { key: 'F', width: 14 },
      { key: 'G', width: 18 },
      { key: 'H', width: 18 },
      { key: 'I', width: 16 },
      { key: 'J', width: 14 },
      { key: 'K', width: 16 },
      { key: 'L', width: 16 }
    ];

    const safeCustName = customer.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Customer_Report_${safeCustName}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting individual customer excel report:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error generating customer report' });
    }
  }
};

// ==========================================
// 12. EXPORT INDIVIDUAL PRODUCT REPORT (WITH SPECIFICATIONS, DIMENSIONS & BUYING CLIENTS)
// ==========================================
// GET /api/reports/export/product/:productId
const exportIndividualProductReportExcel = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: 'Product not found in catalog' });
    }

    const { filter, periodLabel } = buildOrderFilter({ ...req.query, productId });
    const orders = await Order.find(filter)
      .populate('customerId', 'name company city phone email')
      .populate('salesExecutive', 'name email role')
      .populate('lineItems.productId')
      .sort({ orderDate: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JS Labels CRM';
    workbook.lastModifiedBy = req.user.name || 'System User';
    workbook.created = new Date();

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    const headerFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };

    // -------------------------------------------------------------
    // SHEET 1: PRODUCT SPECIFICATIONS & DIMENSIONS DOSSIER
    // -------------------------------------------------------------
    const prodSheet = workbook.addWorksheet('Product Dossier', { views: [{ showGridLines: true }] });
    prodSheet.mergeCells('A1:G1');
    const tCell = prodSheet.getCell('A1');
    tCell.value = `JS LABELS — PRODUCT PERFORMANCE REPORT: ${product.name.toUpperCase()}`;
    tCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    tCell.fill = sectionFill;
    tCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    prodSheet.getRow(1).height = 32;

    prodSheet.mergeCells('A2:G2');
    const sCell = prodSheet.getCell('A2');
    sCell.value = `Generated: ${new Date().toLocaleString('en-IN')}  |  Scope: ${periodLabel}  |  Dimension Key: ${product.dimensionKey || `${product.widthMm}x${product.heightMm} ${product.unit || 'MM'}`}`;
    sCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
    sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    sCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    prodSheet.getRow(2).height = 20;

    // Product Specifications Section
    prodSheet.mergeCells('A4:G4');
    const pHeader = prodSheet.getCell('A4');
    pHeader.value = '1. PRODUCT SPECIFICATIONS & EXACT DIMENSIONS';
    pHeader.font = headerFont;
    pHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    pHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    prodSheet.getRow(4).height = 24;

    const dimDisplay = (product.widthMm && product.heightMm)
      ? `${product.widthMm} x ${product.heightMm} ${product.unit || 'MM'}`
      : (product.dimensionKey || 'N/A');

    const specRows = [
      ['Product Friendly Name', product.name, '', 'Dimension Key', product.dimensionKey || '—', ''],
      ['Width Dimension', `${product.widthMm || 0} ${product.unit || 'MM'}`, '', 'Height Dimension', `${product.heightMm || 0} ${product.unit || 'MM'}`, ''],
      ['Combined Dimensions', dimDisplay, '', 'Measurement Unit', product.unit || 'MM', ''],
      ['Category', product.category || 'General', '', 'Material', product.material || 'Standard', ''],
      ['Label Name', product.jobName || '—', '', 'Default Usage Cycle', `${product.defaultUsageCycleDays || 30} Days`, '']
    ];

    specRows.forEach((rVals, idx) => {
      const rNum = 5 + idx;
      prodSheet.getRow(rNum).values = [rVals[0], rVals[1], '', rVals[3], rVals[4], ''];
      prodSheet.mergeCells(`B${rNum}:C${rNum}`);
      prodSheet.mergeCells(`E${rNum}:F${rNum}`);

      ['A', 'D'].forEach(c => {
        const cell = prodSheet.getCell(`${c}${rNum}`);
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cell.border = thinBorder;
      });
      ['B', 'E'].forEach(c => {
        const cell = prodSheet.getCell(`${c}${rNum}`);
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
        cell.border = thinBorder;
      });
      prodSheet.getRow(rNum).height = 20;
    });

    // Orders Section for this Product
    const oSecRow = 11;
    prodSheet.mergeCells(`A${oSecRow}:G${oSecRow}`);
    const oSecHeader = prodSheet.getCell(`A${oSecRow}`);
    oSecHeader.value = '2. ORDER DISPATCH & SALES BREAKDOWN FOR THIS PERIOD';
    oSecHeader.font = headerFont;
    oSecHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    oSecHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    prodSheet.getRow(oSecRow).height = 24;

    const ordHeaders = ['Order No', 'PO Date', 'Customer Name', 'Company Name', 'Quantity (Units)', 'Order Status', 'Delivery Date'];
    const ordHRow = prodSheet.getRow(oSecRow + 1);
    ordHRow.values = ordHeaders;
    ordHRow.height = 24;
    ordHRow.eachCell(c => {
      c.fill = headerFill;
      c.font = headerFont;
      c.border = thinBorder;
      c.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    let oIdx = oSecRow + 2;
    let prodTotalUnits = 0;

    orders.forEach((ord, index) => {
      const cust = ord.customerId || {};
      const orderNo = ord.orderNo || `ORD-${ord._id.toString().slice(-6).toUpperCase()}`;
      const poDateStr = ord.orderDate ? new Date(ord.orderDate).toLocaleDateString('en-IN') : 'N/A';
      const delDateStr = ord.deliveryDate ? new Date(ord.deliveryDate).toLocaleDateString('en-IN') : 'Pending';

      // Find matching line items
      const matchingItems = (ord.lineItems || []).filter(li => {
        return (li.productId?._id?.toString() === productId) || (li.name === product.name);
      });

      const qtyForOrder = matchingItems.reduce((sum, i) => sum + (i.qty || 0), 0);
      prodTotalUnits += qtyForOrder;

      const row = prodSheet.getRow(oIdx);
      row.values = [
        orderNo,
        poDateStr,
        cust.name || 'N/A',
        cust.company || '—',
        qtyForOrder,
        (ord.status || 'confirmed').toUpperCase(),
        delDateStr
      ];
      row.height = 20;

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: colNum === 5 ? 'right' : 'left' };
        if (index % 2 === 1) cell.fill = zebraFill;
      });
      oIdx++;
    });

    // Total Row
    const totRow = prodSheet.getRow(oIdx);
    totRow.values = ['TOTAL VOLUME ORDERED', '', '', `${orders.length} Orders`, prodTotalUnits, '', ''];
    prodSheet.mergeCells(`A${oIdx}:C${oIdx}`);
    totRow.height = 24;
    totRow.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = thinBorder;
    });

    prodSheet.columns = [
      { key: 'A', width: 20 },
      { key: 'B', width: 16 },
      { key: 'C', width: 26 },
      { key: 'D', width: 26 },
      { key: 'E', width: 20 },
      { key: 'F', width: 18 },
      { key: 'G', width: 20 }
    ];

    const safeProdName = product.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Product_Report_${safeProdName}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting individual product excel report:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error generating product report' });
    }
  }
};

// ==========================================
// 13. EXPORT GENERIC CSV / EXCEL REPORT (BACKWARD COMPATIBLE)
// ==========================================
const exportReportCSV = async (req, res) => {
  try {
    const { type = 'orders', period = 'this_month' } = req.query;

    if (type === 'monthly') {
      return exportMonthlyReportExcel(req, res);
    }

    if (type === 'customers') {
      const headers = [
        { name: 'Customer Name', key: 'name', width: 25, align: 'left' },
        { name: 'Company', key: 'company', width: 22, align: 'left' },
        { name: 'Phone Number', key: 'phone', width: 16, align: 'left', isText: true },
        { name: 'Email Address', key: 'email', width: 26, align: 'left' },
        { name: 'City', key: 'city', width: 16, align: 'left' },
        { name: 'Reorder Prob (%)', key: 'probability', width: 18, align: 'center', isNum: true },
        { name: 'Expected Reorder', key: 'reorderDate', width: 18, align: 'center', isDate: true },
        { name: 'Registration Date', key: 'createdAt', width: 18, align: 'center', isDate: true }
      ];

      const customers = await Customer.find({ isDeleted: { $ne: true } }).sort({ name: 1 });
      const dataRows = customers.map(c => [
        c.name || 'Unnamed',
        c.company || '—',
        c.phone ? String(c.phone) : '—',
        c.email || '—',
        c.city || '—',
        c.reorderProbability !== undefined ? c.reorderProbability : 50,
        c.expectedReorderDate ? new Date(c.expectedReorderDate) : '—',
        c.createdAt ? new Date(c.createdAt) : new Date()
      ]);

      return await generateExcelReport(res, {
        title: 'JS LABELS — CUSTOMER DIRECTORY REPORT',
        sheetName: 'Customers Directory',
        headers,
        dataRows,
        period,
        filenamePrefix: 'customers'
      });
    }

    // Default: Orders export with product dimensions
    const { filter, periodLabel } = buildOrderFilter(req.query);
    const orders = await Order.find(filter)
      .populate('customerId', 'name company city')
      .populate('salesExecutive', 'name')
      .populate('lineItems.productId', 'name dimensionKey widthMm heightMm unit')
      .sort({ orderDate: -1 });

    const headers = [
      { name: 'Order No', key: 'orderNo', width: 18, align: 'left' },
      { name: 'PO Date', key: 'orderDate', width: 16, align: 'center', isDate: true },
      { name: 'Customer Name', key: 'customerName', width: 24, align: 'left' },
      { name: 'Company', key: 'company', width: 22, align: 'left' },
      { name: 'Total Units', key: 'units', width: 16, align: 'right', isNum: true },
      { name: 'Products & Dimensions', key: 'dimensions', width: 36, align: 'left' },
      { name: 'Order Total (₹)', key: 'amount', width: 18, align: 'right', isCurrency: true },
      { name: 'Order Status', key: 'status', width: 16, align: 'center', isBadge: true },
      { name: 'Sales Executive', key: 'executive', width: 20, align: 'left' }
    ];

    const dataRows = orders.map(o => {
      const units = (o.lineItems || []).reduce((s, i) => s + (i.qty || 0), 0);
      const dimsSummary = (o.lineItems || []).map(li => {
        const p = li.productId || {};
        const d = p.widthMm && p.heightMm ? `${p.widthMm}x${p.heightMm} ${p.unit || 'MM'}` : (li.dimensionKey || 'N/A');
        return `${li.name || 'Label'} (${d} x${li.qty})`;
      }).join('; ') || 'No line items';

      return [
        o.orderNo || `ORD-${o._id.toString().slice(-6)}`,
        o.orderDate ? new Date(o.orderDate) : new Date(o.createdAt),
        o.customerId?.name || 'Customer Account',
        o.customerId?.company || '—',
        units,
        dimsSummary,
        o.amount != null ? Number(o.amount) : 'Not tracked',
        o.status || 'confirmed',
        o.salesExecutive?.name || 'Executive'
      ];
    });

    return await generateExcelReport(res, {
      title: 'JS LABELS — EXECUTIVE ORDERS REPORT',
      sheetName: 'Orders Summary',
      headers,
      dataRows,
      period: periodLabel,
      isOrdersSummary: true,
      filenamePrefix: 'orders'
    });
  } catch (error) {
    console.error('Error exporting Excel report:', error);
    return res.status(500).json({ message: 'Server error exporting Excel report' });
  }
};

module.exports = {
  getAvailableMonths,
  getReportsOverview,
  getRevenueTrend,
  getTopProducts,
  getOrdersByStatus,
  getTopCustomersReport,
  getExecutivePerformance,
  getCustomerReportSummary,
  getProductReportSummary,
  exportMonthlyReportExcel,
  exportIndividualCustomerReportExcel,
  exportIndividualProductReportExcel,
  exportReportCSV
};
