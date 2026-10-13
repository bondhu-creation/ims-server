const ExcelJS = require("exceljs");
const { TABLE } = require("./constant");
const { get_data } = require("./database");
const { addReportHeader } = require("./report-header");

// Daily sales report, shared by the manager and salesman routes so both download the same file.
//
// A day is matched on created_on::date, the same rule as the invoice lists, so the report
// shows exactly the invoices staff see for that date. Timestamps are stored in UTC, so a
// business day runs until 6 AM Bangladesh time. Sales count on the day they were made and
// refunds on the day they were paid out, so each day's figures match that day's cash drawer.

const BD_TIME = (column) => `to_char(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka', 'HH12:MI AM')`;

const MONEY = "#,##0.00";

const get_daily_sales_data = async (report_date) => {
      const invoices = await get_data({
            text: `
                  SELECT s.oid, s.invoice_no, s.payment_method, s.status, s.total_amount, s.created_by,
                  ${BD_TIME("s.created_on")} AS sold_at,
                  COALESCE(SUM(sd.total), 0) AS items_total
                  FROM ${TABLE.SALES} s
                  LEFT JOIN ${TABLE.SALE_DETAILS} sd ON sd.sales_oid = s.oid
                  WHERE s.status != 'Draft' AND s.created_on::date = $1
                  GROUP BY s.oid, s.invoice_no, s.payment_method, s.status, s.total_amount, s.created_by, s.created_on
                  ORDER BY s.created_on ASC`,
            values: [report_date],
      });

      const lines = await get_data({
            text: `
                  SELECT s.invoice_no, ${BD_TIME("s.created_on")} AS sold_at, s.payment_method, s.status, s.created_by,
                  sd.product_oid, COALESCE(p.name, sd.product_name) AS product_name, p.sku, i.batch_code,
                  sd.quantity, sd.unit_price, COALESCE(sd.discount, 0) AS discount, sd.total
                  FROM ${TABLE.SALES} s
                  INNER JOIN ${TABLE.SALE_DETAILS} sd ON sd.sales_oid = s.oid
                  LEFT JOIN ${TABLE.PRODUCT} p ON p.oid = sd.product_oid
                  LEFT JOIN ${TABLE.INVENTORY} i ON i.oid = sd.inventory_oid
                  WHERE s.status != 'Draft' AND s.created_on::date = $1
                  ORDER BY s.created_on ASC, product_name ASC`,
            values: [report_date],
      });

      const returns = await get_data({
            text: `
                  SELECT pr.oid, pr.invoice_no, ${BD_TIME("pr.created_on")} AS returned_at,
                  to_char(s.created_on, 'DD/MM/YYYY') AS sold_on, s.payment_method,
                  pr.refund_amount, pr.return_reason, pr.created_by,
                  COALESCE(p.name, '') AS product_name, p.sku, i.batch_code, rd.return_quantity
                  FROM ${TABLE.PRODUCT_RETURN} pr
                  LEFT JOIN ${TABLE.SALES} s ON s.oid = pr.sales_oid
                  LEFT JOIN ${TABLE.RETURN_DETAILS} rd ON rd.return_oid = pr.oid
                  LEFT JOIN ${TABLE.PRODUCT} p ON p.oid = rd.product_oid
                  LEFT JOIN ${TABLE.INVENTORY} i ON i.oid = rd.inventory_oid
                  WHERE pr.created_on::date = $1
                  ORDER BY pr.created_on ASC, product_name ASC`,
            values: [report_date],
      });

      return { invoices, lines, returns };
};

// One row per product, batch and price: the same product can sell at different prices across batches.
const group_items = (lines) => {
      const items = new Map();
      lines.forEach(l => {
            const key = `${l.product_oid}|${l.batch_code}|${l.unit_price}`;
            const item = items.get(key) || {
                  product_name: l.product_name,
                  sku: l.sku,
                  batch_code: l.batch_code,
                  unit_price: Number(l.unit_price),
                  quantity: 0,
                  discount: 0,
                  total: 0,
            };
            item.quantity += Number(l.quantity);
            item.discount += Number(l.quantity) * Number(l.discount);
            item.total += Number(l.total);
            items.set(key, item);
      });
      return [...items.values()].sort((a, b) => a.product_name.localeCompare(b.product_name));
};

