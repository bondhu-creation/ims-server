const { TABLE } = require("../../../../utils/constant");
const { execute_in_transaction } = require("../../../../utils/database");
const { log } = require("../../../../utils/log");
const { v4: uuidv4 } = require('uuid');

const reject = (status_code, message, client_message) => {
      const error = new Error(message);
      error.status_code = status_code;
      error.client_message = client_message;
      return error;
};

const create_stock_adjustment = async (request, res) => {
      let payload = request.body;
      let user_id = request.credentials.user_id;

      try {
            const result = await execute_in_transaction(async (client) => {
                  // Lock the batch for the rest of the transaction. Without this two
                  // concurrent adjustments would both read the same quantity_before
                  // and the second would overwrite the first.
                  const batch_set = await client.query(
                        `SELECT oid, product_oid, batch_code, quantity_available, cost_price
                         FROM ${TABLE.INVENTORY}
                         WHERE oid = $1
                         FOR UPDATE`,
                        [payload.inventory_oid]
                  );

                  if (!batch_set.rows.length) {
                        throw reject(
                              404,
                              `Inventory batch ${payload.inventory_oid} not found`,
                              "The selected batch no longer exists. Please refresh and try again."
                        );
                  }

                  const batch = batch_set.rows[0];
                  const direction = payload.adjustment_type === 'increase' ? 1 : -1;
                  const quantity = Number(payload.quantity);
                  const quantity_before = Number(batch.quantity_available);
                  const quantity_after = quantity_before + (direction * quantity);

                  if (quantity_after < 0) {
                        throw reject(
                              400,
                              `Adjustment would take batch ${batch.batch_code} to ${quantity_after}`,
                              `Cannot decrease by ${quantity}. Batch ${batch.batch_code} only has ${quantity_before} available.`
                        );
                  }

                  const adjustment_oid = uuidv4();

                  await client.query(
                        `INSERT INTO ${TABLE.STOCK_ADJUSTMENT}
                              (oid, inventory_oid, product_oid, adjustment_type, quantity, quantity_before,
                               quantity_after, cost_price, reason, notes, status, created_by)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                        [
                              adjustment_oid,
                              batch.oid,
                              batch.product_oid,
                              payload.adjustment_type,
                              quantity,
                              quantity_before,
                              quantity_after,
                              batch.cost_price,
                              payload.reason,
                              payload.notes,
                              'Approved',
                              user_id
                        ]
                  );

                  // Safe to set the absolute value: we have held the row lock since
                  // the read above, so quantity_after is still accurate here.
                  await client.query(
                        `UPDATE ${TABLE.INVENTORY}
                         SET quantity_available = $1, edited_by = $2, edited_on = clock_timestamp()
                         WHERE oid = $3`,
                        [quantity_after, user_id, batch.oid]
                  );

                  return {
                        oid: adjustment_oid,
                        batch_code: batch.batch_code,
                        quantity_before,
                        quantity_after,
                  };
            });

            log.info(`Stock adjustment ${result.oid} (${payload.adjustment_type} ${payload.quantity}) applied to batch ${result.batch_code}: ${result.quantity_before} -> ${result.quantity_after} by : ${user_id}`);
            return res.status(200).json({
                  code: 200,
                  message: `Stock Adjusted Successfully! Batch ${result.batch_code} now holds ${result.quantity_after}.`,
                  data: result,
            });
      } catch (e) {
            if (e?.status_code) {
                  log.warn(`Stock adjustment rejected for ${user_id} : ${e.message}`);
                  return res.status(e.status_code).json({ code: e.status_code, message: e.client_message });
            }
            log.error(`An exception occurred while creating stock adjustment : ${e?.message}`);
            return res.status(500).json({ code: 500, message: "Something Went Wrong! Please try again later!" });
      }
}

module.exports = create_stock_adjustment
