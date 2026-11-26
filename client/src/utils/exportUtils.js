import api from '../api/axios';

/**
 * Download Customer Excel Purchase & 360 Report directly.
 * 
 * @param {string} customerId - ID of customer to export
 * @param {string} customerName - Name of customer for friendly filename
 * @param {object} notify - Notification context instance
 */
export async function exportCustomerToExcel(customerId, customerName = 'Customer', notify = null) {
  if (!customerId) {
    if (notify) notify.error('Invalid customer ID for export');
    return false;
  }

  try {
    const res = await api.get(`/customers/${customerId}/export-excel`, {
      responseType: 'blob'
    });

    // Determine filename
    let filename = `Customer_Report_${customerName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    // Create Blob and trigger download
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success(`Excel report for "${customerName}" downloaded successfully!`);
    }
    return true;
  } catch (err) {
    console.error('Failed to export customer excel:', err);
    let errMsg = 'Failed to export customer report to Excel';

    // If response is a blob containing JSON error
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {
        // use default
      }
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }

    if (notify) {
      notify.error(errMsg);
    }
    throw err;
  }
}

/**
 * Export full customer directory and billing details to formatted Excel spreadsheet.
 * 
 * @param {object} options
 * @param {string} [options.search='']
 * @param {object} [options.notify=null]
 */
export async function exportAllCustomersToExcel({ search = '', notify = null } = {}) {
  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/customers/export-all${queryStr}`, {
      responseType: 'blob'
    });

    const nowStr = new Date().toISOString().split('T')[0];
    let filename = `JS_Labels_Customers_${nowStr}.xlsx`;

    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success('Customer directory exported to Excel successfully!');
    }
    return true;
  } catch (err) {
    console.error('Failed to export all customers to excel:', err);
    let errMsg = 'Failed to export customers to Excel';

    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {
        // default
      }
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }

    if (notify) {
      notify.error(errMsg);
    }
    throw err;
  }
}

/**
 * Download Product Details & Job Time History Excel report.
 * 
 * @param {string} productId - ID of product to export
 * @param {string} productName - Name of product for friendly filename
 * @param {object} notify - Notification context instance
 */
export async function exportProductToExcel(productId, productName = 'Product', notify = null) {
  if (!productId) {
    if (notify) notify.error('Invalid product ID for export');
    return false;
  }

  try {
    const res = await api.get(`/products/${productId}/export-excel`, {
      responseType: 'blob'
    });

    const safeName = productName.replace(/[^a-zA-Z0-9_-]/g, '_');
    let filename = `${safeName}_ProductDetails.xlsx`;

    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success(`Product details for "${productName}" exported successfully!`);
    }
    return true;
  } catch (err) {
    console.error('Failed to export product excel:', err);
    let errMsg = 'Failed to export product details to Excel';

    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {
        // default
      }
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }

    if (notify) {
      notify.error(errMsg);
    }
    throw err;
  }
}

/**
 * Export all products to formatted Excel spreadsheet.
 * 
 * @param {object} options
 * @param {string} [options.search='']
 * @param {string} [options.category='']
 * @param {string} [options.status='']
 * @param {string} [options.unit='']
 * @param {object} [options.notify=null]
 */
export async function exportAllProductsToExcel({ search = '', category = '', status = '', unit = '', notify = null } = {}) {
  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category && category !== 'all') params.append('category', category);
    if (status && status !== 'all') params.append('status', status);
    if (unit && unit !== 'all') params.append('unit', unit);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/products/export-all${queryStr}`, {
      responseType: 'blob'
    });

    const nowStr = new Date().toISOString().split('T')[0];
    let filename = `JS_Labels_Products_${nowStr}.xlsx`;

    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success('Products exported to Excel successfully!');
    }
    return true;
  } catch (err) {
    console.error('Failed to export all products to excel:', err);
    let errMsg = 'Failed to export products to Excel';

    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {
        // default
      }
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }

    if (notify) {
      notify.error(errMsg);
    }
    throw err;
  }
}

/**
 * Download Complete Production Planning, Demand Forecast & Sales Excel Report
 * 
 * @param {object} options
 * @param {number} [options.trailingMonths=2] - Planning horizon trailing months
 * @param {object} [options.notify] - Notification context instance
 */
export async function exportAllProductionToExcel({ trailingMonths = 2, notify = null } = {}) {
  try {
    const res = await api.get(`/production/export-all?trailingMonths=${trailingMonths}`, {
      responseType: 'blob'
    });

    let filename = `JS_Labels_Production_Forecast_All_${new Date().toISOString().split('T')[0]}.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success('Complete production forecast data downloaded successfully!');
    }
    return true;
  } catch (err) {
    console.error('Failed to export all production data to excel:', err);
    let errMsg = 'Failed to export production forecast data';

    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {
        // default
      }
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }

    if (notify) {
      notify.error(errMsg);
    }
    throw err;
  }
}

