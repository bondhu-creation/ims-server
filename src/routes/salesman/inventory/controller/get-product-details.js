const { TABLE } = require("../../../../utils/constant");
const { get_data } = require("../../../../utils/database");
const { log } = require("../../../../utils/log");

const get_product_details = async (request, res) => {
      try {
            const product_set = await get_data(generate_product_data_sql(request));
            if (!product_set.length) {
                  return res.status(404).json({ code: 404, message: "Product not found!" });
            }

            const batch_data = await get_data(generate_batch_data_sql(request));

            const data = { ...product_set[0], batch_data };

            log.info(`Inventory details for salesman Found for product oid: ${request.query.product_oid}`);
            return res.status(200).json({
                  code: 200,
                  message: "Inventory details Found",
                  data,
            });
      } catch (e) {
            log.error(`An exception occurred while getting Inventory details for salesman: ${e?.message}`);
            return res.status(500).json({ code: 500, message: "Something Went Wrong! Please try again later!" });
      }
};

const generate_product_data_sql = (request) => {
      let query = `select p.oid, p.name, p.sku, p.unit_type, p.description, p.photo, p.product_nature, p.restock_threshold, p.status, c.name as category_name, sc.name as sub_category_name
            from ${TABLE.PRODUCT} p
            LEFT JOIN ${TABLE.CATEGORIES} c ON c.oid = p.category_oid
            LEFT JOIN ${TABLE.SUB_CATEGORIES} sc ON sc.oid = p.sub_category_oid
      where p.oid = $1 and p.status = 'Active'`;
      let values = [request.query.product_oid];

      return { text: query, values };
};

// Only what a salesman needs to find a batch and print its label: no cost price,
// supplier, stock cost, revenue or profit.
const generate_batch_data_sql = (request) => {
      let query = `select i.oid as inventory_oid, i.batch_code, CAST(i.selling_price as INTEGER) as selling_price, i.maximum_discount,
            CAST(i.quantity_available as INTEGER) as quantity_available, i.intended_use, i.status,
            w."name" as warehouse_name, a."name" as aisle_name
            from ${TABLE.INVENTORY} i
            left join ${TABLE.PURCHASE_DETAILS} pd ON pd.oid = i.purchase_details_oid
            left join ${TABLE.WAREHOUSE} w on w.oid = pd.warehouse_oid
            left join ${TABLE.AISLE} a on a.oid = pd.aisle_oid
      where i.product_oid = $1
      order by i.created_on desc nulls last, i.batch_code asc`;
      let values = [request.query.product_oid];

      return { text: query, values };
};

module.exports = get_product_details;
