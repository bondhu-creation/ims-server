const { TABLE } = require("../../../../utils/constant");
const { get_data } = require("../../../../utils/database");
const { log } = require("../../../../utils/log");
const ExcelJS = require("exceljs");
const { addReportHeader } = require("../../../../utils/report-header");

const get_stock_adjustment_report = async (request, res) => {
      try {
            let data = await get_stock_adjustment_data(request);
            if (!data || data.length === 0) {
                  log.info("No Stock Adjustment report Found");
                  return res.status(404).json({
                        code: 404,
                        message: "No Stock Adjustment report Found",
                        data: null,
                  });
            }
            const buffer = await generate_stock_adjustment_xlsx(data);
            const timestamp = Date.now();
            const file_name = `stock_adjustment_report_${timestamp}.xlsx`;

            log.info(`Download stock adjustment report - [${file_name}]`);

            res
                  .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                  .set("Content-Disposition", `attachment; filename="${file_name}"`)
                  .set("X-Filename", file_name)
                  .set("Content-Length", buffer.length)
                  .send(buffer);

      } catch (error) {
            console.error("Error fetching stock adjustment report:", error);
            res.status(500).json({ error: "Internal server error" });
      }
}

const get_stock_adjustment_data = async (request) => {
      let data = null;
      try {
            const payload = request.body;
            const values = [];
            let query = `
                  SELECT
                  to_char(sa.created_on, 'DD/MM/YYYY HH24:MI') AS adjusted_on,
                  p.name AS product_name,
                  p.sku,
                  c.name AS category_name,
                  i.batch_code,
                  sa.adjustment_type,
                  sa.quantity,
                  sa.quantity_before,
                  sa.quantity_after,
                  sa.cost_price,
                  (sa.quantity * sa.cost_price) AS adjustment_value,
                  sa.reason,
                  sa.notes,
                  sa.created_by
                  FROM ${TABLE.STOCK_ADJUSTMENT} sa
                  LEFT JOIN ${TABLE.PRODUCT} p ON p.oid = sa.product_oid
                  LEFT JOIN ${TABLE.INVENTORY} i ON i.oid = sa.inventory_oid
                  LEFT JOIN ${TABLE.CATEGORIES} c ON c.oid = p.category_oid
                  WHERE 1 = 1`;

            // FILTER: PRODUCT
            if (payload.product_oid && payload.product_oid.trim() !== "" && payload.product_oid.trim().toLowerCase() !== "null") {
                  query += ` AND sa.product_oid = $${values.length + 1}`;
                  values.push(payload.product_oid);
            }

            // FILTER: DATE RANGE - the range picker posts [start, end]
            if (Array.isArray(payload.date_range) && payload.date_range.length === 2 && payload.date_range[0] && payload.date_range[1]) {
                  query += ` AND sa.created_on >= $${values.length + 1} AND sa.created_on < ($${values.length + 2}::date + INTERVAL '1 day')`;
                  values.push(payload.date_range[0], payload.date_range[1]);
            }

            query += ` ORDER BY sa.created_on DESC`;

            const sql = { text: query, values };

            data = await get_data(sql);
      } catch (err) {
            log.error(`An exception occurred while getting stock adjustment report information: ${err?.message}`);
            throw err;
      }
      return data;
}

const generate_stock_adjustment_xlsx = async (data) => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Stock Adjustment");

      const titles = [
            "Adjusted On",
            "Product Name",
            "SKU",
            "Category",
            "Batch Code",
            "Type",
            "Quantity",
            "Qty Before",
            "Qty After",
            "Unit Cost",
            "Adjustment Value",
            "Reason",
            "Notes",
            "Adjusted By",
      ];

      // Add report header (logo + company info + title)
      addReportHeader(sheet, "Stock Adjustment Report", titles.length);

      // Add column titles (bold)
      const headerRowIndex = 5; // Titles go on row 5
      sheet.addRow(titles);
      sheet.getRow(headerRowIndex).font = { bold: true };

      // Add data rows
      data.forEach(r => {
            sheet.addRow([
                  r.adjusted_on,
                  r.product_name,
                  r.sku,
                  r.category_name,
                  r.batch_code,
                  r.adjustment_type === 'increase' ? "Increase" : "Decrease",
                  Number(r.quantity),
                  Number(r.quantity_before),
                  Number(r.quantity_after),
                  r.cost_price === null ? "" : Number(r.cost_price),
                  r.adjustment_value === null ? "" : Number(r.adjustment_value),
                  r.reason,
                  r.notes,
                  r.created_by,
            ]);
      });

      // Auto-size columns
      sheet.columns.forEach(col => {
            let max = 0;
            col.eachCell({ includeEmpty: true }, cell => {
                  max = Math.max(max, (cell.value?.toString().length || 0) + 2);
            });
            col.width = Math.min(max, 40);
      });

      return workbook.xlsx.writeBuffer();
};

module.exports = get_stock_adjustment_report;
