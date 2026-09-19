const Joi = require("joi");

const stock_adjustment_list_schema = Joi.object({
      offset: Joi.number().required(),
      limit: Joi.number().required(),
      search_text: Joi.string().trim().allow(null, "").optional(),
      adjustment_type: Joi.string().trim().valid("increase", "decrease").allow(null, "").optional(),
});

const stock_adjustment_schema = Joi.object({
      // product_oid is accepted so the form can post its whole value, but the
      // server takes the product from the inventory row rather than trusting it.
      product_oid: Joi.string().min(2).max(128).allow(null, "").optional(),
      inventory_oid: Joi.string().min(2).max(128).required(),
      adjustment_type: Joi.string().valid("increase", "decrease").required(),
      quantity: Joi.number().greater(0).required(),
      reason: Joi.string().min(2).max(128).required(),
      notes: Joi.string().optional().allow(null, ""),
});

const stock_adjustment_details_schema = Joi.object({
      oid: Joi.string().required(),
});

module.exports = { stock_adjustment_list_schema, stock_adjustment_schema, stock_adjustment_details_schema };