/**
 * Download Individual Product Production & Demand Dossier Excel Report
 * 
 * @param {object} options
 * @param {string} options.productName - Name of the product
 * @param {string} [options.dimensionKey] - Dimension key of the product
 * @param {number} [options.trailingMonths=2] - Planning horizon trailing months
 * @param {object} [options.notify] - Notification context instance
 */
export async function exportProductProductionToExcel({ productName, dimensionKey = '', trailingMonths = 2, notify = null }) {
  if (!productName) {
    if (notify) notify.error('Product name is required for export');
    return false;
  }

  try {
    const params = new URLSearchParams({
      productName,
      trailingMonths: String(trailingMonths)
    });
    if (dimensionKey) params.append('dimensionKey', dimensionKey);

    const res = await api.get(`/production/export-product?${params.toString()}`, {
      responseType: 'blob'
    });

    const safeName = productName.replace(/[^a-zA-Z0-9_-]/g, '_');
    let filename = `${safeName}_Production_Dossier.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success(`Production dossier for "${productName}" exported successfully!`);
    }
    return true;
  } catch (err) {
    console.error('Failed to export product production dossier to excel:', err);
    let errMsg = `Failed to export production dossier for "${productName}"`;

    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {
        // default
      }
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }

    if (notify) {
      notify.error(errMsg);
    }
    throw err;
  }
}

/**
 * Download All Orders Master Register Excel report based on active filters.
 * 
 * @param {object} options
 * @param {string} [options.status='all'] - Order status filter
 * @param {string} [options.month=''] - Month filter ('YYYY-MM' or 'all')
 * @param {string} [options.year=''] - Year filter ('YYYY' or 'all')
 * @param {string} [options.from=''] - Start date filter
 * @param {string} [options.to=''] - End date filter
 * @param {string} [options.search=''] - Search term
 * @param {object} [options.notify] - Notification context instance
 */
export async function exportAllOrdersToExcel({
  status = 'all',
  month = '',
  year = '',
  from = '',
  to = '',
  search = '',
  notify = null
} = {}) {
  try {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);
    if (month && month !== 'all') params.append('month', month);
    if (year && year !== 'all') params.append('year', year);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (search && search.trim()) params.append('search', search.trim());

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/orders/export-all${qs}`, {
      responseType: 'blob'
    });

    let filename = `JS_Labels_Orders_Master_${new Date().toISOString().split('T')[0]}.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success('Orders master register downloaded successfully!');
    }
    return true;
  } catch (err) {
    console.error('Failed to export all orders to excel:', err);
    let errMsg = 'Failed to export orders to Excel';

    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {
        // default
      }
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }

    if (notify) {
      notify.error(errMsg);
    }
    throw err;
  }
}

/**
 * Download Individual Order Dossier Excel report.
 * 
 * @param {string} orderId - ID of order to export
 * @param {string} [orderNo='Order'] - Order number for friendly filename
 * @param {object} [notify] - Notification context instance
 */
export async function exportSingleOrderToExcel(orderId, orderNo = 'Order', notify = null) {
  if (!orderId) {
    if (notify) notify.error('Order ID is required for export');
    return false;
  }

  try {
    const res = await api.get(`/orders/${orderId}/export-excel`, {
      responseType: 'blob'
    });

    const safeOrderNo = orderNo.replace(/[^a-zA-Z0-9_-]/g, '_');
    let filename = `Order_${safeOrderNo}_${new Date().toISOString().split('T')[0]}.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success(`Order dossier for "${orderNo}" downloaded successfully!`);
    }
    return true;
  } catch (err) {
    console.error('Failed to export order to excel:', err);
    let errMsg = `Failed to export order dossier for "${orderNo}"`;

    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {
        // default
      }
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }

    if (notify) {
      notify.error(errMsg);
    }
    throw err;
  }
}




/**
 * Export Lost Leads Audit Register to Excel (.xlsx)
 *
 * @param {object} options - Filter parameters
 * @param {object} notify - Notification toast instance
 */
export async function exportLostLeadsToExcel(options = {}, notify = null) {
  try {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.reason && options.reason !== 'all') params.append('reason', options.reason);
    if (options.from) params.append('from', options.from);
    if (options.to) params.append('to', options.to);
    if (options.salesExecutive && options.salesExecutive !== 'all') params.append('salesExecutive', options.salesExecutive);
    if (options.source && options.source !== 'all') params.append('source', options.source);
    if (options.priority && options.priority !== 'all') params.append('priority', options.priority);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/leads/lost/export-excel${qs}`, {
      responseType: 'blob'
    });

    let filename = `JS_Labels_Lost_Leads_${new Date().toISOString().split('T')[0]}.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success('Lost Leads register exported successfully!');
    }
    return true;
  } catch (err) {
    console.error('Failed to export lost leads to excel:', err);
    let errMsg = 'Failed to export lost leads to Excel';
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {}
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }
    if (notify) notify.error(errMsg);
    throw err;
  }
}

/**
 * Backwards compatibility alias for exportLostOrdersToExcel -> exportLostLeadsToExcel
 */
