const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { calculateCustomerReorderProbability } = require('../utils/reorderCalculator');
const ExcelJS = require('exceljs');

// Helper to construct query filters for Orders (status, month, year, from, to, search)
const buildOrderQueryFilter = async (query, scopeFilter = {}) => {
  const { status, month, year, from, to, search } = query;
  let filter = { ...scopeFilter };

  if (status && status !== 'all') {
    filter.status = status;
  }

  // Determine date boundary
  let startDate = null;
  let endDate = null;

  if (month && month !== 'all' && month.includes('-')) {
    const [yStr, mStr] = month.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (!isNaN(y) && !isNaN(m)) {
      startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    }
  } else if (year && year !== 'all') {
    const y = parseInt(year, 10);
    if (!isNaN(y)) {
      startDate = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    }
  }

  // Explicit from/to overrides
  if (from) {
    const dFrom = new Date(from);
    if (!isNaN(dFrom.getTime())) {
      startDate = new Date(Date.UTC(dFrom.getUTCFullYear(), dFrom.getUTCMonth(), dFrom.getUTCDate(), 0, 0, 0, 0));
    }
  }
  if (to) {
    const dTo = new Date(to);
    if (!isNaN(dTo.getTime())) {
      endDate = new Date(Date.UTC(dTo.getUTCFullYear(), dTo.getUTCMonth(), dTo.getUTCDate(), 23, 59, 59, 999));
    }
  }

  const andClauses = [];

  if (startDate || endDate) {
    const dateRange = {};
    if (startDate) dateRange.$gte = startDate;
    if (endDate) dateRange.$lte = endDate;

    andClauses.push({
      $or: [
        { orderDate: dateRange },
        { poDate: dateRange },
        { orderDate: { $exists: false }, createdAt: dateRange }
      ]
    });
  }

  if (search && search.trim()) {
    const s = search.trim();
    const regex = new RegExp(s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');

    const matchingCustomers = await Customer.find({
      $or: [
        { name: regex },
        { company: regex },
        { phone: regex },
        { email: regex },
        { city: regex }
      ]
    }).select('_id');
    const custIds = matchingCustomers.map(c => c._id);

    andClauses.push({
      $or: [
        { orderNo: regex },
        { poNumber: regex },
        { notes: regex },
        { 'lineItems.name': regex },
        { 'lineItems.dimensionKey': regex },
        { customerId: { $in: custIds } }
      ]
    });
  }

  if (andClauses.length > 0) {
    if (filter.$and) {
      filter.$and = filter.$and.concat(andClauses);
    } else {
      filter.$and = andClauses;
    }
  }

  return { filter, startDate, endDate };
};

// GET /api/orders/available-months
const getAvailableOrderMonths = async (req, res) => {
  try {
    const scopeFilter = req.scopeFilter || {};

    const monthsAgg = await Order.aggregate([
      { $match: scopeFilter },
      {
        $project: {
          effectiveDate: { $ifNull: ['$orderDate', '$createdAt'] },
          amount: 1,
          status: 1
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$effectiveDate' } },
          count: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$amount', 0] } }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    const months = monthsAgg
      .filter(m => m._id && m._id !== 'null')
      .map(m => {
        const [y, mm] = m._id.split('-');
        const d = new Date(parseInt(y, 10), parseInt(mm, 10) - 1, 1);
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return {
          key: m._id,
          label,
          year: parseInt(y, 10),
          month: parseInt(mm, 10),
          orderCount: m.count,
          totalAmount: m.totalAmount
        };
      });

    const yearSet = new Set(months.map(m => m.year));
    const currentYear = new Date().getFullYear();
    yearSet.add(currentYear);
    const years = Array.from(yearSet).sort((a, b) => b - a);

    return res.json({ months, years });
  } catch (error) {
    console.error('Error fetching available order months:', error);
    return res.status(500).json({ message: 'Server error fetching available order months' });
  }
};

// GET /api/orders
const getOrders = async (req, res) => {
  try {
    const { status, month, year, from, to, search, page = 1, limit = 1000 } = req.query;

    const { filter: queryFilter } = await buildOrderQueryFilter(
      { status, month, year, from, to, search },
      req.scopeFilter
    );

    // Also build a date-scoped filter without status so summary reflects current date range
    const { filter: dateScopedFilter } = await buildOrderQueryFilter(
      { month, year, from, to, search },
      req.scopeFilter
    );

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [orders, total, allOrdersForSummary] = await Promise.all([
      Order.find(queryFilter)
        .populate('customerId', 'name company phone email city address deliveryAddress')
        .populate('salesExecutive', 'name email avatarUrl role')
        .populate('lineItems.productId', 'name jobName widthMm heightMm dimensionKey category material colour unitPrice unit')
        .sort({ orderDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
      Order.countDocuments(queryFilter),
      Order.find(dateScopedFilter)
    ]);

    const summary = {
      totalOrders: allOrdersForSummary.length,
      statusCounts: {
        pending: 0,
        confirmed: 0,
        production: 0,
        quality_check: 0,
        dispatched: 0,
        delivered: 0,
        cancelled: 0,
        lost: 0
      },
      totalRevenue: 0
    };

    allOrdersForSummary.forEach((o) => {
      if (summary.statusCounts[o.status] !== undefined) {
        summary.statusCounts[o.status] += 1;
      }
      if (o.status !== 'cancelled' && o.status !== 'lost' && o.amount != null && !isNaN(o.amount)) {
        summary.totalRevenue += o.amount;
      }
    });

    return res.json({
      orders,
      total,
      summary,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10)) || 1
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({ message: 'Server error fetching orders' });
  }
};

// GET /api/orders/summary
const getOrdersSummary = async (req, res) => {
  try {
    const { from, to } = req.query;

    let queryFilter = { ...req.scopeFilter };

    if (from || to) {
      queryFilter.orderDate = {};
      if (from) queryFilter.orderDate.$gte = new Date(from);
      if (to) queryFilter.orderDate.$lte = new Date(to);
    }

    const orders = await Order.find(queryFilter);

    const summary = {
      totalOrders: orders.length,
      pending: 0,
      confirmed: 0,
      production: 0,
      quality_check: 0,
      dispatched: 0,
      delivered: 0,
      cancelled: 0,
      lost: 0,
      totalRevenue: 0
    };

    orders.forEach((o) => {
      if (summary[o.status] !== undefined) {
        summary[o.status] += 1;
      }
      if (o.status !== 'cancelled' && o.amount != null && !isNaN(o.amount)) {
        summary.totalRevenue += o.amount;
      }
    });

    return res.json(summary);
  } catch (error) {
    console.error('Error computing order summary:', error);
    return res.status(500).json({ message: 'Server error computing order summary' });
  }
};

// POST /api/orders
const createOrder = async (req, res) => {
  try {
    let {
      customerId,
      newCustomer,
      lineItems,
      deliveryDate,
      expectedReorderDate,
      isExpectedReorderDateOverridden,
      usageCycleDays,
      leadId,
      poNumber,
      advanceReceived,
      advanceAmount,
      deliveryAddress,
      notes
    } = req.body;

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ message: 'At least one line item is required' });
    }

    if (!expectedReorderDate || isNaN(new Date(expectedReorderDate).getTime())) {
      return res.status(400).json({ message: 'Expected Reorder Date is required and must be a valid date' });
    }

    const parsedExpectedReorderDate = new Date(expectedReorderDate);
    const execId = req.user?.id || req.user?._id || undefined;

    // 1. If customerId is not provided, create Customer inline
    if (!customerId) {
      if (!newCustomer || !newCustomer.name || !newCustomer.phone) {
        return res.status(400).json({ message: 'Customer selection or new customer details are required' });
      }

      const cleanPhone = (newCustomer.phone || '').toString().replace(/\D/g, '').slice(0, 10);
      if (cleanPhone.length !== 10) {
        return res.status(400).json({ message: 'Customer phone number must be 10 digits' });
      }

      const createdCustomer = await Customer.create({
        name: newCustomer.name.trim(),
        company: newCustomer.company ? newCustomer.company.trim() : undefined,
        phone: cleanPhone,
        email: newCustomer.email ? newCustomer.email.trim().toLowerCase() : undefined,
        city: newCustomer.city || undefined,
        address: deliveryAddress || newCustomer.address,
        gstNo: newCustomer.gstNo ? newCustomer.gstNo.trim() : undefined,
        leadId: leadId || newCustomer.leadId,
        salesExecutive: execId,
        expectedReorderDate: parsedExpectedReorderDate
      });

      customerId = createdCustomer._id;
    }

    // 2. Validate and process line items from Product catalog
    let allPriced = true;
    let computedAmount = 0;
    const processedLineItems = [];

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (!item.productId) {
        return res.status(400).json({ message: `Item #${i + 1}: Product selection is required` });
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ message: `Item #${i + 1}: Referenced product not found` });
      }

      const qty = parseInt(item.qty, 10);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ message: `Item #${i + 1}: Quantity must be a positive number` });
      }

      // Copy dimensionKey and name directly from Product
      const unit = (product.unit || 'MM').toUpperCase();
      const dimensionKey = product.dimensionKey || (product.widthMm && product.heightMm ? (unit === 'MTR' ? `${product.widthMm}x${product.heightMm} MTR` : `${product.widthMm}x${product.heightMm}`) : 'N/A');
      const name = product.name;

      let price = null;
      let lineTotal = null;

      if (item.price !== undefined && item.price !== null && item.price !== '') {
        const parsedPrice = parseFloat(item.price);
        if (!isNaN(parsedPrice) && parsedPrice >= 0) {
          price = parsedPrice;
          lineTotal = qty * price;
          computedAmount += lineTotal;
        } else {
          allPriced = false;
        }
      } else {
        allPriced = false;
      }

      processedLineItems.push({
        productId: product._id,
        dimensionKey,
        name,
        qty,
        price,
        lineTotal
      });
    }

    // Amount is only computed/stored if all line items have pricing set
    const finalOrderAmount = allPriced ? computedAmount : null;

    // 3. Auto-generate Order Number
    const orderNo = `ORD-${Date.now().toString().slice(-6)}`;

    // 4. Create Order
    const newOrder = await Order.create({
      orderNo,
      customerId,
      orderDate: new Date(),
      amount: finalOrderAmount,
      status: 'confirmed',
      deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
      expectedReorderDate: parsedExpectedReorderDate,
      isExpectedReorderDateOverridden: Boolean(isExpectedReorderDateOverridden),
      salesExecutive: execId,
      usageCycleDays: parseInt(usageCycleDays, 10) || 30,
      poNumber: poNumber ? poNumber.trim() : undefined,
      advanceReceived: Boolean(advanceReceived),
      advanceAmount: parseFloat(advanceAmount) || 0,
      deliveryAddress: deliveryAddress ? deliveryAddress.trim() : undefined,
      notes: notes ? notes.trim() : undefined,
      lineItems: processedLineItems
    });

    // 5. IMMEDIATELY update related Customer's expectedReorderDate & reorderProbability
    const customer = await Customer.findById(customerId);
    if (customer) {
      customer.expectedReorderDate = parsedExpectedReorderDate;
      customer.reorderProbability = await calculateCustomerReorderProbability(customer._id, parsedExpectedReorderDate);
      await customer.save();
    }

    // 6. Create Activity Entry for Customer
    if (execId) {
      const priceText = finalOrderAmount != null
        ? `for ₹${finalOrderAmount.toLocaleString('en-IN')}`
        : `(pricing not tracked)`;

      await Activity.create({
        relatedType: 'customer',
        relatedId: customerId,
        type: 'status_change',
        description: `Order ${orderNo} (${newOrder.status.toUpperCase()}) created ${priceText}`,
        createdBy: execId
      });
    }

    // 7. If converted from Lead, update Lead status to 'won'
    if (leadId) {
      const lead = await Lead.findById(leadId);
      if (lead) {
        lead.status = 'won';
        await lead.save();

        if (execId) {
          await Activity.create({
            relatedType: 'lead',
            relatedId: leadId,
            type: 'status_change',
            description: `Lead converted to Order ${orderNo}`,
            createdBy: execId
          });
        }
      }
    }

    const populatedOrder = await Order.findById(newOrder._id)
      .populate('customerId', 'name company phone email city')
      .populate('salesExecutive', 'name email avatarUrl role')
      .populate('lineItems.productId', 'name widthMm heightMm dimensionKey category unitPrice unit');

    return res.status(201).json(populatedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A record with this phone number or details already exists' });
    }
    return res.status(500).json({ message: error.message || 'Server error creating order' });
  }
};

