-- =============================================================================
-- OPTIONAL: stop inventory.quantity_available from going negative
-- =============================================================================
-- Not required by Stock Adjustment -- create-stock-adjustment.js already refuses
-- to over-draw a batch. This closes the same hole for sale-confirm and dispose,
-- which both subtract without checking.
--
-- Production currently holds rows that violate this, so the constraint will be
-- rejected until they are corrected. Inspect and fix them first:
--
--   SELECT i.oid, i.batch_code, p.name, i.quantity_available
--   FROM inventory i JOIN product p ON p.oid = i.product_oid
--   WHERE i.quantity_available < 0;
--
-- Decide per row whether the true figure is 0 or something else -- do not blanket
-- UPDATE to 0 without checking the sales behind each batch.
-- =============================================================================

ALTER TABLE inventory
      ADD CONSTRAINT inventory_quantity_available_non_negative
      CHECK (quantity_available >= 0);
