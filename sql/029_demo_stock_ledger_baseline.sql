-- Repair the known demo-data baseline produced for APP-HOODIE-BLK-L.
-- The guard deliberately requires the original demo signature so this
-- migration cannot rewrite a real product or an independently edited ledger.

INSERT INTO warehouse_stock_movements
  (id, product_id, movement_type, quantity_delta, unit_cost, stock_before,
   stock_after, reference_type, reference_id, reason, performed_by, data)
SELECT
  'repair_demo_stock_prod_023_v1',
  product.id,
  'reconciliation',
  0,
  product.cost_price,
  product.stock_quantity,
  product.stock_quantity,
  'data_integrity_repair',
  'demo_stock_baseline_v1',
  'Restore demo stock ledger baseline after zero-quantity invoiced purchase order',
  'system:029_demo_stock_ledger_baseline',
  JSON_OBJECT(
    'demo', TRUE,
    'sku', product.sku,
    'source', '029_demo_stock_ledger_baseline',
    'previousLatestMovement', 'mov_po_003'
  )
FROM warehouse_products product
WHERE product.id = 'prod_023'
  AND product.sku = 'APP-HOODIE-BLK-L'
  AND product.stock_quantity = 38
  AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(product.data, '$.demo')), 'false') = 'true'
  AND NOT EXISTS (
    SELECT 1
    FROM warehouse_stock_movements existing
    WHERE existing.id = 'repair_demo_stock_prod_023_v1'
  )
  AND (
    SELECT latest.id
    FROM warehouse_stock_movements latest
    WHERE latest.product_id = product.id
    ORDER BY latest.created_at DESC, latest.id DESC
    LIMIT 1
  ) = 'mov_po_003'
  AND (
    SELECT latest.quantity_delta
    FROM warehouse_stock_movements latest
    WHERE latest.product_id = product.id
    ORDER BY latest.created_at DESC, latest.id DESC
    LIMIT 1
  ) = 0
  AND (
    SELECT latest.stock_after
    FROM warehouse_stock_movements latest
    WHERE latest.product_id = product.id
    ORDER BY latest.created_at DESC, latest.id DESC
    LIMIT 1
  ) = 0;

INSERT INTO audit_logs (action, details, performed_by)
SELECT
  'WAREHOUSE_DEMO_STOCK_BASELINE_REPAIRED',
  JSON_OBJECT(
    'sku', 'APP-HOODIE-BLK-L',
    'approvedSystemQuantity', 38,
    'repairMovement', 'repair_demo_stock_prod_023_v1',
    'sourceMigration', '029_demo_stock_ledger_baseline'
  ),
  'system:migration'
WHERE EXISTS (
  SELECT 1
  FROM warehouse_stock_movements movement
  WHERE movement.id = 'repair_demo_stock_prod_023_v1'
)
  AND NOT EXISTS (
    SELECT 1
    FROM audit_logs log
    WHERE log.action = 'WAREHOUSE_DEMO_STOCK_BASELINE_REPAIRED'
      AND log.details LIKE '%repair_demo_stock_prod_023_v1%'
  );