// PATCH /api/orders/:id - Edit existing order details
const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      deliveryDate,
      expectedReorderDate,
      isExpectedReorderDateOverridden,
      usageCycleDays,
      poNumber,
      deliveryAddress,
      notes,
      lineItems
    } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (req.user.role === 'caller' && order.salesExecutive?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only update your own orders' });
    }

    if (deliveryDate !== undefined) order.deliveryDate = deliveryDate ? new Date(deliveryDate) : undefined;
    if (usageCycleDays !== undefined) order.usageCycleDays = parseInt(usageCycleDays, 10) || 30;
    if (poNumber !== undefined) order.poNumber = poNumber ? poNumber.trim() : undefined;
    if (deliveryAddress !== undefined) order.deliveryAddress = deliveryAddress ? deliveryAddress.trim() : undefined;
    if (notes !== undefined) order.notes = notes ? notes.trim() : undefined;

    // If lineItems are updated
    if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
      let allPriced = true;
      let computedAmount = 0;
      const processedLineItems = [];

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        if (!item.productId) {
          return res.status(400).json({ message: `Item #${i + 1}: Product selection is required` });
        }

        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Item #${i + 1}: Referenced product not found` });
        }

        const qty = parseInt(item.qty, 10);
        if (isNaN(qty) || qty <= 0) {
          return res.status(400).json({ message: `Item #${i + 1}: Quantity must be a positive number` });
        }

        const unit = (product.unit || 'MM').toUpperCase();
        const dimensionKey = product.dimensionKey || (product.widthMm && product.heightMm ? (unit === 'MTR' ? `${product.widthMm}x${product.heightMm} MTR` : `${product.widthMm}x${product.heightMm}`) : 'N/A');
        const name = product.name;

        let price = null;
        let lineTotal = null;

        if (item.price !== undefined && item.price !== null && item.price !== '') {
          const parsedPrice = parseFloat(item.price);
          if (!isNaN(parsedPrice) && parsedPrice >= 0) {
            price = parsedPrice;
            lineTotal = qty * price;
            computedAmount += lineTotal;
          } else {
            allPriced = false;
          }
        } else {
          allPriced = false;
        }

        processedLineItems.push({
          productId: product._id,
          dimensionKey,
          name,
          qty,
          price,
          lineTotal
        });
      }

      order.lineItems = processedLineItems;
      order.amount = allPriced ? computedAmount : null;
    }

    if (expectedReorderDate && !isNaN(new Date(expectedReorderDate).getTime())) {
      const parsedDate = new Date(expectedReorderDate);
      order.expectedReorderDate = parsedDate;
      if (isExpectedReorderDateOverridden !== undefined) {
        order.isExpectedReorderDateOverridden = Boolean(isExpectedReorderDateOverridden);
      }

      // Sync customer expectedReorderDate & probability
      const customer = await Customer.findById(order.customerId);
      if (customer) {
        customer.expectedReorderDate = parsedDate;
        customer.reorderProbability = await calculateCustomerReorderProbability(customer._id, parsedDate);
        await customer.save();
      }
    }

    await order.save();

    const updatedOrder = await Order.findById(order._id)
      .populate('customerId', 'name company phone email city')
      .populate('salesExecutive', 'name email avatarUrl role')
      .populate('lineItems.productId', 'name widthMm heightMm dimensionKey category unitPrice unit');

    return res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order:', error);
    return res.status(500).json({ message: 'Server error updating order' });
  }
};

