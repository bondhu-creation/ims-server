const { TABLE } = require("../../../../utils/constant");
const { get_data } = require("../../../../utils/database");
const { log } = require("../../../../utils/log");

const get_stock_adjustment_list = async (request, res) => {
      try {
            // Step 1: Generate SQL for total count
            const countSql = generate_count_sql(request);

            const countResult = await get_data(countSql);
            const total = countResult[0]?.total || 0;

            // Step 2: Generate SQL for paginated data
            const dataSql = generate_data_sql(request);

            const data_set = await get_data(dataSql);
            const data = data_set.length ? data_set : [];

            // Step 3: Respond with total count and paginated data
            log.info(`Stock adjustment list Found: ${data?.length} of ${total}`);
            return res.status(200).json({
                  code: 200,
                  message: "Stock adjustment list Found",
                  total,
                  data,
            });
      } catch (e) {
            log.error(`An exception occurred while getting stock adjustment information: ${e?.message}`);
            return res.status(500).json({ code: 500, message: "Something Went Wrong! Please try again later!" });
      }
};

const apply_filters = (request, query, values) => {
      if (request.query.search_text && request.query.search_text.trim() !== "") {
            const searchText = `%${request.query.search_text.trim().toLowerCase()}%`;
            query += ` AND (LOWER(p.name) LIKE $${values.length + 1}`;
            query += ` OR LOWER(i.batch_code) LIKE $${values.length + 2}`;
            query += ` OR LOWER(sa.created_by) LIKE $${values.length + 3})`;
            values.push(searchText, searchText, searchText);
      }

      if (request.query.adjustment_type && request.query.adjustment_type.trim() !== "") {
            query += ` AND sa.adjustment_type = $${values.length + 1}`;
            values.push(request.query.adjustment_type.trim());
      }

      return query;
};

const generate_count_sql = (request) => {
      let query = `SELECT COUNT(*) AS total FROM ${TABLE.STOCK_ADJUSTMENT} sa
            LEFT JOIN ${TABLE.PRODUCT} p ON p.oid = sa.product_oid
            LEFT JOIN ${TABLE.INVENTORY} i ON i.oid = sa.inventory_oid
            WHERE 1 = 1`;
      let values = [];

      query = apply_filters(request, query, values);

      return { text: query, values };
};

const generate_data_sql = (request) => {
      let query = `SELECT sa.oid, sa.adjustment_type, sa.reason, sa.notes, sa.status,
                  CAST(sa.quantity AS INTEGER) as quantity,
                  CAST(sa.quantity_before AS INTEGER) as quantity_before,
                  CAST(sa.quantity_after AS INTEGER) as quantity_after,
                  p.name as product_name, i.batch_code,
                  to_char(sa.created_on, 'DD/MM/YYYY') as created_on, sa.created_by
            FROM ${TABLE.STOCK_ADJUSTMENT} sa
            LEFT JOIN ${TABLE.PRODUCT} p ON p.oid = sa.product_oid
            LEFT JOIN ${TABLE.INVENTORY} i ON i.oid = sa.inventory_oid
            WHERE 1 = 1`;
      let values = [];

      query = apply_filters(request, query, values);

      query += ` ORDER BY sa.created_on DESC`;

      if (request.query.offset) {
            query += ` OFFSET $${values.length + 1}`;
            values.push(Number(request.query.offset));
      }

      if (request.query.limit) {
            query += ` FETCH NEXT $${values.length + 1} ROWS ONLY`;
            values.push(Number(request.query.limit));
      }

      return { text: query, values };
};

module.exports = get_stock_adjustment_list;
