-- =============================================================================
-- Stock Adjustment
-- =============================================================================
-- Records every manual increase or decrease of a batch's available stock.
-- The adjustment takes effect on inventory.quantity_available in the same
-- transaction that writes the row here, so the ledger and the stock level can
-- never disagree.
--
-- quantity          - always a positive magnitude
-- adjustment_type   - decides the direction the magnitude is applied in
-- quantity_before   - snapshot taken under a row lock, so the history stays
-- quantity_after      reconstructable even after later movements
--
-- Run against ims_local first, then production at release time:
--   psql -h localhost -p 5433 -U postgres -d ims_local -f src/db/001-stock-adjustment.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS stock_adjustment (
      oid                 varchar      NOT NULL,
      inventory_oid       varchar      NOT NULL,
      product_oid         varchar      NOT NULL,
      adjustment_type     varchar      NOT NULL,
      quantity            numeric      NOT NULL,
      quantity_before     numeric      NOT NULL,
      quantity_after      numeric      NOT NULL,
      cost_price          numeric,
      reason              varchar      NOT NULL,
      notes               text,
      status              varchar      NOT NULL DEFAULT 'Approved',
      created_by          varchar      NOT NULL DEFAULT 'System',
      created_on          timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      edited_by           varchar,
      edited_on           timestamp,
      CONSTRAINT stock_adjustment_pkey PRIMARY KEY (oid),
      CONSTRAINT stock_adjustment_inventory_fkey FOREIGN KEY (inventory_oid) REFERENCES inventory (oid),
      CONSTRAINT stock_adjustment_product_fkey FOREIGN KEY (product_oid) REFERENCES product (oid),
      CONSTRAINT stock_adjustment_type_check CHECK (adjustment_type IN ('increase', 'decrease')),
      CONSTRAINT stock_adjustment_quantity_check CHECK (quantity > 0),
      CONSTRAINT stock_adjustment_after_check CHECK (quantity_after >= 0)
);

CREATE INDEX IF NOT EXISTS stock_adjustment_inventory_idx ON stock_adjustment (inventory_oid);
CREATE INDEX IF NOT EXISTS stock_adjustment_product_idx ON stock_adjustment (product_oid);
CREATE INDEX IF NOT EXISTS stock_adjustment_created_idx ON stock_adjustment (created_on DESC);