// PATCH /api/orders/:id/status
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'production', 'quality_check', 'dispatched', 'delivered', 'cancelled', 'lost'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Ownership check for caller
    if (req.user.role === 'caller' && order.salesExecutive?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only update your own orders' });
    }

    const oldStatus = order.status;
    order.status = status;

    if (status === 'cancelled' || status === 'lost') {
      if (req.body.reason || req.body.lostReason) {
        order.lostReason = (req.body.reason || req.body.lostReason).trim();
      }
      order.lostAt = new Date();
      order.lostBy = req.user.id;
      if (req.body.notes) {
        order.lostNotes = req.body.notes.trim();
      }
    }

    if (oldStatus !== status) {
      // Delivered status handling
      if (status === 'delivered') {
        if (!order.deliveryDate) {
          order.deliveryDate = new Date();
        }

        const customer = await Customer.findById(order.customerId);

        if (order.isExpectedReorderDateOverridden) {
          // If manually overridden, do NOT recalculate automatically. Log activity note.
          if (customer) {
            await Activity.create({
              relatedType: 'customer',
              relatedId: customer._id,
              type: 'note',
              description: 'Delivery date differs from original plan — expected reorder date was manually set and was not recalculated',
              createdBy: req.user.id
            });
          }
        } else {
          // If NOT manually overridden, recalculate based on actual delivery date + usageCycleDays
          const cycleDays = order.usageCycleDays || 30;
          const recomputedReorderDate = new Date(order.deliveryDate.getTime() + (cycleDays * 24 * 60 * 60 * 1000));
          order.expectedReorderDate = recomputedReorderDate;

          if (customer) {
            customer.expectedReorderDate = recomputedReorderDate;
            customer.reorderProbability = await calculateCustomerReorderProbability(customer._id, recomputedReorderDate);
            await customer.save();
          }
        }
      }

      const activityDesc = status === 'delivered'
        ? `Order ${order.orderNo || ''} delivered.`
        : `Order ${order.orderNo || ''} status updated from ${oldStatus.toUpperCase()} to ${status.toUpperCase()}`;

      await Activity.create({
        relatedType: 'customer',
        relatedId: order.customerId,
        type: 'status_change',
        description: activityDesc,
        createdBy: req.user.id
      });
    }

    await order.save();

    const updatedOrder = await Order.findById(order._id)
      .populate('customerId', 'name company phone email city')
      .populate('salesExecutive', 'name email avatarUrl role')
      .populate('lineItems.productId', 'name widthMm heightMm dimensionKey category unitPrice unit');

    return res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order status:', error);
    return res.status(500).json({ message: 'Server error updating order status' });
  }
};

// DELETE /api/orders/:id
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await order.softDelete(req.user.id);

    await Activity.create({
      relatedType: 'customer',
      relatedId: order.customerId,
      type: 'status_change',
      description: `Order ${order.orderNo || ''} was deleted`,
      createdBy: req.user.id
    });

    return res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    return res.status(500).json({ message: 'Server error deleting order' });
  }
};

