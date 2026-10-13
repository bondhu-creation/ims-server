const { Router } = require("express");
const { ROUTES } = require("../../../utils/constant");
const { current_stock_report_schema, product_wise_stock_report_schema, daily_sales_report_schema } = require("./schema");
const get_current_stock_report = require("./controller/get-current-stock-report");
const jwtMiddleware = require("../../../utils/validate-jwt");
const { validator } = require("../../../utils/validator");
const get_product_wise_stock_report = require("./controller/get-product-wise-stock-report");
const get_daily_sales_report = require("./controller/get-daily-sales-report");

const router = Router();

router.post(
      ROUTES.GET_CURRENT_STOCK_REPORT,
      [jwtMiddleware, validator.get(current_stock_report_schema)],
      get_current_stock_report
);

router.post(
      ROUTES.GET_PRODUCT_WISE_STOCK_REPORT,
      [jwtMiddleware, validator.get(product_wise_stock_report_schema)],
      get_product_wise_stock_report
);

// Whole shop's sales, not just the logged-in salesman's: whoever closes the shop counts the drawer.
router.post(
      ROUTES.GET_DAILY_SALES_REPORT,
      [jwtMiddleware, validator.post(daily_sales_report_schema)],
      get_daily_sales_report
);

module.exports = { reportsRouter: router };