const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roles');

// Strict RBAC: All endpoints restricted to super_admin and manager ONLY
router.use(protect);
router.use(allowRoles('super_admin', 'manager'));

// Month-based metadata and summaries
router.get('/available-months', getAvailableMonths);
router.get('/overview', getReportsOverview);
router.get('/revenue-trend', getRevenueTrend);
router.get('/top-products', getTopProducts);
router.get('/orders-by-status', getOrdersByStatus);
router.get('/top-customers', getTopCustomersReport);
router.get('/executive-performance', getExecutivePerformance);
router.get('/customer-summary', getCustomerReportSummary);
router.get('/product-summary', getProductReportSummary);

// Excel Exports
router.get('/export/monthly', exportMonthlyReportExcel);
router.get('/export/customer/:customerId', exportIndividualCustomerReportExcel);
router.get('/export/product/:productId', exportIndividualProductReportExcel);

// Backward compatible CSV export
router.get('/export', exportReportCSV);

module.exports = router;
