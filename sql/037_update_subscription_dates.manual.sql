-- PowerGym Management - Manual subscription date correction
-- Target: MySQL 8+
--
-- This is an operational script, not a migration. Edit only the INSERT block
-- below, then execute the complete file against the intended database.
-- Use YYYY-MM-DD dates. plan_name must be NULL when the member has one
-- subscription; it is required when the member has more than one.

SET NAMES utf8mb4;

DROP TEMPORARY TABLE IF EXISTS subscription_date_updates_input;
CREATE TEMPORARY TABLE subscription_date_updates_input (
  input_id       INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_name    VARCHAR(201) NOT NULL,
  new_start_date DATE         NOT NULL,
  new_end_date   DATE         NOT NULL,
  plan_name      VARCHAR(120) NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- INPUT: add one row per subscription to correct.
-- ---------------------------------------------------------------------------
INSERT INTO subscription_date_updates_input
  (member_name, new_start_date, new_end_date, plan_name)
VALUES
  ('MEMBER FULL NAME', '2026-08-01', '2026-08-31', NULL);
-- Example when the member has more than one subscription:
-- ('MEMBER FULL NAME', '2026-09-01', '2026-09-30', 'Monthly Plan');

DELIMITER $$

DROP PROCEDURE IF EXISTS apply_subscription_date_updates$$
CREATE PROCEDURE apply_subscription_date_updates()
BEGIN
  DECLARE v_done                  BOOLEAN DEFAULT FALSE;
  DECLARE v_input_id              INT;
  DECLARE v_member_name           VARCHAR(201);
  DECLARE v_new_start_date        DATE;
  DECLARE v_new_end_date          DATE;
  DECLARE v_plan_name             VARCHAR(120);
  DECLARE v_member_count          INT DEFAULT 0;
  DECLARE v_member_id             VARCHAR(255);
  DECLARE v_subscription_count    INT DEFAULT 0;
  DECLARE v_v2_count              INT DEFAULT 0;
  DECLARE v_target_count          INT DEFAULT 0;
  DECLARE v_subscription_id       VARCHAR(64);
  DECLARE v_old_start_date        DATE;
  DECLARE v_old_end_date          DATE;
  DECLARE v_stored_plan_name      VARCHAR(120);
  DECLARE v_period_count          INT DEFAULT 0;
  DECLARE v_first_period_number   INT;
  DECLARE v_last_period_number    INT;
  DECLARE v_first_period_end      DATE;
  DECLARE v_last_period_start     DATE;
  DECLARE v_max_members           INT DEFAULT 1;
  DECLARE v_first_cycle_number    INT;
  DECLARE v_last_cycle_number     INT;
  DECLARE v_first_cycle_end       DATE;
  DECLARE v_last_cycle_start      DATE;
  DECLARE v_message               VARCHAR(500);

  DECLARE input_cursor CURSOR FOR
    SELECT input_id, TRIM(member_name), new_start_date, new_end_date,
           NULLIF(TRIM(plan_name), '')
      FROM subscription_date_updates_input
     ORDER BY input_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF NOT EXISTS (SELECT 1 FROM subscription_date_updates_input) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No update rows were supplied.';
  END IF;

  START TRANSACTION;
  OPEN input_cursor;

  update_loop: LOOP
    FETCH input_cursor
      INTO v_input_id, v_member_name, v_new_start_date, v_new_end_date, v_plan_name;
    IF v_done THEN
      LEAVE update_loop;
    END IF;

    IF v_member_name = '' THEN
      SET v_message = CONCAT('Input row ', v_input_id, ': member_name is required.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    IF v_new_start_date > v_new_end_date THEN
      SET v_message = CONCAT('Input row ', v_input_id, ': start date must not be after end date.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    SELECT COUNT(*), MIN(id)
      INTO v_member_count, v_member_id
      FROM members
     WHERE TRIM(CONCAT_WS(' ', first_name, last_name)) = v_member_name;

    IF v_member_count = 0 THEN
      SET v_message = CONCAT('Input row ', v_input_id, ': member not found: ', v_member_name);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    ELSEIF v_member_count > 1 THEN
      SET v_message = CONCAT('Input row ', v_input_id, ': duplicate member name; use a unique identifier: ', v_member_name);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    SELECT COUNT(*)
      INTO v_subscription_count
      FROM member_subscriptions
     WHERE member_id = v_member_id;

    -- A member can be stored exclusively in the V2 contractual model.
    -- Only holder-owned contracts are eligible: changing a beneficiary by
    -- name must never modify another member's group contract.
    IF v_subscription_count = 0 THEN
      SELECT COUNT(*)
        INTO v_v2_count
        FROM subscriptions
       WHERE holder_member_id = v_member_id;

      IF v_v2_count = 0 THEN
        SET v_message = CONCAT('Input row ', v_input_id, ': member has no holder-owned legacy or V2 subscriptions: ', v_member_name);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
      ELSEIF v_v2_count > 1 AND v_plan_name IS NULL THEN
        SET v_message = CONCAT('Input row ', v_input_id, ': plan_name is required because the member has multiple V2 subscriptions.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
      END IF;

      IF v_plan_name IS NULL THEN
        SELECT COUNT(*), MIN(id)
          INTO v_target_count, v_subscription_id
          FROM subscriptions
         WHERE holder_member_id = v_member_id;
      ELSE
        SELECT COUNT(*), MIN(s.id)
          INTO v_target_count, v_subscription_id
          FROM subscriptions s
          JOIN plan_versions pv ON pv.id = s.plan_version_id
         WHERE s.holder_member_id = v_member_id
           AND pv.name = v_plan_name;
      END IF;

      IF v_target_count = 0 THEN
        SET v_message = CONCAT('Input row ', v_input_id, ': no V2 subscription matches plan ', COALESCE(v_plan_name, '(not supplied)'), '.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
      ELSEIF v_target_count > 1 THEN
        SET v_message = CONCAT('Input row ', v_input_id, ': plan name matches multiple V2 subscriptions; use a unique plan name.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
      END IF;

      SELECT s.start_date, s.end_date, pv.name, s.max_members
        INTO v_old_start_date, v_old_end_date, v_stored_plan_name, v_max_members
        FROM subscriptions s
        JOIN plan_versions pv ON pv.id = s.plan_version_id
       WHERE s.id = v_subscription_id
       FOR UPDATE;

      -- Every affiliation must remain inside the corrected contract range.
      IF EXISTS (
        SELECT 1
          FROM affiliations a
         WHERE a.subscription_id = v_subscription_id
           AND GREATEST(
                 CASE WHEN a.start_date = v_old_start_date THEN v_new_start_date ELSE a.start_date END,
                 v_new_start_date
               ) > LEAST(
                 CASE WHEN a.end_date = v_old_end_date THEN v_new_end_date ELSE a.end_date END,
                 v_new_end_date
               )
      ) THEN
        SET v_message = CONCAT('Input row ', v_input_id, ': corrected dates would invalidate a V2 beneficiary affiliation.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
      END IF;

      SELECT COUNT(*), MIN(period_number), MAX(period_number)
        INTO v_period_count, v_first_period_number, v_last_period_number
        FROM subscription_periods_v2
       WHERE subscription_id = v_subscription_id;

      IF v_period_count > 0 THEN
        SELECT end_date INTO v_first_period_end
          FROM subscription_periods_v2
         WHERE subscription_id = v_subscription_id
           AND period_number = v_first_period_number
         FOR UPDATE;
        SELECT start_date INTO v_last_period_start
          FROM subscription_periods_v2
         WHERE subscription_id = v_subscription_id
           AND period_number = v_last_period_number
         FOR UPDATE;
        IF v_new_start_date > v_first_period_end OR v_new_end_date < v_last_period_start THEN
          SET v_message = CONCAT('Input row ', v_input_id, ': corrected dates conflict with existing V2 periods.');
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
        END IF;
        UPDATE subscription_periods_v2
           SET start_date = v_new_start_date,
               expected_payment_date = GREATEST(expected_payment_date, v_new_start_date)
         WHERE subscription_id = v_subscription_id
           AND period_number = v_first_period_number;
        UPDATE subscription_periods_v2
           SET end_date = v_new_end_date,
               expected_payment_date = LEAST(expected_payment_date, v_new_end_date)
         WHERE subscription_id = v_subscription_id
           AND period_number = v_last_period_number;
      END IF;

      SELECT COUNT(*), MIN(cycle_number), MAX(cycle_number)
        INTO v_target_count, v_first_cycle_number, v_last_cycle_number
        FROM subscription_cycles
       WHERE subscription_id = v_subscription_id;

      IF v_target_count > 0 THEN
        SELECT end_date INTO v_first_cycle_end
          FROM subscription_cycles
         WHERE subscription_id = v_subscription_id
           AND cycle_number = v_first_cycle_number
         FOR UPDATE;
        SELECT start_date INTO v_last_cycle_start
          FROM subscription_cycles
         WHERE subscription_id = v_subscription_id
           AND cycle_number = v_last_cycle_number
         FOR UPDATE;
        IF v_new_start_date > v_first_cycle_end OR v_new_end_date < v_last_cycle_start THEN
          SET v_message = CONCAT('Input row ', v_input_id, ': corrected dates conflict with existing subscription cycles.');
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
        END IF;
        UPDATE subscription_cycles
           SET start_date = v_new_start_date
         WHERE subscription_id = v_subscription_id
           AND cycle_number = v_first_cycle_number;
        UPDATE subscription_cycles
           SET end_date = v_new_end_date
         WHERE subscription_id = v_subscription_id
           AND cycle_number = v_last_cycle_number;
      END IF;

      UPDATE affiliations
         SET start_date = GREATEST(
               CASE WHEN start_date = v_old_start_date THEN v_new_start_date ELSE start_date END,
               v_new_start_date
             ),
             end_date = LEAST(
               CASE WHEN end_date = v_old_end_date THEN v_new_end_date ELSE end_date END,
               v_new_end_date
             ),
             version = version + 1
       WHERE subscription_id = v_subscription_id;

      UPDATE subscriptions
         SET start_date = v_new_start_date,
             end_date = v_new_end_date,
             version = version + 1
       WHERE id = v_subscription_id;

      -- Keep a migrated legacy source row synchronized when one exists.
      UPDATE member_subscriptions ms
      JOIN subscriptions s ON s.legacy_subscription_id = ms.id
         SET ms.start_date = v_new_start_date,
             ms.end_date = v_new_end_date
       WHERE s.id = v_subscription_id;

      INSERT INTO domain_audit_events (
        id, entity_type, entity_id, event_type, actor_id, correlation_id,
        before_state, after_state, reason
      ) VALUES (
        UUID(), 'subscription', v_subscription_id,
        'subscription_dates_corrected', 'manual_sql',
        CONCAT('manual-date-correction-', UUID()),
        JSON_OBJECT('member_id', v_member_id, 'member_name', v_member_name,
          'plan_name', v_stored_plan_name, 'start_date', DATE_FORMAT(v_old_start_date, '%Y-%m-%d'),
          'end_date', DATE_FORMAT(v_old_end_date, '%Y-%m-%d'), 'model', 'v2', 'max_members', v_max_members),
        JSON_OBJECT('member_id', v_member_id, 'member_name', v_member_name,
          'plan_name', v_stored_plan_name, 'start_date', DATE_FORMAT(v_new_start_date, '%Y-%m-%d'),
          'end_date', DATE_FORMAT(v_new_end_date, '%Y-%m-%d'), 'model', 'v2', 'max_members', v_max_members),
        'Manual correction of V2 subscription start and end dates'
      );

      ITERATE update_loop;
    ELSEIF v_subscription_count > 1 AND v_plan_name IS NULL THEN
      SET v_message = CONCAT('Input row ', v_input_id, ': plan_name is required because the member has multiple subscriptions.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    IF v_plan_name IS NULL THEN
      SELECT COUNT(*), MIN(id)
        INTO v_target_count, v_subscription_id
        FROM member_subscriptions
       WHERE member_id = v_member_id;
    ELSE
      SELECT COUNT(*), MIN(ms.id)
        INTO v_target_count, v_subscription_id
        FROM member_subscriptions ms
        LEFT JOIN subscription_plans sp ON sp.id = ms.plan_id
       WHERE ms.member_id = v_member_id
         AND (ms.plan_name = v_plan_name OR sp.name = v_plan_name);
    END IF;

    IF v_target_count = 0 THEN
      SET v_message = CONCAT('Input row ', v_input_id, ': no subscription matches plan ', COALESCE(v_plan_name, '(not supplied)'), '.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    ELSEIF v_target_count > 1 THEN
      SET v_message = CONCAT('Input row ', v_input_id, ': plan name still matches multiple subscriptions; use the subscription id instead.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock the selected subscription and preserve its original values.
    SELECT start_date, end_date, plan_name
      INTO v_old_start_date, v_old_end_date, v_stored_plan_name
      FROM member_subscriptions
     WHERE id = v_subscription_id
     FOR UPDATE;

    -- If V2 contractual periods exist, only their outer limits are changed.
    -- This preserves intermediate periods and their immutable numbering.
    SELECT COUNT(*), MIN(period_number), MAX(period_number)
      INTO v_period_count, v_first_period_number, v_last_period_number
      FROM subscription_periods_v2
     WHERE subscription_id = v_subscription_id;

    IF v_period_count > 0 THEN
      SELECT end_date
        INTO v_first_period_end
        FROM subscription_periods_v2
       WHERE subscription_id = v_subscription_id
         AND period_number = v_first_period_number
       FOR UPDATE;

      SELECT start_date
        INTO v_last_period_start
        FROM subscription_periods_v2
       WHERE subscription_id = v_subscription_id
         AND period_number = v_last_period_number
       FOR UPDATE;

      IF v_new_start_date > v_first_period_end THEN
        SET v_message = CONCAT('Input row ', v_input_id, ': new start date is after the end of the first V2 period.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
      END IF;
      IF v_new_end_date < v_last_period_start THEN
        SET v_message = CONCAT('Input row ', v_input_id, ': new end date is before the start of the last V2 period.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
      END IF;

      UPDATE subscription_periods_v2
         SET start_date = v_new_start_date,
             expected_payment_date = GREATEST(expected_payment_date, v_new_start_date)
       WHERE subscription_id = v_subscription_id
         AND period_number = v_first_period_number;

      UPDATE subscription_periods_v2
         SET end_date = v_new_end_date,
             expected_payment_date = LEAST(expected_payment_date, v_new_end_date)
       WHERE subscription_id = v_subscription_id
         AND period_number = v_last_period_number;
    END IF;

    UPDATE member_subscriptions
       SET start_date = v_new_start_date,
           end_date = v_new_end_date
     WHERE id = v_subscription_id;

    INSERT INTO domain_audit_events (
      id, entity_type, entity_id, event_type, actor_id, correlation_id,
      before_state, after_state, reason
    ) VALUES (
      UUID(), 'member_subscription', v_subscription_id,
      'subscription_dates_corrected', 'manual_sql',
      CONCAT('manual-date-correction-', UUID()),
      JSON_OBJECT(
        'member_id', v_member_id,
        'member_name', v_member_name,
        'plan_name', v_stored_plan_name,
        'start_date', DATE_FORMAT(v_old_start_date, '%Y-%m-%d'),
        'end_date', DATE_FORMAT(v_old_end_date, '%Y-%m-%d')
      ),
      JSON_OBJECT(
        'member_id', v_member_id,
        'member_name', v_member_name,
        'plan_name', v_stored_plan_name,
        'start_date', DATE_FORMAT(v_new_start_date, '%Y-%m-%d'),
        'end_date', DATE_FORMAT(v_new_end_date, '%Y-%m-%d')
      ),
      'Manual correction of subscription start and end dates'
    );
  END LOOP;

  CLOSE input_cursor;
  COMMIT;

  SELECT
    i.input_id,
    i.member_name,
    COALESCE(i.plan_name, ms.plan_name) AS plan_name,
    ms.id AS subscription_id,
    ms.start_date,
    ms.end_date,
    ms.status
  FROM subscription_date_updates_input i
  JOIN members m
    ON TRIM(CONCAT_WS(' ', m.first_name, m.last_name)) = TRIM(i.member_name)
  JOIN member_subscriptions ms
    ON ms.member_id = m.id
   AND (
     (NULLIF(TRIM(i.plan_name), '') IS NULL AND
       (SELECT COUNT(*) FROM member_subscriptions x WHERE x.member_id = m.id) = 1)
     OR ms.plan_name = NULLIF(TRIM(i.plan_name), '')
   )
  ORDER BY i.input_id;

  SELECT
    i.input_id,
    i.member_name,
    pv.name AS plan_name,
    s.id AS subscription_id,
    s.start_date,
    s.end_date,
    s.status,
    'v2' AS subscription_model
  FROM subscription_date_updates_input i
  JOIN members m
    ON TRIM(CONCAT_WS(' ', m.first_name, m.last_name)) = TRIM(i.member_name)
  JOIN subscriptions s ON s.holder_member_id = m.id
  JOIN plan_versions pv ON pv.id = s.plan_version_id
  WHERE NOT EXISTS (
    SELECT 1 FROM member_subscriptions ms WHERE ms.member_id = m.id
  )
    AND (
      (NULLIF(TRIM(i.plan_name), '') IS NULL AND
        (SELECT COUNT(*) FROM subscriptions x WHERE x.holder_member_id = m.id) = 1)
      OR pv.name = NULLIF(TRIM(i.plan_name), '')
    )
  ORDER BY i.input_id;
END$$

CALL apply_subscription_date_updates()$$
DROP PROCEDURE apply_subscription_date_updates$$

DELIMITER ;
