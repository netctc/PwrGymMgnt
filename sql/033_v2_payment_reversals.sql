-- Allow immutable correction events for payments entered in error.
SET @drop_payment_event_type_check = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()
         AND TABLE_NAME = 'invoice_payment_events_v2'
         AND CONSTRAINT_NAME = 'chk_invoice_payment_event_type'
    ),
    'ALTER TABLE invoice_payment_events_v2 DROP CONSTRAINT chk_invoice_payment_event_type',
    'SELECT 1'
  )
);
PREPARE statement FROM @drop_payment_event_type_check;
EXECUTE statement;
DEALLOCATE PREPARE statement;

ALTER TABLE invoice_payment_events_v2
  ADD CONSTRAINT chk_invoice_payment_event_type
  CHECK (event_type IN ('payment', 'waive', 'refund', 'reversal'));