const sum = (rows, pick) => rows.reduce((total, r) => total + Number(pick(r) || 0), 0);

// Refund amount is stored once per return, not per returned product.
const unique_returns = (returns) => [...new Map(returns.map(r => [r.oid, r])).values()];

const format_date = (report_date) => report_date.split("-").reverse().join("/");

const add_titles = (sheet, titles) => {
      const row = sheet.addRow(titles);
      row.font = { bold: true };
      row.eachCell(cell => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4E2" } };
            cell.border = { bottom: { style: "thin" } };
      });
};

const add_total_row = (sheet, values) => {
      const row = sheet.addRow(values);
      row.font = { bold: true };
      row.eachCell(cell => (cell.border = { top: { style: "thin" } }));
};

const set_widths = (sheet, widths) => {
      widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
};

const build_summary_sheet = (workbook, report_date, data) => {
      const sheet = workbook.addWorksheet("Summary");
      addReportHeader(sheet, `Daily Sales Report - ${format_date(report_date)}`, 3);
      set_widths(sheet, [34, 22, 60]);

      const { invoices, lines, returns } = data;
      const refunds = unique_returns(returns);
      const invoice_total = (method) => sum(invoices.filter(i => !method || i.payment_method === method), i => i.total_amount);
      const refund_total = (method) => sum(refunds.filter(r => !method || r.payment_method === method), r => r.refund_amount);

      const generated_at = new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).replace(",", "").toUpperCase();

      const section = (title) => {
            sheet.addRow([]);
            const row = sheet.addRow([title]);
            row.font = { bold: true, size: 12 };
      };
      const line = (label, value, note = "", bold = false) => {
            const row = sheet.addRow([label, value, note]);
            if (/amount|sales|discount|refunds|cash|bkash|total|difference/i.test(label)) {
                  row.getCell(2).numFmt = MONEY;
            }
            if (bold) row.font = { bold: true };
            return row;
      };

      line("Report Date", format_date(report_date));
      line("Generated At", generated_at);

      section("Sales");
      line("Invoices", invoices.length);
      line("Items Sold (pcs)", sum(lines, l => l.quantity));
      line("Gross Amount", sum(lines, l => Number(l.quantity) * Number(l.unit_price)), "Quantity x unit price, before discount");
      line("Discount", sum(lines, l => Number(l.quantity) * Number(l.discount)));
      line("Net Sales (invoice total)", invoice_total(), "", true);
      line("  Cash Sales", invoice_total("cash"));
      line("  bKash Sales", invoice_total("bkash"));

      section("Refunds Paid Today");
      line("Returns", refunds.length, "Includes returns of sales made on earlier days");
      line("  Cash Refunds", refund_total("cash"));
      line("  bKash Refunds", refund_total("bkash"));

      section("Closing");
      const cash = line("Expected Cash in Drawer", invoice_total("cash") - refund_total("cash"), "Cash sales - cash refunds", true);
      cash.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      line("Expected bKash Received", invoice_total("bkash") - refund_total("bkash"), "bKash sales - bKash refunds", true);

      // An invoice whose total differs from the sum of its products would make the item-wise
      // sheet disagree with the cash, so it is named here instead of being hidden.
      const mismatched = invoices.filter(i => Number(i.total_amount) !== Number(i.items_total));
      if (mismatched.length > 0) {
            section("Check");
            line("Products Total (Item-wise sheet)", sum(lines, l => l.total), "Gross amount - discount");
            line("Net Sales (invoice total)", invoice_total(), "What the invoices charged, used for the cash above");
            mismatched.forEach(i => {
                  const row = line(
                        `Invoice ${i.invoice_no} difference`,
                        Number(i.total_amount) - Number(i.items_total),
                        `Invoice total ${i.total_amount} but its products add up to ${i.items_total}`
                  );
                  row.font = { color: { argb: "FFC0124F" } };
            });
      }

      return sheet;
};

