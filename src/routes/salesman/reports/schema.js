const Joi = require("joi");

const current_stock_report_schema = Joi.object({
      warehouse_oid: Joi.string().allow(null, '').optional(),
      category_oid: Joi.string().allow(null, '').optional(),
      sub_category_oid: Joi.string().allow(null, '').optional(),
});

const product_wise_stock_report_schema = Joi.object({
      product_oid: Joi.string().allow(null, '').optional(),
});

// The client sends the shop's local date as YYYY-MM-DD, never a timestamp.
const daily_sales_report_schema = Joi.object({
      report_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
});

const generic_oid_schema = Joi.object({
      oid: Joi.string().required(),
});

module.exports = { current_stock_report_schema, product_wise_stock_report_schema, daily_sales_report_schema, generic_oid_schema };