// GET /api/orders/export-all
const exportAllOrdersExcel = async (req, res) => {
  try {
    const { status, month, year, from, to, search } = req.query;

    const { filter: queryFilter, startDate, endDate } = await buildOrderQueryFilter(
      { status, month, year, from, to, search },
      req.scopeFilter
    );

    const orders = await Order.find(queryFilter)
      .populate('customerId', 'name company phone email city address deliveryAddress')
      .populate('salesExecutive', 'name email role')
      .populate('lineItems.productId', 'name jobName widthMm heightMm dimensionKey category material colour unitPrice unit')
      .sort({ orderDate: -1, createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JS Labels CRM';
    workbook.lastModifiedBy = req.user?.name || 'System User';
    workbook.created = new Date();
    workbook.modified = new Date();

    const brandRedFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    const darkHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    const totalsFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    const whiteHeaderFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    const totalsFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
    const totalsBorder = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };

    // Build human-readable filter description
    const filterParts = [];
    if (month && month !== 'all') {
      filterParts.push(`Month: ${month}`);
    } else if (year && year !== 'all') {
      filterParts.push(`Year: ${year}`);
    }
    if (from || to) {
      filterParts.push(`Date Range: ${from || 'Start'} to ${to || 'End'}`);
    }
    if (status && status !== 'all') {
      filterParts.push(`Status: ${status.replace('_', ' ').toUpperCase()}`);
    } else {
      filterParts.push('Status: All');
    }
    if (search && search.trim()) {
      filterParts.push(`Search: "${search.trim()}"`);
    }
    const filterDesc = filterParts.length > 0 ? filterParts.join('  |  ') : 'All Orders (No Filter)';
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // ================= SHEET 1: All Orders Master Register =================
    const ordersSheet = workbook.addWorksheet('Orders Register', {
      views: [{ showGridLines: true }]
    });

    // Title banner
    ordersSheet.mergeCells('A1:U1');
    const titleCell = ordersSheet.getCell('A1');
    titleCell.value = 'JS LABELS — ORDERS MASTER REGISTER';
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = brandRedFill;
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ordersSheet.getRow(1).height = 32;

    ordersSheet.mergeCells('A2:U2');
    const subCell = ordersSheet.getCell('A2');
    subCell.value = `Applied Filters: ${filterDesc}   •   Exported: ${nowStr}   •   Total Records: ${orders.length}   •   Exported By: ${req.user?.name || 'Admin'} (${req.user?.role || 'Staff'})`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
    subCell.fill = subHeaderFill;
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ordersSheet.getRow(2).height = 22;

    const colHeaders = [
      'Order No',
      'PO / Order Date',
      'Customer Name',
      'Company Name',
      'Contact Phone',
      'Email Address',
      'City',
      'Delivery Address',
      'Order Status',
      'Items Count',
      'Total Quantity (Units)',
      'Order Value (₹)',
      'Advance Paid (₹)',
      'Balance Due (₹)',
      'Payment Status',
      'Expected Delivery Date',
      'Expected Reorder Date',
      'Usage Cycle (Days)',
      'Sales Executive',
      'PO Number',
      'Order Notes'
    ];

    const hRow = ordersSheet.getRow(4);
    hRow.values = colHeaders;
    hRow.height = 26;
    hRow.eachCell((cell) => {
      cell.fill = darkHeaderFill;
      cell.font = whiteHeaderFont;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    let rowIdx = 5;
    let sumTotalQty = 0;
    let sumTotalAmount = 0;
    let sumTotalAdvance = 0;
    let sumTotalBalance = 0;

    orders.forEach((ord, index) => {
      const orderNo = ord.orderNo || `ORD-${ord._id.toString().slice(-6).toUpperCase()}`;
      const effectiveDate = ord.orderDate || ord.poDate || ord.createdAt;
      const poDateStr = effectiveDate ? new Date(effectiveDate).toLocaleDateString('en-IN') : 'N/A';
      const custName = ord.customerId?.name || 'N/A';
      const company = ord.customerId?.company || '-';
      const phone = ord.customerId?.phone || '-';
      const email = ord.customerId?.email || '-';
      const city = ord.customerId?.city || '-';
      const address = ord.deliveryAddress || ord.customerId?.deliveryAddress || ord.customerId?.address || '-';
      const statusStr = (ord.status || 'confirmed').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

      const itemsCount = (ord.lineItems || []).length;
      const totalUnits = (ord.lineItems || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      const totalAmount = ord.amount != null && !isNaN(ord.amount) ? Number(ord.amount) : 0;
      const advanceAmount = ord.advanceAmount != null && !isNaN(ord.advanceAmount) ? Number(ord.advanceAmount) : (ord.advanceReceived ? totalAmount : 0);
      const balanceDue = Math.max(0, totalAmount - advanceAmount);

      sumTotalQty += totalUnits;
      sumTotalAmount += totalAmount;
      sumTotalAdvance += advanceAmount;
      sumTotalBalance += balanceDue;

      let paymentStatus = 'Unpaid';
      if (totalAmount > 0 && advanceAmount >= totalAmount) {
        paymentStatus = 'Fully Paid';
      } else if (advanceAmount > 0) {
        paymentStatus = 'Partially Paid';
      } else if (ord.advanceReceived) {
        paymentStatus = 'Advance Received';
      }

      const deliveryDateStr = ord.deliveryDate ? new Date(ord.deliveryDate).toLocaleDateString('en-IN') : 'Pending';
      const reorderDateStr = ord.expectedReorderDate ? new Date(ord.expectedReorderDate).toLocaleDateString('en-IN') : '-';
      const usageCycle = ord.usageCycleDays ? `${ord.usageCycleDays} days` : '-';
      const exec = ord.salesExecutive?.name || 'Unassigned';
      const poNumber = ord.poNumber || '-';
      const notes = ord.notes || '-';

      const row = ordersSheet.getRow(rowIdx);
      row.values = [
        orderNo,
        poDateStr,
        custName,
        company,
        phone,
        email,
        city,
        address,
        statusStr,
        itemsCount,
        totalUnits,
        totalAmount,
        advanceAmount,
        balanceDue,
        paymentStatus,
        deliveryDateStr,
        reorderDateStr,
        usageCycle,
        exec,
        poNumber,
        notes
      ];
      row.height = 22;

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = thinBorder;
        if (index % 2 === 1) cell.fill = zebraFill;

        // Number / currency formats
        if (colNum === 10 || colNum === 11) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0';
        } else if (colNum === 12 || colNum === 13 || colNum === 14) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '₹#,##0.00';
        } else if ([1, 2, 9, 15, 16, 17, 18, 19].includes(colNum)) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });

      rowIdx++;
    });

    // Summary / Totals Row for Sheet 1
    const totRow = ordersSheet.getRow(rowIdx);
    totRow.values = [
      'TOTALS (Filtered Orders)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      sumTotalQty,
      sumTotalAmount,
      sumTotalAdvance,
      sumTotalBalance,
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ];
    totRow.height = 25;
    totRow.eachCell((cell, colNum) => {
      cell.fill = totalsFill;
      cell.font = totalsFont;
      cell.border = totalsBorder;
      if (colNum === 11) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
      } else if (colNum === 12 || colNum === 13 || colNum === 14) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '₹#,##0.00';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' };
      }
    });
    ordersSheet.mergeCells(`A${rowIdx}:J${rowIdx}`);

    ordersSheet.columns = [
      { key: 'A', width: 18 }, // Order No
      { key: 'B', width: 15 }, // PO Date
      { key: 'C', width: 24 }, // Customer Name
      { key: 'D', width: 26 }, // Company Name
      { key: 'E', width: 16 }, // Phone
      { key: 'F', width: 24 }, // Email
      { key: 'G', width: 16 }, // City
      { key: 'H', width: 30 }, // Delivery Address
      { key: 'I', width: 16 }, // Status
      { key: 'J', width: 12 }, // Items Count
      { key: 'K', width: 22 }, // Total Units
      { key: 'L', width: 18 }, // Order Value
      { key: 'M', width: 16 }, // Advance Paid
      { key: 'N', width: 16 }, // Balance Due
      { key: 'O', width: 16 }, // Payment Status
      { key: 'P', width: 18 }, // Expected Delivery
      { key: 'Q', width: 18 }, // Expected Reorder
      { key: 'R', width: 16 }, // Usage Cycle
      { key: 'S', width: 20 }, // Sales Executive
      { key: 'T', width: 18 }, // PO Number
      { key: 'U', width: 32 }  // Order Notes
    ];

    // ================= SHEET 2: Ordered Items Breakdown =================
    const itemsSheet = workbook.addWorksheet('Ordered Items Breakdown', {
      views: [{ showGridLines: true }]
    });

    itemsSheet.mergeCells('A1:R1');
    const itemTitleCell = itemsSheet.getCell('A1');
    itemTitleCell.value = 'JS LABELS — ORDERED PRODUCTS & LINE ITEMS BREAKDOWN';
    itemTitleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    itemTitleCell.fill = brandRedFill;
    itemTitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    itemsSheet.getRow(1).height = 32;

    itemsSheet.mergeCells('A2:R2');
    const itemSubCell = itemsSheet.getCell('A2');
    itemSubCell.value = `Applied Filters: ${filterDesc}   •   Exported: ${nowStr}   •   Exported By: ${req.user?.name || 'Admin'}`;
    itemSubCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
    itemSubCell.fill = subHeaderFill;
    itemSubCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    itemsSheet.getRow(2).height = 22;

    const itemHeaders = [
      'Order No',
      'PO Date',
      'Customer Name',
      'Company Name',
      'Item #',
      'Product Friendly Name',
      'Label Name',
      'Dimension Key',
      'Dimensions (WxH mm)',
      'Size Unit',
      'Industry / Category',
      'Material',
      'Colour',
      'Quantity (Units)',
      'Unit Price (₹)',
      'Line Total (₹)',
      'Order Status',
      'Expected Delivery'
    ];

    const itemHRow = itemsSheet.getRow(4);
    itemHRow.values = itemHeaders;
    itemHRow.height = 26;
    itemHRow.eachCell((cell) => {
      cell.fill = darkHeaderFill;
      cell.font = whiteHeaderFont;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    let itemRowIdx = 5;
    let sumItemQty = 0;
    let sumItemTotal = 0;

    orders.forEach((ord) => {
      const orderNo = ord.orderNo || `ORD-${ord._id.toString().slice(-6).toUpperCase()}`;
      const effectiveDate = ord.orderDate || ord.poDate || ord.createdAt;
      const poDateStr = effectiveDate ? new Date(effectiveDate).toLocaleDateString('en-IN') : 'N/A';
      const custName = ord.customerId?.name || 'N/A';
      const company = ord.customerId?.company || '-';
      const statusStr = (ord.status || 'confirmed').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      const deliveryDateStr = ord.deliveryDate ? new Date(ord.deliveryDate).toLocaleDateString('en-IN') : 'Pending';

      (ord.lineItems || []).forEach((li, liIdx) => {
        const p = li.productId || {};
        const prodFriendlyName = li.name || p.name || 'Custom Label';
        const labelName = p.jobName || p.labelName || li.description || '-';
        const dimKey = li.dimensionKey || p.dimensionKey || '-';
        const unitStr = (p.unit || 'MM').toUpperCase();
        const dims = (p.widthMm && p.heightMm) ? `${p.widthMm} × ${p.heightMm} mm` : (li.dimensionKey || '-');
        const category = p.category || 'General';
        const material = p.material || '-';
        const colour = p.colour || '-';
        const qty = Number(li.qty) || 0;
        const unitPrice = li.price != null && !isNaN(li.price) ? Number(li.price) : (p.unitPrice != null && !isNaN(p.unitPrice) ? Number(p.unitPrice) : 0);
        const lineTotal = li.lineTotal != null && !isNaN(li.lineTotal) ? Number(li.lineTotal) : (qty * unitPrice);

        sumItemQty += qty;
        sumItemTotal += lineTotal;

        const row = itemsSheet.getRow(itemRowIdx);
        row.values = [
          orderNo,
          poDateStr,
          custName,
          company,
          liIdx + 1,
          prodFriendlyName,
          labelName,
          dimKey,
          dims,
          unitStr,
          category,
          material,
          colour,
          qty,
          unitPrice,
          lineTotal,
          statusStr,
          deliveryDateStr
        ];
        row.height = 20;

        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = thinBorder;
          if (itemRowIdx % 2 === 1) cell.fill = zebraFill;

          if (colNum === 14) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            cell.numFmt = '#,##0';
          } else if (colNum === 15 || colNum === 16) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            cell.numFmt = '₹#,##0.00';
          } else if ([1, 2, 5, 8, 9, 10, 17, 18].includes(colNum)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          }
        });

        itemRowIdx++;
      });
    });

    // Summary Totals Row for Sheet 2
    const itemTotRow = itemsSheet.getRow(itemRowIdx);
    itemTotRow.values = [
      'TOTALS (Filtered Items)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      sumItemQty,
      '',
      sumItemTotal,
      '',
      ''
    ];
    itemTotRow.height = 25;
    itemTotRow.eachCell((cell, colNum) => {
      cell.fill = totalsFill;
      cell.font = totalsFont;
      cell.border = totalsBorder;
      if (colNum === 14) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
      } else if (colNum === 16) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '₹#,##0.00';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' };
      }
    });
    itemsSheet.mergeCells(`A${itemRowIdx}:M${itemRowIdx}`);

    itemsSheet.columns = [
      { key: 'A', width: 18 }, // Order No
      { key: 'B', width: 14 }, // PO Date
      { key: 'C', width: 24 }, // Customer Name
      { key: 'D', width: 26 }, // Company Name
      { key: 'E', width: 10 }, // Item #
      { key: 'F', width: 28 }, // Product Friendly Name
      { key: 'G', width: 24 }, // Label Name
      { key: 'H', width: 18 }, // Dimension Key
      { key: 'I', width: 20 }, // Dimensions mm
      { key: 'J', width: 12 }, // Size Unit
      { key: 'K', width: 18 }, // Category / Industry
      { key: 'L', width: 18 }, // Material
      { key: 'M', width: 16 }, // Colour
      { key: 'N', width: 18 }, // Quantity
      { key: 'O', width: 15 }, // Unit Price
      { key: 'P', width: 18 }, // Line Total
      { key: 'Q', width: 16 }, // Status
      { key: 'R', width: 18 }  // Expected Delivery
    ];

    // ================= SHEET 3: Customer & Payment Summary =================
    const customerSummarySheet = workbook.addWorksheet('Customer & Payment Summary', {
      views: [{ showGridLines: true }]
    });

    customerSummarySheet.mergeCells('A1:K1');
    const custTitleCell = customerSummarySheet.getCell('A1');
    custTitleCell.value = 'JS LABELS — CUSTOMER ORDERS & REVENUE SUMMARY';
    custTitleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    custTitleCell.fill = brandRedFill;
    custTitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    customerSummarySheet.getRow(1).height = 32;

    customerSummarySheet.mergeCells('A2:K2');
    const custSubCell = customerSummarySheet.getCell('A2');
    custSubCell.value = `Applied Filters: ${filterDesc}   •   Exported: ${nowStr}   •   Exported By: ${req.user?.name || 'Admin'}`;
    custSubCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
    custSubCell.fill = subHeaderFill;
    custSubCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    customerSummarySheet.getRow(2).height = 22;

    const custHeaders = [
      'Customer Name',
      'Company Name',
      'Contact Phone',
      'Email Address',
      'City',
      'Total Orders Placed',
      'Total Labels Ordered',
      'Total Order Value (₹)',
      'Total Advance Paid (₹)',
      'Total Outstanding (₹)',
      'Payment Status'
    ];

    const custHRow = customerSummarySheet.getRow(4);
    custHRow.values = custHeaders;
    custHRow.height = 26;
    custHRow.eachCell((cell) => {
      cell.fill = darkHeaderFill;
      cell.font = whiteHeaderFont;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Group orders by Customer
    const customerMap = new Map();
    orders.forEach((ord) => {
      const cId = ord.customerId?._id?.toString() || 'anonymous';
      if (!customerMap.has(cId)) {
        customerMap.set(cId, {
          name: ord.customerId?.name || 'N/A',
          company: ord.customerId?.company || '-',
          phone: ord.customerId?.phone || '-',
          email: ord.customerId?.email || '-',
          city: ord.customerId?.city || '-',
          ordersCount: 0,
          totalQty: 0,
          totalValue: 0,
          totalAdvance: 0,
          totalBalance: 0
        });
      }
      const entry = customerMap.get(cId);
      entry.ordersCount += 1;
      const orderUnits = (ord.lineItems || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      const orderAmount = ord.amount != null && !isNaN(ord.amount) ? Number(ord.amount) : 0;
      const orderAdvance = ord.advanceAmount != null && !isNaN(ord.advanceAmount) ? Number(ord.advanceAmount) : (ord.advanceReceived ? orderAmount : 0);
      const orderBalance = Math.max(0, orderAmount - orderAdvance);

      entry.totalQty += orderUnits;
      entry.totalValue += orderAmount;
      entry.totalAdvance += orderAdvance;
      entry.totalBalance += orderBalance;
    });

    let custRowIdx = 5;
    let sumCustOrders = 0;
    let sumCustQty = 0;
    let sumCustValue = 0;
    let sumCustAdvance = 0;
    let sumCustBalance = 0;

    Array.from(customerMap.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .forEach((cust, index) => {
        sumCustOrders += cust.ordersCount;
        sumCustQty += cust.totalQty;
        sumCustValue += cust.totalValue;
        sumCustAdvance += cust.totalAdvance;
        sumCustBalance += cust.totalBalance;

        let payStatus = 'Fully Paid';
        if (cust.totalBalance > 0 && cust.totalAdvance > 0) {
          payStatus = 'Partially Paid';
        } else if (cust.totalBalance > 0 && cust.totalAdvance === 0) {
          payStatus = 'Unpaid';
        }

        const row = customerSummarySheet.getRow(custRowIdx);
        row.values = [
          cust.name,
          cust.company,
          cust.phone,
          cust.email,
          cust.city,
          cust.ordersCount,
          cust.totalQty,
          cust.totalValue,
          cust.totalAdvance,
          cust.totalBalance,
          payStatus
        ];
        row.height = 20;

        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = thinBorder;
          if (index % 2 === 1) cell.fill = zebraFill;

          if (colNum === 6 || colNum === 7) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            cell.numFmt = '#,##0';
          } else if (colNum === 8 || colNum === 9 || colNum === 10) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            cell.numFmt = '₹#,##0.00';
          } else if (colNum === 11) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          }
        });

        custRowIdx++;
      });

    // Summary Totals Row for Sheet 3
    const custTotRow = customerSummarySheet.getRow(custRowIdx);
    custTotRow.values = [
      'TOTALS (Filtered Customers)',
      '',
      '',
      '',
      '',
      sumCustOrders,
      sumCustQty,
      sumCustValue,
      sumCustAdvance,
      sumCustBalance,
      ''
    ];
    custTotRow.height = 25;
    custTotRow.eachCell((cell, colNum) => {
      cell.fill = totalsFill;
      cell.font = totalsFont;
      cell.border = totalsBorder;
      if (colNum === 6 || colNum === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
      } else if (colNum === 8 || colNum === 9 || colNum === 10) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '₹#,##0.00';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' };
      }
    });
    customerSummarySheet.mergeCells(`A${custRowIdx}:E${custRowIdx}`);

    customerSummarySheet.columns = [
      { key: 'A', width: 24 }, // Customer Name
      { key: 'B', width: 26 }, // Company Name
      { key: 'C', width: 16 }, // Contact Phone
      { key: 'D', width: 24 }, // Email Address
      { key: 'E', width: 16 }, // City
      { key: 'F', width: 18 }, // Total Orders
      { key: 'G', width: 22 }, // Total Labels
      { key: 'H', width: 20 }, // Total Order Value
      { key: 'I', width: 20 }, // Total Advance
      { key: 'J', width: 20 }, // Total Balance
      { key: 'K', width: 16 }  // Payment Status
    ];

    let filterSlug = '';
    if (month && month !== 'all') filterSlug = `_${month}`;
    else if (year && year !== 'all') filterSlug = `_${year}`;
    else if (from || to) filterSlug = `_${from || 'start'}_to_${to || 'end'}`;

    const todayIso = new Date().toISOString().split('T')[0];
    const filename = `JS_Labels_Orders_Report${filterSlug}_${todayIso}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting all orders to excel:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error generating orders excel export' });
    }
  }
};

// GET /api/orders/:id/export-excel
const exportSingleOrderExcel = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).setOptions({ includeDeleted: true })
      .populate('customerId')
      .populate('salesExecutive', 'name email phone avatarUrl role')
      .populate('lineItems.productId');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Ownership check for caller
    if (req.user.role === 'caller' && order.salesExecutive?._id?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only export orders assigned to you' });
    }

    const formattedOrderNo = order.orderNo || `ORD-${order._id.toString().slice(-6).toUpperCase()}`;
    const cust = order.customerId || {};
    const exec = order.salesExecutive || {};

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JS Labels CRM';
    workbook.lastModifiedBy = req.user.name || 'System User';
    workbook.created = new Date();
    workbook.modified = new Date();

    const orderSheet = workbook.addWorksheet('Order Dossier', {
      views: [{ showGridLines: true }]
    });

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    const headerFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    const sectionFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    const labelFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    const labelFont = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
    const dataFont = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };

    // Row 1: Header Banner
    orderSheet.mergeCells('A1:F1');
    const titleCell = orderSheet.getCell('A1');
    titleCell.value = `JS LABELS — ORDER DOSSIER: ${formattedOrderNo}`;
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    orderSheet.getRow(1).height = 32;

    // Row 2: Subtitle
    orderSheet.mergeCells('A2:F2');
    const subCell = orderSheet.getCell('A2');
    subCell.value = `Generated: ${new Date().toLocaleString('en-IN')}  |  Sales Executive: ${exec.name || 'Unassigned'}  |  Status: ${(order.status || 'confirmed').toUpperCase()}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    orderSheet.getRow(2).height = 20;

    // Section 1: Customer Details
    orderSheet.mergeCells('A4:F4');
    const sec1 = orderSheet.getCell('A4');
    sec1.value = '1. CUSTOMER & ACCOUNT INFORMATION';
    sec1.font = sectionFont;
    sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    sec1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    orderSheet.getRow(4).height = 24;

    const custRows = [
      ['Customer Name', cust.name || 'N/A', '', 'Company Name', cust.company || 'N/A', ''],
      ['Phone', cust.phone || 'N/A', '', 'Email', cust.email || 'N/A', ''],
      ['City', cust.city || 'N/A', '', 'Delivery Address', order.deliveryAddress || cust.deliveryAddress || cust.address || 'N/A', '']
    ];

    custRows.forEach((rVals, idx) => {
      const rNum = 5 + idx;
      orderSheet.getRow(rNum).values = [rVals[0], rVals[1], '', rVals[3], rVals[4], ''];
      orderSheet.mergeCells(`B${rNum}:C${rNum}`);
      orderSheet.mergeCells(`E${rNum}:F${rNum}`);

      ['A', 'D'].forEach(c => {
        const cell = orderSheet.getCell(`${c}${rNum}`);
        cell.fill = labelFill;
        cell.font = labelFont;
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      });
      ['B', 'E'].forEach(c => {
        const cell = orderSheet.getCell(`${c}${rNum}`);
        cell.font = dataFont;
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      });
      orderSheet.getRow(rNum).height = 20;
    });

    // Section 2: Order Information & Dates
    orderSheet.mergeCells('A9:F9');
    const sec2 = orderSheet.getCell('A9');
    sec2.value = '2. ORDER LOGISTICS & DATES';
    sec2.font = sectionFont;
    sec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    sec2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    orderSheet.getRow(9).height = 24;

    const poDateStr = order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-IN') : 'N/A';
    const deliveryDateStr = order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-IN') : 'Pending';
    const expectedReorderStr = order.expectedReorderDate ? new Date(order.expectedReorderDate).toLocaleDateString('en-IN') : 'N/A';
    const statusFormatted = (order.status || 'confirmed').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

    const orderRows = [
      ['Order Number', formattedOrderNo, '', 'PO Date', poDateStr, ''],
      ['Order Status', statusFormatted, '', 'Expected Delivery', deliveryDateStr, ''],
      ['Usage Cycle', order.usageCycleDays ? `${order.usageCycleDays} days` : 'N/A', '', 'Expected Next Reorder', expectedReorderStr, '']
    ];

    orderRows.forEach((rVals, idx) => {
      const rNum = 10 + idx;
      orderSheet.getRow(rNum).values = [rVals[0], rVals[1], '', rVals[3], rVals[4], ''];
      orderSheet.mergeCells(`B${rNum}:C${rNum}`);
      orderSheet.mergeCells(`E${rNum}:F${rNum}`);

      ['A', 'D'].forEach(c => {
        const cell = orderSheet.getCell(`${c}${rNum}`);
        cell.fill = labelFill;
        cell.font = labelFont;
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      });
      ['B', 'E'].forEach(c => {
        const cell = orderSheet.getCell(`${c}${rNum}`);
        cell.font = { ...dataFont, bold: true };
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      });
      orderSheet.getRow(rNum).height = 20;
    });

    // Section 3: Ordered Products & Specifications
    orderSheet.mergeCells('A14:F14');
    const sec3 = orderSheet.getCell('A14');
    sec3.value = '3. ORDERED PRODUCTS & SPECIFICATIONS';
    sec3.font = sectionFont;
    sec3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    sec3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    orderSheet.getRow(14).height = 24;

    const itemColHeaders = [
      'Item #',
      'Product Name',
      'Dimension Key',
      'Dimensions (WxH mm)',
      'Category / Material',
      'Ordered Quantity (Units)'
    ];

    const itemHeaderRow = orderSheet.getRow(15);
    itemHeaderRow.values = itemColHeaders;
    itemHeaderRow.height = 24;
    itemHeaderRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    let currentItemRow = 16;
    let grandTotalUnits = 0;

    (order.lineItems || []).forEach((li, idx) => {
      const p = li.productId || {};
      const prodName = li.name || p.name || 'Custom Label';
      const dimKey = li.dimensionKey || p.dimensionKey || '-';
      const unitStr = p.unit ? p.unit.toLowerCase() : 'mm';
      const dims = (p.widthMm && p.heightMm) ? `${p.widthMm}x${p.heightMm} ${unitStr}` : (li.dimensionKey || '-');
      const specs = [p.category, p.material].filter(Boolean).join(' • ') || '-';
      const qty = li.qty || 0;
      grandTotalUnits += qty;

      const row = orderSheet.getRow(currentItemRow);
      row.values = [
        idx + 1,
        prodName,
        dimKey,
        dims,
        specs,
        qty
      ];
      row.height = 20;

      row.eachCell((cell, colNum) => {
        cell.font = dataFont;
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: colNum === 6 ? 'right' : 'left' };
        if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });

      currentItemRow++;
    });

    // Total units row
    const totalRow = orderSheet.getRow(currentItemRow);
    totalRow.values = ['Total Units', '', '', '', '', grandTotalUnits];
    orderSheet.mergeCells(`A${currentItemRow}:E${currentItemRow}`);
    const totLabelCell = orderSheet.getCell(`A${currentItemRow}`);
    totLabelCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    totLabelCell.alignment = { vertical: 'middle', horizontal: 'right' };
    totLabelCell.border = thinBorder;
    totLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    const totValCell = orderSheet.getCell(`F${currentItemRow}`);
    totValCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    totValCell.alignment = { vertical: 'middle', horizontal: 'right' };
    totValCell.border = thinBorder;
    totValCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    totalRow.height = 22;

    // Section 4: Notes (if present)
    if (order.notes) {
      currentItemRow += 2;
      orderSheet.mergeCells(`A${currentItemRow}:F${currentItemRow}`);
      const sec4 = orderSheet.getCell(`A${currentItemRow}`);
      sec4.value = '4. ORDER NOTES & PRODUCTION INSTRUCTIONS';
      sec4.font = sectionFont;
      sec4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      sec4.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      orderSheet.getRow(currentItemRow).height = 22;

      currentItemRow++;
      orderSheet.mergeCells(`A${currentItemRow}:F${currentItemRow + 1}`);
      const notesCell = orderSheet.getCell(`A${currentItemRow}`);
      notesCell.value = order.notes;
      notesCell.font = dataFont;
      notesCell.border = thinBorder;
      notesCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    }

    orderSheet.columns = [
      { key: 'A', width: 14 },
      { key: 'B', width: 28 },
      { key: 'C', width: 18 },
      { key: 'D', width: 22 },
      { key: 'E', width: 26 },
      { key: 'F', width: 24 }
    ];

    const safeOrderNo = formattedOrderNo.replace(/[^a-zA-Z0-9_-]/g, '_');
    const todayIso = new Date().toISOString().split('T')[0];
    const filename = `Order_${safeOrderNo}_${todayIso}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting order to excel:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error generating order excel export' });
    }
  }
};

// POST /api/orders/import-excel
const importOrdersExcel = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'Please upload a valid .xlsx or .xls file' });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const { parseAndImportOrdersFromWorkbook } = require('../utils/orderExcelHelper');
    const result = await parseAndImportOrdersFromWorkbook(workbook, { createdBy: req.user });

    return res.json({
      message: `Import complete: ${result.createdOrdersCount} orders created successfully across ${result.totalParsedLineItems} line items.`,
      summary: result
    });
  } catch (error) {
    console.error('Error importing orders from Excel:', error);
    return res.status(500).json({ message: 'Server error processing order Excel import: ' + error.message });
  }
};

// ==========================================
// LOST ORDERS MANAGEMENT
// ==========================================

// GET /api/orders/lost
const getLostOrders = async (req, res) => {
  try {
    const {
      search,
      reason,
      from,
      to,
      salesExecutive,
      sortBy = 'lostAt_desc',
      page = 1,
      limit = 50
    } = req.query;

    // Fetch all lost/cancelled orders matching scope filter
    const allScopeLostOrders = await Order.find({
      ...req.scopeFilter,
      status: { $in: ['cancelled', 'lost'] }
    })
      .populate('customerId', 'name company phone phone2 email city address')
      .populate('salesExecutive', 'name email avatarUrl role')
      .populate('lostBy', 'name email avatarUrl role')
      .populate('lineItems.productId', 'name widthMm heightMm dimensionKey category unitPrice unit description')
      .lean();

    // Compute metrics across entire scope
    let totalLostAmount = 0;
    let totalLostUnits = 0;
    const reasonCounts = {};

    allScopeLostOrders.forEach(ord => {
      if (ord.amount != null && !isNaN(ord.amount)) {
        totalLostAmount += ord.amount;
      }
      const units = (ord.lineItems || []).reduce((sum, item) => sum + (item.qty || 0), 0);
      totalLostUnits += units;

      const r = (ord.lostReason || '').trim() || 'Unspecified Reason';
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    });

    const reasonBreakdown = Object.entries(reasonCounts)
      .map(([reasonText, count]) => ({ reason: reasonText, count }))
      .sort((a, b) => b.count - a.count);

    // Apply filtering
    let matchedOrders = allScopeLostOrders;

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      matchedOrders = matchedOrders.filter(ord => {
        const orderNo = (ord.orderNo || '').toLowerCase();
        const custName = (ord.customerId?.name || '').toLowerCase();
        const company = (ord.customerId?.company || '').toLowerCase();
        const phone = (ord.customerId?.phone || '').toLowerCase();
        const email = (ord.customerId?.email || '').toLowerCase();
        const city = (ord.customerId?.city || '').toLowerCase();
        const exec = (ord.salesExecutive?.name || '').toLowerCase();
        const lostBy = (ord.lostBy?.name || '').toLowerCase();
        const reasonText = (ord.lostReason || '').toLowerCase();
        const notes = (ord.notes || ord.lostNotes || '').toLowerCase();
        const hasMatchingItem = (ord.lineItems || []).some(li =>
          (li.name || '').toLowerCase().includes(q) ||
          (li.dimensionKey || '').toLowerCase().includes(q) ||
          (li.description || '').toLowerCase().includes(q)
        );

        return orderNo.includes(q) ||
          custName.includes(q) ||
          company.includes(q) ||
          phone.includes(q) ||
          email.includes(q) ||
          city.includes(q) ||
          exec.includes(q) ||
          lostBy.includes(q) ||
          reasonText.includes(q) ||
          notes.includes(q) ||
          hasMatchingItem;
      });
    }

    if (reason && reason !== 'all') {
      const rLower = reason.toLowerCase().trim();
      matchedOrders = matchedOrders.filter(ord => (ord.lostReason || '').toLowerCase().includes(rLower));
    }

    if (salesExecutive && salesExecutive !== 'all') {
      matchedOrders = matchedOrders.filter(ord => {
        const execId = ord.salesExecutive?._id?.toString() || ord.salesExecutive?.toString();
        return execId === salesExecutive;
      });
    }

    if (from || to) {
      const fDate = from ? new Date(from) : null;
      const tDate = to ? new Date(to) : null;
      matchedOrders = matchedOrders.filter(ord => {
        const d = ord.lostAt ? new Date(ord.lostAt) : (ord.updatedAt ? new Date(ord.updatedAt) : new Date(ord.orderDate));
        if (fDate && d < fDate) return false;
        if (tDate && d > tDate) return false;
        return true;
      });
    }

    // Sort matched orders
    matchedOrders.sort((a, b) => {
      const getLostDate = (o) => (o.lostAt ? new Date(o.lostAt).getTime() : (o.updatedAt ? new Date(o.updatedAt).getTime() : 0));
      if (sortBy === 'lostAt_asc') return getLostDate(a) - getLostDate(b);
      if (sortBy === 'amount_desc') return (b.amount || 0) - (a.amount || 0);
      if (sortBy === 'amount_asc') return (a.amount || 0) - (b.amount || 0);
      if (sortBy === 'orderDate_desc') return new Date(b.orderDate || b.createdAt).getTime() - new Date(a.orderDate || a.createdAt).getTime();
      if (sortBy === 'orderDate_asc') return new Date(a.orderDate || a.createdAt).getTime() - new Date(b.orderDate || b.createdAt).getTime();
      if (sortBy === 'orderNo_asc') return (a.orderNo || '').localeCompare(b.orderNo || '');
      // Default: lostAt_desc
      return getLostDate(b) - getLostDate(a);
    });

    const totalFiltered = matchedOrders.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;
    const paginatedOrders = matchedOrders.slice(skip, skip + limitNum);

    return res.json({
      orders: paginatedOrders,
      total: totalFiltered,
      page: pageNum,
      totalPages: Math.ceil(totalFiltered / limitNum) || 1,
      summary: {
        totalLostOrders: allScopeLostOrders.length,
        totalLostAmount: Math.round(totalLostAmount * 100) / 100,
        totalLostUnits,
        filteredCount: totalFiltered,
        filteredAmount: Math.round(matchedOrders.reduce((sum, o) => sum + (o.amount || 0), 0) * 100) / 100,
        filteredUnits: matchedOrders.reduce((sum, o) => sum + (o.lineItems || []).reduce((s, li) => s + (li.qty || 0), 0), 0),
        reasonBreakdown,
        topReason: reasonBreakdown[0]?.reason || 'None'
      }
    });
  } catch (error) {
    console.error('Error fetching lost orders:', error);
    return res.status(500).json({ message: 'Server error fetching lost orders' });
  }
};

// PUT /api/orders/:id/mark-lost
const markOrderAsLost = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body || {};

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A reason for marking the order as lost is required' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Caller ownership check
    if (req.user.role === 'caller' && order.salesExecutive?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only update your own orders' });
    }

    order.status = 'cancelled';
    order.lostReason = reason.trim();
    order.lostAt = new Date();
    order.lostBy = req.user.id;
    if (notes) {
      order.lostNotes = notes.trim();
    }

    await order.save();

    await Activity.create({
      relatedType: 'customer',
      relatedId: order.customerId,
      type: 'status_change',
      description: `Order ${order.orderNo || id} marked as LOST. Reason: "${reason.trim()}"`,
      createdBy: req.user.id
    });

    const updated = await Order.findById(order._id)
      .populate('customerId', 'name company phone email city')
      .populate('salesExecutive', 'name email avatarUrl role')
      .populate('lostBy', 'name email avatarUrl role')
      .populate('lineItems.productId', 'name widthMm heightMm dimensionKey category unitPrice unit');

    return res.json({
      message: `Order "${order.orderNo || id}" successfully marked as Lost.`,
      order: updated
    });
  } catch (error) {
    console.error('Error marking order as lost:', error);
    return res.status(500).json({ message: 'Server error marking order as lost' });
  }
};

// PUT /api/orders/:id/reopen
const reopenLostOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Caller ownership check
    if (req.user.role === 'caller' && order.salesExecutive?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only restore your own orders' });
    }

    const prevReason = order.lostReason;
    order.status = 'confirmed';
    order.lostReason = '';
    order.lostAt = null;
    order.lostBy = null;
    order.lostNotes = '';
    if (notes) {
      order.notes = [order.notes, `Reopened note: ${notes}`].filter(Boolean).join(' | ');
    }

    await order.save();

    await Activity.create({
      relatedType: 'customer',
      relatedId: order.customerId,
      type: 'status_change',
      description: `Order ${order.orderNo || id} reopened and restored to CONFIRMED (previously lost: "${prevReason || 'No reason'}").`,
      createdBy: req.user.id
    });

    const updated = await Order.findById(order._id)
      .populate('customerId', 'name company phone email city')
      .populate('salesExecutive', 'name email avatarUrl role')
      .populate('lostBy', 'name email avatarUrl role')
      .populate('lineItems.productId', 'name widthMm heightMm dimensionKey category unitPrice unit');

    return res.json({
      message: `Order "${order.orderNo || id}" reopened successfully.`,
      order: updated
    });
  } catch (error) {
    console.error('Error reopening lost order:', error);
    return res.status(500).json({ message: 'Server error reopening lost order' });
  }
};

// GET /api/orders/lost/export-excel
const exportLostOrdersExcel = async (req, res) => {
  try {
    const { search, reason, from, to, salesExecutive } = req.query;

    const orders = await Order.find({
      ...req.scopeFilter,
      status: { $in: ['cancelled', 'lost'] }
    })
      .populate('customerId', 'name company phone email city address deliveryAddress')
      .populate('salesExecutive', 'name email')
      .populate('lostBy', 'name email')
      .populate('lineItems.productId', 'name widthMm heightMm dimensionKey category unitPrice unit')
      .sort({ lostAt: -1, updatedAt: -1 })
      .lean();

    let filtered = orders;
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(ord => {
        return (ord.orderNo || '').toLowerCase().includes(q) ||
          (ord.customerId?.name || '').toLowerCase().includes(q) ||
          (ord.customerId?.company || '').toLowerCase().includes(q) ||
          (ord.lostReason || '').toLowerCase().includes(q);
      });
    }

    if (reason && reason !== 'all') {
      filtered = filtered.filter(ord => (ord.lostReason || '').toLowerCase().includes(reason.toLowerCase().trim()));
    }

    if (salesExecutive && salesExecutive !== 'all') {
      filtered = filtered.filter(ord => {
        const execId = ord.salesExecutive?._id?.toString() || ord.salesExecutive?.toString();
        return execId === salesExecutive;
      });
    }

    if (from || to) {
      const fDate = from ? new Date(from) : null;
      const tDate = to ? new Date(to) : null;
      filtered = filtered.filter(ord => {
        const d = ord.lostAt ? new Date(ord.lostAt) : (ord.updatedAt ? new Date(ord.updatedAt) : new Date(ord.orderDate));
        if (fDate && d < fDate) return false;
        if (tDate && d > tDate) return false;
        return true;
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JS Labels Retention Engine';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Lost Orders Register', {
      views: [{ showGridLines: true }]
    });

    // Title banner
    sheet.mergeCells('A1:L1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'JS LABELS - LOST & CANCELLED ORDERS AUDIT REGISTER';
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 36;

    // Subtitle
    sheet.mergeCells('A2:L2');
    const subCell = sheet.getCell('A2');
    subCell.value = `Generated: ${new Date().toLocaleString('en-IN')} | Total Records: ${filtered.length} | Scope: ${req.user.role.toUpperCase()}`;
    subCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(2).height = 20;

    sheet.addRow([]);

    const headers = [
      'Order No',
      'PO Date',
      'Customer Name',
      'Company Name',
      'Phone Number',
      'City',
      'Items & Specs',
      'Total Units',
      'Order Value (₹)',
      'Reason for Loss',
      'Date & Time Marked Lost',
      'Marked By / Executive'
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };

    const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF2F8' } };

    filtered.forEach((ord, index) => {
      const orderNo = ord.orderNo || `ORD-${ord._id.toString().slice(-6)}`;
      const poDateStr = ord.orderDate ? new Date(ord.orderDate).toLocaleDateString('en-IN') : '-';
      const custName = ord.customerId?.name || 'N/A';
      const company = ord.customerId?.company || '-';
      const phone = ord.customerId?.phone || '-';
      const city = ord.customerId?.city || '-';
      const totalUnits = (ord.lineItems || []).reduce((sum, item) => sum + (item.qty || 0), 0);
      const itemsStr = (ord.lineItems || [])
        .map(li => `${li.name || 'Label'} (${li.dimensionKey || ''}) - ${li.qty} pcs`)
        .join('; ') || 'Label Product';
      const amt = ord.amount != null ? ord.amount : 0;
      const reasonStr = ord.lostReason || 'Unspecified';
      const lostDateStr = ord.lostAt
        ? new Date(ord.lostAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : (ord.updatedAt ? new Date(ord.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
      const markedByStr = ord.lostBy?.name || ord.salesExecutive?.name || 'Staff';

      const row = sheet.addRow([
        orderNo,
        poDateStr,
        custName,
        company,
        phone,
        city,
        itemsStr,
        totalUnits,
        amt,
        reasonStr,
        lostDateStr,
        markedByStr
      ]);
      row.height = 22;

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 9 };
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: [8, 9].includes(colNum) ? 'right' : 'left' };
        if (colNum === 9 && typeof cell.value === 'number') {
          cell.numFmt = '₹#,##0.00';
        }
        if (colNum === 8 && typeof cell.value === 'number') {
          cell.numFmt = '#,##0';
        }
        if (index % 2 === 1) {
          cell.fill = zebraFill;
        }
      });
    });

    sheet.columns = [
      { key: 'A', width: 16 },
      { key: 'B', width: 14 },
      { key: 'C', width: 24 },
      { key: 'D', width: 22 },
      { key: 'E', width: 16 },
      { key: 'F', width: 14 },
      { key: 'G', width: 34 },
      { key: 'H', width: 16 },
      { key: 'I', width: 16 },
      { key: 'J', width: 28 },
      { key: 'K', width: 24 },
      { key: 'L', width: 20 }
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="JS_Labels_Lost_Orders_${Date.now()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating lost orders Excel export:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error generating lost orders excel export' });
    }
  }
};

module.exports = {
  getOrders,
  getAvailableOrderMonths,
  getOrdersSummary,
  getLostOrders,
  markOrderAsLost,
  reopenLostOrder,
  exportLostOrdersExcel,
  createOrder,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
  exportAllOrdersExcel,
  exportSingleOrderExcel,
  importOrdersExcel
};