const build_items_sheet = (workbook, report_date, lines) => {
      const sheet = workbook.addWorksheet("Item-wise");
      const titles = ["Product Name", "SKU", "Batch Code", "Unit Price", "Qty Sold", "Discount", "Net Amount"];
      addReportHeader(sheet, `Item-wise Sales - ${format_date(report_date)}`, titles.length);
      add_titles(sheet, titles);

      const items = group_items(lines);
      items.forEach(item => {
            sheet.addRow([item.product_name, item.sku, item.batch_code, item.unit_price, item.quantity, item.discount, item.total]);
      });
      add_total_row(sheet, ["Total", "", "", "", sum(items, i => i.quantity), sum(items, i => i.discount), sum(items, i => i.total)]);

      [4, 6, 7].forEach(col => (sheet.getColumn(col).numFmt = MONEY));
      set_widths(sheet, [40, 16, 16, 14, 10, 14, 16]);
      return sheet;
};

const build_invoices_sheet = (workbook, report_date, lines) => {
      const sheet = workbook.addWorksheet("Invoice-wise");
      const titles = ["Invoice No", "Time", "Product Name", "SKU", "Batch Code", "Qty", "Unit Price", "Discount / pc", "Line Total", "Payment", "Status", "Sold By"];
      addReportHeader(sheet, `Invoice-wise Sales - ${format_date(report_date)}`, titles.length);
      add_titles(sheet, titles);

      lines.forEach(l => {
            sheet.addRow([
                  l.invoice_no,
                  l.sold_at,
                  l.product_name,
                  l.sku,
                  l.batch_code,
                  Number(l.quantity),
                  Number(l.unit_price),
                  Number(l.discount),
                  Number(l.total),
                  l.payment_method === "bkash" ? "bKash" : "Cash",
                  l.status,
                  l.created_by,
            ]);
      });
      add_total_row(sheet, ["Total", "", "", "", "", sum(lines, l => l.quantity), "", "", sum(lines, l => l.total)]);

      [7, 8, 9].forEach(col => (sheet.getColumn(col).numFmt = MONEY));
      sheet.getColumn(10).alignment = { horizontal: "center" };
      set_widths(sheet, [14, 11, 36, 14, 17, 7, 12, 13, 14, 10, 11, 26]);
      return sheet;
};

const build_returns_sheet = (workbook, report_date, returns) => {
      const sheet = workbook.addWorksheet("Returns");
      const titles = ["Invoice No", "Sold On", "Returned At", "Product Name", "SKU", "Batch Code", "Qty Returned", "Refund Amount", "Payment", "Reason", "Returned By"];
      addReportHeader(sheet, `Returns & Refunds - ${format_date(report_date)}`, titles.length);
      add_titles(sheet, titles);

      // The refund belongs to the whole return, so it is shown once, on the return's first product.
      const shown = new Set();
      returns.forEach(r => {
            const first = !shown.has(r.oid);
            shown.add(r.oid);
            sheet.addRow([
                  r.invoice_no,
                  r.sold_on,
                  r.returned_at,
                  r.product_name,
                  r.sku,
                  r.batch_code,
                  r.return_quantity === null ? "" : Number(r.return_quantity),
                  first ? Number(r.refund_amount) : "",
                  r.payment_method === "bkash" ? "bKash" : "Cash",
                  first ? r.return_reason : "",
                  r.created_by,
            ]);
      });
      if (returns.length === 0) {
            sheet.addRow(["No returns on this date"]);
      } else {
            add_total_row(sheet, ["Total", "", "", "", "", "", sum(returns, r => r.return_quantity), sum(unique_returns(returns), r => r.refund_amount)]);
      }

      sheet.getColumn(8).numFmt = MONEY;
      sheet.getColumn(9).alignment = { horizontal: "center" };
      set_widths(sheet, [14, 12, 12, 36, 14, 17, 13, 14, 10, 30, 26]);
      return sheet;
};

const generate_daily_sales_xlsx = async (report_date, data) => {
      const workbook = new ExcelJS.Workbook();
      build_summary_sheet(workbook, report_date, data);
      build_items_sheet(workbook, report_date, data.lines);
      build_invoices_sheet(workbook, report_date, data.lines);
      build_returns_sheet(workbook, report_date, data.returns);
      return workbook.xlsx.writeBuffer();
};

module.exports = { get_daily_sales_data, generate_daily_sales_xlsx };
