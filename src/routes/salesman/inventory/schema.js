const Joi = require("joi");

const inventory_list_schema = Joi.object({
      offset: Joi.number().required(),
      limit: Joi.number().required(),
      search_text: Joi.string().trim().allow(null, "").optional(),
});

const inventory_details_schema = Joi.object({
      product_oid: Joi.string().required(),
});

module.exports = { inventory_list_schema, inventory_details_schema };
