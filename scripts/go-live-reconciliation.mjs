#!/usr/bin/env node
import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseReconciliationArgs(argv = process.argv.slice(2)) {
  const args = { input: '', template: '', output: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      args.json = true;
      continue;
    }
    const [name, inlineValue] = token.startsWith('--')
      ? token.slice(2).split('=', 2)
      : ['', undefined];
    if (!name) throw new Error(`Unknown option: ${token}`);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (name === 'input') args.input = String(value || '');
    else if (name === 'write-template') args.template = String(value || '');
    else if (name === 'output') args.output = String(value || '');
    else throw new Error(`Unknown option: --${name}`);
  }
  if (args.input && args.template) {
    throw new Error('--input and --write-template cannot be used together.');
  }
  return args;
}

export function evaluateReconciliation(snapshot, baseline) {
  const findings = [];
  if (snapshot.negativeStockCount > 0) {
    findings.push({
      severity: 'critical',
      id: 'negative-stock',
      message: `${snapshot.negativeStockCount} products have negative stock.`,
    });
  }
  if (snapshot.latestMovementMismatchCount > 0) {
    findings.push({
      severity: 'critical',
      id: 'stock-ledger-mismatch',
      message: `${snapshot.latestMovementMismatchCount} products differ from their latest stock movement.`,
    });
  }
  if (!baseline) {
    findings.push({
      severity: 'review',
      id: 'external-baseline-required',
      message: 'Approved accounting balance and signed physical count are required.',
    });
    return { posture: findings.some((item) => item.severity === 'critical') ? 'block' : 'review', findings };
  }

  const approvedBalance = Number(baseline.approvedLedgerBalance);
  if (!Number.isFinite(approvedBalance)) {
    findings.push({
      severity: 'critical',
      id: 'approved-balance-required',
      message: 'approvedLedgerBalance must be a number.',
    });
  } else if (Math.abs(approvedBalance - snapshot.ledgerNetBalance) > 0.01) {
    findings.push({
      severity: 'critical',
      id: 'ledger-balance-difference',
      message: 'The approved accounting balance differs from the posted ledger balance.',
      expected: approvedBalance,
      actual: snapshot.ledgerNetBalance,
    });
  }

  const physicalRows = Array.isArray(baseline.physicalStock) ? baseline.physicalStock : [];
  const physicalBySku = new Map(
    physicalRows.map((row) => [String(row.sku || '').trim(), Number(row.quantity)]),
  );
  for (const product of snapshot.products) {
    if (!physicalBySku.has(product.sku) || !Number.isFinite(physicalBySku.get(product.sku))) {
      findings.push({
        severity: 'critical',
        id: 'physical-count-missing',
        sku: product.sku,
        message: 'Signed physical quantity is missing.',
      });
      continue;
    }
    const physical = physicalBySku.get(product.sku);
    if (Math.abs(physical - product.systemQuantity) > 0.001) {
      findings.push({
        severity: 'critical',
        id: 'physical-stock-difference',
        sku: product.sku,
        expected: physical,
        actual: product.systemQuantity,
        message: 'Physical quantity differs from system stock.',
      });
    }
  }
  return {
    posture: findings.some((item) => item.severity === 'critical') ? 'block' : 'pass',
    findings,
  };
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function writeJson(filePath, value, exclusive = true) {
  const resolved = path.resolve(PROJECT_ROOT, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, {
    flag: exclusive ? 'wx' : 'w',
  });
  return resolved;
}

async function createSnapshot(connection) {
  const [financeRows] = await connection.query(
    `SELECT
       ROUND(COALESCE(SUM(CASE
         WHEN LOWER(type) = 'income' AND status = 'posted' THEN amount
         WHEN LOWER(type) = 'expense' AND status = 'posted' THEN -amount
         ELSE 0
       END), 0), 2) AS ledger_net_balance,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_transactions
     FROM finance_transactions`,
  );
  const [invoiceRows] = await connection.query(
    `SELECT COUNT(*) AS outstanding_invoices,
            ROUND(COALESCE(SUM(total), 0), 2) AS outstanding_amount
       FROM invoices
      WHERE LOWER(status) NOT IN ('paid', 'cancelled', 'void')`,
  );
  const [productRows] = await connection.query(
    `SELECT sku, name, stock_quantity, cost_price
       FROM warehouse_products
      WHERE status = 'active'
      ORDER BY sku`,
  );
  const [mismatchRows] = await connection.query(
    `SELECT COUNT(*) AS mismatch_count
       FROM warehouse_products product
       JOIN (
         SELECT product_id, stock_after,
                ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY created_at DESC, id DESC) AS row_num
           FROM warehouse_stock_movements
       ) movement
         ON movement.product_id = product.id AND movement.row_num = 1
      WHERE ABS(product.stock_quantity - movement.stock_after) > 0.001`,
  );
  const products = productRows.map((row) => ({
    sku: String(row.sku || ''),
    name: String(row.name || ''),
    systemQuantity: Number(row.stock_quantity || 0),
    costPrice: Number(row.cost_price || 0),
  }));
  return {
    ledgerNetBalance: Number(financeRows[0]?.ledger_net_balance || 0),
    pendingTransactions: Number(financeRows[0]?.pending_transactions || 0),
    outstandingInvoices: Number(invoiceRows[0]?.outstanding_invoices || 0),
    outstandingAmount: Number(invoiceRows[0]?.outstanding_amount || 0),
    productCount: products.length,
    stockValue: Math.round(
      products.reduce((total, product) => total + product.systemQuantity * product.costPrice, 0) * 100,
    ) / 100,
    negativeStockCount: products.filter((product) => product.systemQuantity < 0).length,
    latestMovementMismatchCount: Number(mismatchRows[0]?.mismatch_count || 0),
    products,
  };
}

export async function runReconciliation(argv = process.argv.slice(2)) {
  const args = parseReconciliationArgs(argv);
  const config = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(config);
  if (missing.length) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: config.connectTimeout,
  });
  try {
    const snapshot = await createSnapshot(connection);
    if (args.template) {
      const templatePath = writeJson(args.template, {
        approvedLedgerBalance: snapshot.ledgerNetBalance,
        physicalStock: snapshot.products.map((product) => ({
          sku: product.sku,
          name: product.name,
          quantity: product.systemQuantity,
        })),
      });
      console.log(`Reconciliation template: ${templatePath}`);
      console.log('Posture: review');
      return { templatePath, snapshot };
    }
    const baseline = args.input
      ? JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, args.input), 'utf8'))
      : null;
    const assessment = evaluateReconciliation(snapshot, baseline);
    const evidence = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      database: { host: config.host, port: config.port, name: config.database },
      snapshot,
      assessment,
    };
    const outputPath = writeJson(
      args.output || `release-evidence/go-live-reconciliation-${safeTimestamp()}.json`,
      evidence,
    );
    if (args.json) console.log(JSON.stringify(evidence, null, 2));
    else {
      console.log('PowerGym go-live reconciliation');
      console.log('-------------------------------');
      console.log(`Posted ledger balance: ${snapshot.ledgerNetBalance}`);
      console.log(`Outstanding invoices: ${snapshot.outstandingInvoices} (${snapshot.outstandingAmount})`);
      console.log(`Active products: ${snapshot.productCount} | Stock value: ${snapshot.stockValue}`);
      for (const finding of assessment.findings) {
        console.log(`[${finding.severity.toUpperCase()}] ${finding.id}: ${finding.message}`);
      }
      console.log(`Evidence: ${outputPath}`);
      console.log(`Posture: ${assessment.posture}`);
    }
    return { evidence, outputPath };
  } finally {
    await connection.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runReconciliation()
    .then((result) => {
      if (result.evidence?.assessment?.posture === 'block') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(`Reconciliation failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
