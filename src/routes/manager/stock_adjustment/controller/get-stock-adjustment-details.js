const { TABLE } = require("../../../../utils/constant");
const { get_data } = require("../../../../utils/database");
const { log } = require("../../../../utils/log");

const get_stock_adjustment_details = async (request, res) => {
      try {
            const dataSql = generate_data_sql(request);

            const data_set = await get_data(dataSql);
            const data = data_set.length ? data_set[0] : null;

            log.info(`Stock adjustment details Found for oid: ${request.query.oid}`);
            return res.status(200).json({
                  code: 200,
                  message: "Stock adjustment details Found",
                  data,
            });
      } catch (e) {
            log.error(`An exception occurred while getting stock adjustment details: ${e?.message}`);
            return res.status(500).json({ code: 500, message: "Something Went Wrong! Please try again later!" });
      }
};

const generate_data_sql = (request) => {
      let query = `SELECT sa.oid, sa.adjustment_type, sa.reason, sa.notes, sa.status, sa.cost_price,
                  CAST(sa.quantity AS INTEGER) as quantity,
                  CAST(sa.quantity_before AS INTEGER) as quantity_before,
                  CAST(sa.quantity_after AS INTEGER) as quantity_after,
                  (sa.quantity * sa.cost_price) AS adjustment_value,
                  p.name as product_name, p.sku, p.unit_type,
                  i.batch_code, CAST(i.quantity_available AS INTEGER) as current_quantity_available,
                  to_char(sa.created_on, 'DD/MM/YYYY HH24:MI') as created_on, sa.created_by,
                  s.name as supplier_name, w.name as warehouse_name, a.name as aisle_name
            FROM ${TABLE.STOCK_ADJUSTMENT} sa
            LEFT JOIN ${TABLE.PRODUCT} p ON p.oid = sa.product_oid
            LEFT JOIN ${TABLE.INVENTORY} i ON i.oid = sa.inventory_oid
            LEFT JOIN ${TABLE.PURCHASE_DETAILS} pd ON pd.oid = i.purchase_details_oid
            LEFT JOIN ${TABLE.PURCHASE} pu ON pu.oid = pd.purchase_oid
            LEFT JOIN ${TABLE.SUPPLIER} s ON s.oid = pu.supplier_oid
            LEFT JOIN ${TABLE.WAREHOUSE} w ON w.oid = pd.warehouse_oid
            LEFT JOIN ${TABLE.AISLE} a ON a.oid = pd.aisle_oid
            WHERE sa.oid = $1`;
      let values = [request.query.oid];

      return { text: query, values };
};

module.exports = get_stock_adjustment_details;
