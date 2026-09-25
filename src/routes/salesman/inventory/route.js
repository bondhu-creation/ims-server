const { Router } = require("express");
const { ROUTES } = require("../../../utils/constant");
const jwtMiddleware = require("../../../utils/validate-jwt");
const { validator } = require("../../../utils/validator");
const { inventory_list_schema, inventory_details_schema } = require("./schema");
const get_product_list = require("./controller/get-product-list");
const get_product_details = require("./controller/get-product-details");

const router = Router();

// Get product list (read-only, no cost or profit fields)
router.get(
      ROUTES.GET_PRODUCT_LIST_FOR_OVERVIEW,
      [jwtMiddleware, validator.get(inventory_list_schema)],
      get_product_list
);

// Get product details with batch list (read-only, no cost or profit fields)
router.get(
      ROUTES.GET_PRODUCT_DETAILS_FOR_OVERVIEW,
      [jwtMiddleware, validator.get(inventory_details_schema)],
      get_product_details
);

module.exports = { inventoryRouter: router };
