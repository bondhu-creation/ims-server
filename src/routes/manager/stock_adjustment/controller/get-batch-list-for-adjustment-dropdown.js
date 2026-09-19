const { TABLE } = require("../../../../utils/constant");
const { get_data } = require("../../../../utils/database");
const { log } = require("../../../../utils/log");

const get_batch_list_for_adjustment_dropdown = async (request, res) => {
      try {
            const dataSql = generate_data_sql(request);

            const data_set = await get_data(dataSql);
            const data = data_set.length ? data_set : [];

            log.info(`Batch list for stock adjustment dropdown Found: ${data?.length}`);
            return res.status(200).json({
                  code: 200,
                  message: "Batch List For Stock Adjustment Dropdown Found",
                  data,
            });
      } catch (e) {
            log.error(`An exception occurred while getting batch list for stock adjustment dropdown information: ${e?.message}`);
            return res.status(500).json({ code: 500, message: "Something Went Wrong! Please try again later!" });
      }
};

const generate_data_sql = (request) => {
      // Deliberately not filtered on quantity_available > 0: an increase has to be
      // possible on a batch that has already run down to zero.
      let query = `SELECT i.oid as inventory_oid, i.product_oid, i.batch_code,
                  CAST(i.quantity_available AS INTEGER) as quantity_available,
                  i.cost_price, i.status, i.intended_use, p.name as product_name, p.unit_type,
                  p.name || ' (' || i.batch_code || ')' AS label
            FROM ${TABLE.INVENTORY} i
            LEFT JOIN ${TABLE.PRODUCT} p ON p.oid = i.product_oid
            WHERE p.status = 'Active'
            ORDER BY p.name ASC, i.batch_code ASC`;
      let values = [];
      return { text: query, values };
};

module.exports = get_batch_list_for_adjustment_dropdown;
