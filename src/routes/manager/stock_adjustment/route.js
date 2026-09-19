const { Router } = require("express");
const { ROUTES } = require("../../../utils/constant");
const jwtMiddleware = require('../../../utils/validate-jwt');
const { stock_adjustment_list_schema, stock_adjustment_schema, stock_adjustment_details_schema } = require("./schema");
const { validator } = require("../../../utils/validator");
const get_stock_adjustment_list = require("./controller/get-stock-adjustment-list");
const get_batch_list_for_adjustment_dropdown = require("./controller/get-batch-list-for-adjustment-dropdown");
const create_stock_adjustment = require("./controller/create-stock-adjustment");
const get_stock_adjustment_details = require("./controller/get-stock-adjustment-details");

const router = Router();

// Get Stock Adjustment List
router.get(
      ROUTES.GET_STOCK_ADJUSTMENT_LIST,
      [jwtMiddleware, validator.get(stock_adjustment_list_schema)],
      get_stock_adjustment_list
);

// Get Batch List for dropdown
router.get(
      ROUTES.GET_BATCH_LIST_FOR_ADJUSTMENT_DROPDOWN,
      [jwtMiddleware],
      get_batch_list_for_adjustment_dropdown
);

// Create A New Stock Adjustment
router.post(
      ROUTES.CREATE_STOCK_ADJUSTMENT,
      [jwtMiddleware, validator.post(stock_adjustment_schema)],
      create_stock_adjustment
);

// Get Stock Adjustment Details
router.get(
      ROUTES.GET_STOCK_ADJUSTMENT_DETAILS,
      [jwtMiddleware, validator.get(stock_adjustment_details_schema)],
      get_stock_adjustment_details
);

module.exports = { stockAdjustmentRouter: router };
