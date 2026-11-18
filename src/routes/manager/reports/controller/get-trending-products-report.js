const { TABLE } = require("../../../../utils/constant");
const { get_data } = require("../../../../utils/database");
const { log } = require("../../../../utils/log");
const ExcelJS = require("exceljs");
const { addReportHeader } = require("../../../../utils/report-header");

const has_value = (v) => typeof v === "string" && v.trim() !== "" && v.trim().toLowerCase() !== "null";

const get_trending_products_report = async (request, res) => {
      try {
            const data = await get_trending_products_data(request.body);
            if (!data || data.length === 0) {
                  log.info("No Trending Products report Found");
                  return res.status(404).json({
                        code: 404,
                        message: "No Trending Products report Found",
                        data: null,
                  });
            }
            const buffer = await generate_trending_products_xlsx(data, request.body);
            const file_name = `trending_products_report_${Date.now()}.xlsx`;

            log.info(`Download trending products report - [${file_name}]`);

            res
                  .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                  .set("Content-Disposition", `attachment; filename="${file_name}"`)
                  .set("X-Filename", file_name)
                  .set("Content-Length", buffer.length)
                  .send(buffer);

      } catch (error) {
            log.error(`An exception occurred while getting trending products report: ${error?.message}`);
            res.status(500).json({ error: "Internal server error" });
      }
}

const get_trending_products_data = async (payload) => {
      const values = [];
      let sales_filter = "";

      // FILTER: DATE RANGE - [start, end] as YYYY-MM-DD, both days inclusive
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
                  SUM(sd.quantity) AS total_sold,
                  COUNT(DISTINCT sd.sales_oid) AS invoice_count,
                  SUM(sd.total) AS total_revenue,
                  COALESCE(stock.available_quantity, 0) AS available_quantity,
                  to_char(MAX(sa.created_on), 'DD/MM/YYYY') AS last_sale_date
            FROM ${TABLE.SALE_DETAILS} sd
            INNER JOIN ${TABLE.SALES} sa ON sa.oid = sd.sales_oid
            INNER JOIN ${TABLE.PRODUCT} p ON p.oid = sd.product_oid
            LEFT JOIN ${TABLE.CATEGORIES} c ON c.oid = p.category_oid
            LEFT JOIN ${TABLE.SUB_CATEGORIES} sc ON sc.oid = p.sub_category_oid
            LEFT JOIN (
                  SELECT product_oid, SUM(quantity_available) AS available_quantity
                  FROM ${TABLE.INVENTORY}
                  WHERE status = 'ready_for_sale' AND intended_use = 'for_sale'
                  GROUP BY product_oid
            ) stock ON stock.product_oid = p.oid
            WHERE sa.status != 'Draft' ${sales_filter} ${product_filter}
            GROUP BY p.oid, p.name, p.sku, c.name, sc.name, stock.available_quantity
            ORDER BY total_sold DESC, total_revenue DESC, p.name ASC`;

      try {
            return await get_data({ text: query, values });
      } catch (err) {
            log.error(`An exception occurred while getting trending products report information: ${err?.message}`);
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

const generate_trending_products_xlsx = async (data, payload) => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Trending Products");

      const titles = [
            "Rank",
            "Product Name",
            "SKU",
            "Category",
            "Sub Category",
            "Units Sold",
            "Invoices",
            "Revenue",
            "Available Qty",
            "Last Sale",
      ];

      addReportHeader(sheet, `Trending Products Report (${period_label(payload)})`, titles.length);

      const headerRowIndex = 5;
      sheet.addRow(titles);
      sheet.getRow(headerRowIndex).font = { bold: true };

      data.forEach((r, i) => {
            sheet.addRow([
                  i + 1,
                  r.product_name,
                  r.sku,
                  r.category_name,
                  r.sub_category_name,
                  Number(r.total_sold),
                  Number(r.invoice_count),
                  r.total_revenue === null ? "" : Number(r.total_revenue),
                  Number(r.available_quantity),
                  r.last_sale_date,
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

module.exports = get_trending_products_report;
