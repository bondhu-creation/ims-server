const { TABLE } = require("../../../../utils/constant");
const { get_data } = require("../../../../utils/database");
const { log } = require("../../../../utils/log");
const ExcelJS = require("exceljs");
const { addReportHeader } = require("../../../../utils/report-header");

const has_value = (v) => typeof v === "string" && v.trim() !== "" && v.trim().toLowerCase() !== "null";

const get_slow_moving_products_report = async (request, res) => {
      try {
            const data = await get_slow_moving_products_data(request.body);
            if (!data || data.length === 0) {
                  log.info("No Slow-Moving Products report Found");
                  return res.status(404).json({
                        code: 404,
                        message: "No Slow-Moving Products report Found",
                        data: null,
                  });
            }
            const buffer = await generate_slow_moving_products_xlsx(data, request.body);
            const file_name = `slow_moving_products_report_${Date.now()}.xlsx`;

            log.info(`Download slow-moving products report - [${file_name}]`);

            res
                  .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                  .set("Content-Disposition", `attachment; filename="${file_name}"`)
                  .set("X-Filename", file_name)
                  .set("Content-Length", buffer.length)
                  .send(buffer);

      } catch (error) {
            log.error(`An exception occurred while getting slow-moving products report: ${error?.message}`);
            res.status(500).json({ error: "Internal server error" });
      }
}

/**
 * Every active product that still has sellable stock, with what it sold in the period.
 * Unsold products (0) come first, then the ones that sold least.
 * "Last Sale" is the most recent sale ever, so a product unsold in the period still shows when it last moved.
 */
const get_slow_moving_products_data = async (payload) => {
      const values = [];
      let sales_filter = "";

      if (Array.isArray(payload.date_range) && has_value(payload.date_range[0]) && has_value(payload.date_range[1])) {
            sales_filter += ` AND sa.created_on >= $${values.length + 1}::date AND sa.created_on < ($${values.length + 2}::date + INTERVAL '1 day')`;
            values.push(payload.date_range[0], payload.date_range[1]);
      }

      let product_filter = "";
      if (has_value(payload.category_oid)) {
            product_filter += ` AND p.category_oid = $${values.length + 1}`;
            values.push(payload.category_oid);
      }

      const query = `
            SELECT
                  p.name AS product_name,
                  p.sku,
                  c.name AS category_name,
                  sc.name AS sub_category_name,
                  stock.available_quantity,
                  stock.stock_value,
                  COALESCE(sold.total_sold, 0) AS total_sold,
                  to_char(last_sale.last_sale_on, 'DD/MM/YYYY') AS last_sale_date,
                  (CURRENT_DATE - last_sale.last_sale_on::date) AS days_since_last_sale
            FROM ${TABLE.PRODUCT} p
            INNER JOIN (
                  SELECT product_oid,
                        SUM(quantity_available) AS available_quantity,
                        SUM(quantity_available * cost_price) AS stock_value
                  FROM ${TABLE.INVENTORY}
                  WHERE status = 'ready_for_sale' AND intended_use = 'for_sale'
                  GROUP BY product_oid
                  HAVING SUM(quantity_available) > 0
            ) stock ON stock.product_oid = p.oid
            LEFT JOIN ${TABLE.CATEGORIES} c ON c.oid = p.category_oid
            LEFT JOIN ${TABLE.SUB_CATEGORIES} sc ON sc.oid = p.sub_category_oid
            LEFT JOIN (
                  SELECT sd.product_oid, SUM(sd.quantity) AS total_sold
                  FROM ${TABLE.SALE_DETAILS} sd
                  INNER JOIN ${TABLE.SALES} sa ON sa.oid = sd.sales_oid
                  WHERE sa.status != 'Draft' ${sales_filter}
                  GROUP BY sd.product_oid
            ) sold ON sold.product_oid = p.oid
            LEFT JOIN (
                  SELECT sd.product_oid, MAX(sa.created_on) AS last_sale_on
                  FROM ${TABLE.SALE_DETAILS} sd
                  INNER JOIN ${TABLE.SALES} sa ON sa.oid = sd.sales_oid
                  WHERE sa.status != 'Draft'
                  GROUP BY sd.product_oid
            ) last_sale ON last_sale.product_oid = p.oid
            WHERE p.status = 'Active' ${product_filter}
            ORDER BY total_sold ASC, last_sale.last_sale_on ASC NULLS FIRST, stock.stock_value DESC, p.name ASC`;

      try {
            return await get_data({ text: query, values });
      } catch (err) {
            log.error(`An exception occurred while getting slow-moving products report information: ${err?.message}`);
            throw err;
      }
};

const period_label = (payload) => {
      const range = payload?.date_range;
      if (Array.isArray(range) && has_value(range[0]) && has_value(range[1])) {
            return `${range[0]} to ${range[1]}`;
      }
      return "All time";
};

const generate_slow_moving_products_xlsx = async (data, payload) => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Slow-Moving Products");

      const titles = [
            "Product Name",
            "SKU",
            "Category",
            "Sub Category",
            "Available Qty",
            "Stock Value (Cost)",
            "Units Sold (Period)",
            "Last Sale",
            "Days Since Last Sale",
      ];

      addReportHeader(sheet, `Slow-Moving Products Report (${period_label(payload)})`, titles.length);

      const headerRowIndex = 5;
      sheet.addRow(titles);
      sheet.getRow(headerRowIndex).font = { bold: true };

      data.forEach(r => {
            sheet.addRow([
                  r.product_name,
                  r.sku,
                  r.category_name,
                  r.sub_category_name,
                  Number(r.available_quantity),
                  r.stock_value === null ? "" : Number(r.stock_value),
                  Number(r.total_sold),
                  r.last_sale_date ?? "Never sold",
                  r.days_since_last_sale === null ? "" : Number(r.days_since_last_sale),
            ]);
      });

      sheet.columns.forEach(col => {
            let max = 0;
            col.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
                  if (rowNumber < headerRowIndex) return; // skip the wide report header rows
                  max = Math.max(max, (cell.value?.toString().length || 0) + 2);
            });
            col.width = Math.min(Math.max(max, 8), 40);
      });

      return workbook.xlsx.writeBuffer();
};

module.exports = get_slow_moving_products_report;
