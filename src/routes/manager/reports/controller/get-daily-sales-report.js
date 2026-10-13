const { log } = require("../../../../utils/log");
const { get_daily_sales_data, generate_daily_sales_xlsx } = require("../../../../utils/daily-sales-report");

const get_daily_sales_report = async (request, res) => {
      try {
            const report_date = request.body.report_date;
            const data = await get_daily_sales_data(report_date);
            if (data.invoices.length === 0 && data.returns.length === 0) {
                  log.info(`No sales or returns found for ${report_date}`);
                  return res.status(404).json({
                        code: 404,
                        message: "No Sales Found",
                        data: null,
                  });
            }
            const buffer = await generate_daily_sales_xlsx(report_date, data);
            const file_name = `daily_sales_report_${report_date}.xlsx`;

            log.info(`Download daily sales report - [${file_name}]`);

            res
                  .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                  .set("Content-Disposition", `attachment; filename="${file_name}"`)
                  .set("X-Filename", file_name)
                  .set("Content-Length", buffer.length)
                  .send(buffer);

      } catch (error) {
            log.error(`An exception occurred while getting daily sales report: ${error?.message}`);
            res.status(500).json({ error: "Internal server error" });
      }
}

module.exports = get_daily_sales_report;
