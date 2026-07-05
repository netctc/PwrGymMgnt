-- PowerGym Management - Delivery 5 HR and Payroll schema

CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(64) PRIMARY KEY,
  employee_code VARCHAR(64) UNIQUE NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  department VARCHAR(120) NULL,
  job_title VARCHAR(120) NULL,
  employment_status VARCHAR(32) NOT NULL DEFAULT 'active',
  contract_type VARCHAR(80) NOT NULL DEFAULT 'full-time',
  hire_date DATE NULL,
  base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  pay_frequency VARCHAR(32) NOT NULL DEFAULT 'monthly',
  allowance_housing DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowance_transport DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowance_medical DECIMAL(12,2) NOT NULL DEFAULT 0,
  deduction_tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  deduction_insurance DECIMAL(12,2) NOT NULL DEFAULT 0,
  vacation_days_remaining DECIMAL(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  data JSON NULL,
  INDEX idx_employees_status (employment_status),
  INDEX idx_employees_department (department),
  INDEX idx_employees_email (email)
);

CREATE TABLE IF NOT EXISTS employee_attendance (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  employee_name VARCHAR(180) NULL,
  work_date DATE NOT NULL,
  check_in VARCHAR(16) NULL,
  check_out VARCHAR(16) NULL,
  hours_worked DECIMAL(6,2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'present',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data JSON NULL,
  UNIQUE KEY uq_attendance_employee_date (employee_id, work_date),
  INDEX idx_attendance_date (work_date),
  INDEX idx_attendance_employee (employee_id),
  CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id VARCHAR(64) PRIMARY KEY,
  run_month CHAR(7) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  employee_count INT NOT NULL DEFAULT 0,
  total_base DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_bonuses DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_net_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by VARCHAR(255) NULL,
  approved_by VARCHAR(255) NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_run_month (run_month),
  INDEX idx_payroll_runs_status (status)
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id VARCHAR(64) PRIMARY KEY,
  payroll_run_id VARCHAR(64) NOT NULL,
  employee_id VARCHAR(64) NOT NULL,
  employee_name VARCHAR(180) NOT NULL,
  department VARCHAR(120) NULL,
  base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  attendance_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  paid_at DATETIME NULL,
  data JSON NULL,
  INDEX idx_payroll_items_run (payroll_run_id),
  INDEX idx_payroll_items_employee (employee_id),
  CONSTRAINT fk_payroll_items_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_items_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