export const exportLostOrdersToExcel = exportLostLeadsToExcel;

/**
 * Export Monthly Reports Comprehensive Excel Workbook
 * (Sheet 1: Summary KPIs, Sheet 2: Orders, Sheet 3: Products with Dimensions, Sheet 4: Customers)
 *
 * @param {object} options - Query filters (month, from, to, status, salesExecutive, etc.)
 * @param {object} notify - Notification instance
 */
export async function exportMonthlyReportToExcel(options = {}, notify = null) {
  try {
    const params = new URLSearchParams();
    if (options.month) params.append('month', options.month);
    if (options.period) params.append('period', options.period);
    if (options.from) params.append('from', options.from);
    if (options.to) params.append('to', options.to);
    if (options.status && options.status !== 'all') params.append('status', options.status);
    if (options.salesExecutive && options.salesExecutive !== 'all') params.append('salesExecutive', options.salesExecutive);
    if (options.search) params.append('search', options.search);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/reports/export/monthly${qs}`, {
      responseType: 'blob'
    });

    let filename = `JS_Labels_Monthly_Report_${options.month || options.period || 'Period'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success('Monthly report workbook exported successfully!');
    }
    return true;
  } catch (err) {
    console.error('Failed to export monthly report to excel:', err);
    let errMsg = 'Failed to export monthly report to Excel';
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {}
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }
    if (notify) notify.error(errMsg);
    throw err;
  }
}

/**
 * Export Individual Customer Complete Report
 *
 * @param {string} customerId - Target Customer ID
 * @param {string} customerName - Name for filename
 * @param {object} options - Filters (month, from, to)
 * @param {object} notify - Notification toast
 */
export async function exportIndividualCustomerReportToExcel(customerId, customerName = 'Customer', options = {}, notify = null) {
  try {
    const params = new URLSearchParams();
    if (options.month) params.append('month', options.month);
    if (options.from) params.append('from', options.from);
    if (options.to) params.append('to', options.to);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/reports/export/customer/${customerId}${qs}`, {
      responseType: 'blob'
    });

    const sanitizedName = (customerName || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
    let filename = `Customer_Report_${sanitizedName}_${options.month || 'AllTime'}.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success(`Report for "${customerName}" exported successfully!`);
    }
    return true;
  } catch (err) {
    console.error('Failed to export customer report to excel:', err);
    let errMsg = `Failed to export customer report`;
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {}
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }
    if (notify) notify.error(errMsg);
    throw err;
  }
}

/**
 * Export Individual Product Complete Sales & Order Report
 *
 * @param {string} productId - Target Product ID
 * @param {string} productName - Name for filename
 * @param {object} options - Filters (month, from, to)
 * @param {object} notify - Notification toast
 */
export async function exportIndividualProductReportToExcel(productId, productName = 'Product', options = {}, notify = null) {
  try {
    const params = new URLSearchParams();
    if (options.month) params.append('month', options.month);
    if (options.from) params.append('from', options.from);
    if (options.to) params.append('to', options.to);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/reports/export/product/${productId}${qs}`, {
      responseType: 'blob'
    });

    const sanitizedName = (productName || 'Product').replace(/[^a-zA-Z0-9_-]/g, '_');
    let filename = `Product_Report_${sanitizedName}_${options.month || 'AllTime'}.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success(`Report for "${productName}" exported successfully!`);
    }
    return true;
  } catch (err) {
    console.error('Failed to export product report to excel:', err);
    let errMsg = `Failed to export product report`;
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {}
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }
    if (notify) notify.error(errMsg);
    throw err;
  }
}

/**
 * Export Complete Dimension Production Dossier to Excel (.xlsx)
 *
 * @param {object} options
 * @param {string} options.dimensionKey - Target dimension key (e.g. 50x25 or N/A)
 * @param {number} [options.trailingMonths=2] - Planning horizon trailing months
 * @param {object} [options.notify] - Notification toast instance
 */
export async function exportDimensionProductionToExcel({ dimensionKey, trailingMonths = 2, notify = null }) {
  if (!dimensionKey) {
    if (notify) notify.error('Dimension key is required for export');
    return false;
  }

  try {
    const params = new URLSearchParams({
      dimensionKey,
      trailingMonths: String(trailingMonths)
    });

    const res = await api.get(`/production/export-dimension?${params.toString()}`, {
      responseType: 'blob'
    });

    const safeKey = dimensionKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    let filename = `Dimension_${safeKey}_Production_Dossier.xlsx`;
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify.success(`Dimension dossier for [${dimensionKey}] exported successfully!`);
    }
    return true;
  } catch (err) {
    console.error('Failed to export dimension production dossier to excel:', err);
    let errMsg = `Failed to export dimension dossier for [${dimensionKey}]`;

    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.message) errMsg = json.message;
      } catch (e) {}
    } else if (err.response?.data?.message) {
      errMsg = err.response.data.message;
    }

    if (notify) {
      notify.error(errMsg);
    }
    throw err;
  }
}
