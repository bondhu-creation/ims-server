const { TABLE } = require("../../../../utils/constant");
const { get_data } = require("../../../../utils/database");
const { log } = require("../../../../utils/log");

const get_product_list = async (request, res) => {
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
            log.info(`Inventory list for salesman Found: ${data?.length} of ${total}`);
            return res.status(200).json({
                  code: 200,
                  message: "Inventory list Found",
                  total,
                  data,
            });
      } catch (e) {
            log.error(`An exception occurred while getting Inventory list for salesman: ${e?.message}`);
            return res.status(500).json({ code: 500, message: "Something Went Wrong! Please try again later!" });
      }
};

// Search matches the product name or any of its batch codes. It is applied per
// product (EXISTS), not per batch row, so the totals always cover every batch.
const append_search_filter = (request, query, values) => {
      if (request.query.search_text && request.query.search_text.trim() !== "") {
            const searchText = `%${request.query.search_text.trim().toLowerCase()}%`;
            values.push(searchText);
            query += ` AND (
                  LOWER(p.name) LIKE $${values.length}
                  OR EXISTS (
                        SELECT 1 FROM ${TABLE.INVENTORY} sb
                        WHERE sb.product_oid = p.oid AND LOWER(sb.batch_code) LIKE $${values.length}
                  )
            )`;
      }
      return query;
};

const generate_count_sql = (request) => {
      let query = `SELECT COUNT(*) AS total
                   FROM ${TABLE.PRODUCT} p
                   WHERE p.status = 'Active'
                   AND EXISTS (SELECT 1 FROM ${TABLE.INVENTORY} i WHERE i.product_oid = p.oid)`;
      let values = [];

      query = append_search_filter(request, query, values);

      return { text: query, values };
};

const generate_data_sql = (request) => {
      let query = `SELECT
                        p.oid AS product_oid,
                        p.name AS product_name,
                        p.restock_threshold,
                        p.photo,
                        c.name AS category_name,
                        sc.name AS sub_category_name,
                        COUNT(DISTINCT i.batch_code) AS total_batches,
                        COUNT(DISTINCT i.batch_code) FILTER (WHERE i.quantity_available > 0) AS in_stock_batches,
                        COALESCE(SUM(i.quantity_available)::INTEGER, 0) AS total_available_quantity,
                        CAST(MIN(i.selling_price) FILTER (WHERE i.intended_use = 'for_sale' AND i.quantity_available > 0) AS INTEGER) AS min_selling_price,
                        CAST(MAX(i.selling_price) FILTER (WHERE i.intended_use = 'for_sale' AND i.quantity_available > 0) AS INTEGER) AS max_selling_price,
                        BOOL_OR(i.status = 'pending_pricing') AS has_pending_pricing,
                        BOOL_OR(i.intended_use = 'for_sale') AS has_for_sale_batch
                   FROM ${TABLE.PRODUCT} p
                   INNER JOIN ${TABLE.INVENTORY} i ON i.product_oid = p.oid
                   LEFT JOIN ${TABLE.CATEGORIES} c ON c.oid = p.category_oid
                   LEFT JOIN ${TABLE.SUB_CATEGORIES} sc ON sc.oid = p.sub_category_oid
                   WHERE p.status = 'Active'`;
      let values = [];

      query = append_search_filter(request, query, values);

      // Case-insensitive so the order is alphabetical whatever the database collation; oid keeps paging stable.
      query += ` GROUP BY p.oid, p.name, p.restock_threshold, p.photo, c.name, sc.name
                 ORDER BY LOWER(TRIM(p.name)) ASC, p.oid ASC`;

      if (request.query.limit) {
            query += ` LIMIT $${values.length + 1}`;
            values.push(Number(request.query.limit));
      }

      if (request.query.offset) {
            query += ` OFFSET $${values.length + 1}`;
            values.push(Number(request.query.offset));
      }

      return { text: query, values };
};

module.exports = get_product_list;
