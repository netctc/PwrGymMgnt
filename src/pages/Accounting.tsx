import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Download, Landmark, Plus, ReceiptText, RefreshCw, Trash2, WalletCards } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { downloadCsv, downloadXlsx, type ExportColumn } from "../lib/exportUtils";
import { financeApi, type FinanceBudget, type FinanceLoan, type FinanceRental, type FinanceSummary, type FinanceTransaction } from "../lib/financeApi";
import { hrPayrollApi, type PayrollRun } from "../lib/hrPayrollApi";
import { warehouseApi, type WarehouseCategory } from "../lib/warehouseApi";
import ConfirmActionDialog from "../components/ConfirmActionDialog";
import EmptyState from "../components/EmptyState";
import InlineAlert from "../components/InlineAlert";
import ScreenReportActions from "../components/ScreenReportActions";
import { usePersistentState } from "../hooks/usePersistentState";
import { validateDateRange } from "../lib/dateRange";

type TransactionForm = {
  type: "income" | "expense" | "transfer";
  category: string;
  amount: number;
  date: string;
  source: string;
  description: string;
  status: string;
};

type LoanForm = {
  lenderName: string;
  principalAmount: number;
  interestRate: number;
  monthlyPayment: number;
  startDate: string;
  endDate: string;
  status: string;
  notes: string;
};

type RentalForm = {
  name: string;
  monthlyCost: number;
  dueDay: number;
  startDate: string;
  endDate: string;
  landlordInfo: string;
  status: string;
  notes: string;
};

type BudgetForm = {
  category: string;
  month: string;
  monthlyTarget: number;
};

const today = new Date().toISOString().slice(0, 10);
const currentMonth = new Date().toISOString().slice(0, 7);

const emptyTransaction: TransactionForm = {
  type: "income",
  category: "Subscription",
  amount: 0,
  date: today,
  source: "Cash",
  description: "",
  status: "posted",
};

const emptyLoan: LoanForm = {
  lenderName: "",
  principalAmount: 0,
  interestRate: 0,
  monthlyPayment: 0,
  startDate: today,
  endDate: "",
  status: "active",
  notes: "",
};

const emptyRental: RentalForm = {
  name: "",
  monthlyCost: 0,
  dueDay: 1,
  startDate: today,
  endDate: "",
  landlordInfo: "",
  status: "active",
  notes: "",
};

const emptyBudget: BudgetForm = {
  category: "Utilities",
  month: currentMonth,
  monthlyTarget: 0,
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

const transactionColumns: ExportColumn<FinanceTransaction>[] = [
  { header: "Date", value: (row) => row.date },
  { header: "Type", value: (row) => row.type },
  { header: "Category", value: (row) => row.category },
  { header: "Amount", value: (row) => row.amount },
  { header: "Source", value: (row) => row.source || "" },
  { header: "Status", value: (row) => row.status },
  { header: "Reference", value: (row) => `${row.referenceType || ""}:${row.referenceId || ""}` },
  { header: "Description", value: (row) => row.description || "" },
];

export default function Accounting() {
  const [loading, setLoading] = useState(false);
  const [filterFrom, setFilterFrom] = usePersistentState("powergym.accounting.filterFrom", monthStart());
  const [filterTo, setFilterTo] = usePersistentState("powergym.accounting.filterTo", today);
  const [typeFilter, setTypeFilter] = usePersistentState("powergym.accounting.typeFilter", "all");
  const [categoryFilter, setCategoryFilter] = usePersistentState("powergym.accounting.categoryFilter", "all");
  const [statusFilter, setStatusFilter] = usePersistentState("powergym.accounting.statusFilter", "all");
  const [minAmountFilter, setMinAmountFilter] = usePersistentState("powergym.accounting.minAmount", "");
  const [maxAmountFilter, setMaxAmountFilter] = usePersistentState("powergym.accounting.maxAmount", "");
  const [exactAmountFilter, setExactAmountFilter] = usePersistentState("powergym.accounting.exactAmount", "");
  const [warehouseCategories, setWarehouseCategories] = useState<WarehouseCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FinanceTransaction | null>(null);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loans, setLoans] = useState<FinanceLoan[]>([]);
  const [rentals, setRentals] = useState<FinanceRental[]>([]);
  const [budgets, setBudgets] = useState<FinanceBudget[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [selectedPayrollRun, setSelectedPayrollRun] = useState("");

  const [transactionForm, setTransactionForm] = useState<TransactionForm>(emptyTransaction);
  const [loanForm, setLoanForm] = useState<LoanForm>(emptyLoan);
  const [rentalForm, setRentalForm] = useState<RentalForm>(emptyRental);
  const [budgetForm, setBudgetForm] = useState<BudgetForm>(emptyBudget);

  const categories = useMemo(() => {
    const set = new Set(transactions.map((tx) => tx.category).filter(Boolean));
    warehouseCategories.filter((item) => item.status !== "archived").forEach((item) => set.add(item.name));
    ["Subscription", "Membership Renewal", "POS Sales", "Cost of Goods Sold", "Inventory Purchase", "Class", "Payroll", "Rent", "Utilities", "Maintenance", "Equipment", "Loan", "Other"].forEach((item) => set.add(item));
    return Array.from(set).sort();
  }, [transactions, warehouseCategories]);

  const dateRangeValidation = useMemo(
    () => validateDateRange(filterFrom, filterTo, { maxDays: 366 }),
    [filterFrom, filterTo],
  );

  const amountFilterError = useMemo(() => {
    const min = minAmountFilter ? Number(minAmountFilter) : NaN;
    const max = maxAmountFilter ? Number(maxAmountFilter) : NaN;
    const exact = exactAmountFilter ? Number(exactAmountFilter) : NaN;
    if (minAmountFilter && (!Number.isFinite(min) || min < 0)) return "Minimum amount must be zero or greater.";
    if (maxAmountFilter && (!Number.isFinite(max) || max < 0)) return "Maximum amount must be zero or greater.";
    if (exactAmountFilter && (!Number.isFinite(exact) || exact < 0)) return "Exact amount must be zero or greater.";
    if (!exactAmountFilter && Number.isFinite(min) && Number.isFinite(max) && min > max) return "Minimum amount cannot exceed maximum amount.";
    return "";
  }, [minAmountFilter, maxAmountFilter, exactAmountFilter]);

  async function loadFinanceData() {
    if (!dateRangeValidation.valid) {
      toast.error(dateRangeValidation.message || "Invalid date range");
      return;
    }
    if (amountFilterError) {
      toast.error(amountFilterError);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [summaryData, txData, loanData, rentalData, budgetData, payrollData, categoryData] = await Promise.all([
        financeApi.getSummary({ from: filterFrom, to: filterTo }),
        financeApi.listTransactions({ from: filterFrom, to: filterTo, type: typeFilter, category: categoryFilter, status: statusFilter, minAmount: minAmountFilter, maxAmount: maxAmountFilter, exactAmount: exactAmountFilter }),
        financeApi.listLoans(),
        financeApi.listRentals(),
        financeApi.listBudgets(budgetForm.month),
        hrPayrollApi.listPayrollRuns().catch(() => ({ payrollRuns: [] as PayrollRun[] })),
        warehouseApi.listCategories().catch(() => ({ categories: [] as WarehouseCategory[] })),
      ]);
      setSummary(summaryData);
      setTransactions(txData.transactions);
      setLoans(loanData.loans);
      setRentals(rentalData.rentals);
      setBudgets(budgetData.budgets);
      setPayrollRuns(payrollData.payrollRuns.filter((run) => ["approved", "paid"].includes(run.status)));
      setWarehouseCategories(categoryData.categories);
    } catch (error: any) {
      const message = error.message || "Failed to load accounting data";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFinanceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFrom, filterTo, typeFilter, categoryFilter, statusFilter, minAmountFilter, maxAmountFilter, exactAmountFilter, budgetForm.month]);

  async function submitTransaction(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!transactionForm.category.trim()) {
      setFormError("Transaction category is required.");
      return;
    }
    if (!Number.isFinite(Number(transactionForm.amount)) || Number(transactionForm.amount) <= 0) {
      setFormError("Transaction amount must be greater than zero.");
      return;
    }
    if (!transactionForm.date) {
      setFormError("Transaction date is required.");
      return;
    }
    try {
      await financeApi.createTransaction(transactionForm);
      toast.success("Transaction saved");
      setTransactionForm(emptyTransaction);
      loadFinanceData();
    } catch (error: any) {
      toast.error(error.message || "Failed to save transaction");
    }
  }

  async function submitLoan(event: React.FormEvent) {
    event.preventDefault();
    try {
      await financeApi.createLoan(loanForm);
      toast.success("Loan saved");
      setLoanForm(emptyLoan);
      loadFinanceData();
    } catch (error: any) {
      toast.error(error.message || "Failed to save loan");
    }
  }

  async function submitRental(event: React.FormEvent) {
    event.preventDefault();
    try {
      await financeApi.createRental(rentalForm);
      toast.success("Rental saved");
      setRentalForm(emptyRental);
      loadFinanceData();
    } catch (error: any) {
      toast.error(error.message || "Failed to save rental");
    }
  }

  async function submitBudget(event: React.FormEvent) {
    event.preventDefault();
    try {
      await financeApi.createBudget(budgetForm);
      toast.success("Budget saved");
      loadFinanceData();
    } catch (error: any) {
      toast.error(error.message || "Failed to save budget");
    }
  }

  async function deleteTransaction(transaction: FinanceTransaction) {
    setLoading(true);
    try {
      await financeApi.deleteTransaction(transaction.id);
      toast.success("Transaction deleted");
      setDeleteTarget(null);
      await loadFinanceData();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete transaction");
    } finally {
      setLoading(false);
    }
  }

  async function postPayrollRun() {
    if (!selectedPayrollRun) {
      toast.error("Select an approved or paid payroll run first");
      return;
    }
    try {
      const result = await financeApi.postPayrollRun(selectedPayrollRun, today);
      toast.success(result.alreadyPosted ? "Payroll run was already posted" : "Payroll posted to accounting");
      setSelectedPayrollRun("");
      loadFinanceData();
    } catch (error: any) {
      toast.error(error.message || "Failed to post payroll");
    }
  }

  async function processRecurring() {
    try {
      const result = await financeApi.processRecurring({ month: currentMonth });
      toast.success(`Processed ${result.processedCount} recurring entries`);
      loadFinanceData();
    } catch (error: any) {
      toast.error(error.message || "Failed to process recurring entries");
    }
  }

  function exportCsv() {
    downloadCsv(transactions, transactionColumns, `finance-transactions-filtered-${filterFrom}-${filterTo}.csv`);
  }

  function exportXlsx() {
    downloadXlsx(transactions, transactionColumns, `finance-transactions-filtered-${filterFrom}-${filterTo}.xlsx`, "Transactions");
  }

  async function exportPdf() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("PowerGym Financial Summary", 14, 18);
    doc.setFontSize(10);
    doc.text(`Period: ${filterFrom} to ${filterTo}`, 14, 26);
    doc.text(`Filters: type=${typeFilter}, category=${categoryFilter}, status=${statusFilter}, amount=${exactAmountFilter || `${minAmountFilter || "0"}-${maxAmountFilter || "any"}`}`, 14, 33);
    doc.text(`Income: ${money(summary?.totals.income || 0)}`, 14, 43);
    doc.text(`Expenses: ${money(summary?.totals.expense || 0)}`, 14, 50);
    doc.text(`Net: ${money(summary?.totals.net || 0)}`, 14, 57);
    autoTable(doc, {
      startY: 66,
      head: [["Date", "Type", "Category", "Amount", "Status", "Description"]],
      body: transactions.map((tx) => [tx.date, tx.type, tx.category, money(tx.amount), tx.status, tx.description || ""]),
    });
    doc.save(`financial-summary-${filterFrom}-${filterTo}.pdf`);
  }

  const pendingPayrollRuns = payrollRuns.filter((run) => ["approved", "paid"].includes(run.status));

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounting & Finance</h1>
          <p className="text-muted-foreground">Income, expenses, payroll postings, loans, rentals, budgets, and exports.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadFinanceData} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" /> CSV</Button>
          <Button variant="outline" onClick={exportXlsx}><Download className="mr-2 h-4 w-4" /> Excel</Button>
          <Button onClick={exportPdf} disabled={!dateRangeValidation.valid || transactions.length === 0}><Download className="mr-2 h-4 w-4" /> PDF</Button>
        </div>
      </div>

      {loadError && (
        <InlineAlert title="Accounting data could not be loaded" variant="warning">
          <p>{loadError}</p>
          <p className="mt-1 text-xs">Check your session, API connectivity, and database migrations before retrying.</p>
        </InlineAlert>
      )}

      {!dateRangeValidation.valid && (
        <InlineAlert title="Invalid filter range" variant="error">
          <p>{dateRangeValidation.message}</p>
        </InlineAlert>
      )}

      {amountFilterError && (
        <InlineAlert title="Invalid amount filter" variant="error">
          <p>{amountFilterError}</p>
        </InlineAlert>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-8">
          <div>
            <Label>From</Label>
            <Input type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} />
          </div>
          <div>
            <Label>Type</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          <div>
            <Label>Category</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="posted">Posted</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="void">Void</option>
            </select>
          </div>
          <div><Label>Min amount</Label><Input type="number" min="0" step="0.01" value={minAmountFilter} onChange={(event) => setMinAmountFilter(event.target.value)} disabled={Boolean(exactAmountFilter)} /></div>
          <div><Label>Max amount</Label><Input type="number" min="0" step="0.01" value={maxAmountFilter} onChange={(event) => setMaxAmountFilter(event.target.value)} disabled={Boolean(exactAmountFilter)} /></div>
          <div><Label>Exact amount</Label><Input type="number" min="0" step="0.01" value={exactAmountFilter} onChange={(event) => setExactAmountFilter(event.target.value)} /></div>
          <div className="flex items-end gap-2 md:col-span-8">
            <Button disabled={loading || !dateRangeValidation.valid || Boolean(amountFilterError)} onClick={loadFinanceData}>{loading ? "Loading..." : "Apply filters"}</Button>
            <Button variant="outline" onClick={() => { setFilterFrom(monthStart()); setFilterTo(today); setTypeFilter("all"); setCategoryFilter("all"); setStatusFilter("all"); setMinAmountFilter(""); setMaxAmountFilter(""); setExactAmountFilter(""); }}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Income</CardTitle>
            <WalletCards className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{money(summary?.totals.income || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses</CardTitle>
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{money(summary?.totals.expense || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{money(summary?.totals.net || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Loans / Rentals</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(summary?.totals.activeLoans || 0)}</div>
            <p className="text-xs text-muted-foreground">Monthly rentals: {money(summary?.totals.monthlyRentals || 0)}</p>
          </CardContent>
        </Card>
      </div>

      <ScreenReportActions
        reportIds={['finance-transactions']}
        params={{ type: typeFilter, category: categoryFilter, status: statusFilter, minAmount: minAmountFilter, maxAmount: maxAmountFilter, exactAmount: exactAmountFilter }}
        title="Finance screen PDFs"
        description="Download the finance transaction PDF using the active ledger filters."
        defaultFrom={filterFrom}
        defaultTo={filterTo}
      />

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="payroll">Payroll Posting</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="rentals">Rentals</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Transaction</CardTitle>
              <CardDescription>Record manual income, expense, or transfer transactions.</CardDescription>
            </CardHeader>
            <CardContent>
              {formError && (
                <div className="mb-4">
                  <InlineAlert title="Transaction needs attention" variant="error">{formError}</InlineAlert>
                </div>
              )}
              <form className="grid gap-4 md:grid-cols-6" onSubmit={submitTransaction}>
                <div>
                  <Label>Type</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={transactionForm.type} onChange={(event) => setTransactionForm({ ...transactionForm, type: event.target.value as TransactionForm["type"] })}>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Input value={transactionForm.category} onChange={(event) => setTransactionForm({ ...transactionForm, category: event.target.value })} list="finance-categories" required />
                  <datalist id="finance-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input type="number" min="0" step="0.01" value={transactionForm.amount} onChange={(event) => setTransactionForm({ ...transactionForm, amount: Number(event.target.value) })} required />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={transactionForm.date} onChange={(event) => setTransactionForm({ ...transactionForm, date: event.target.value })} required />
                </div>
                <div>
                  <Label>Source</Label>
                  <Input value={transactionForm.source} onChange={(event) => setTransactionForm({ ...transactionForm, source: event.target.value })} />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" type="submit"><Plus className="mr-2 h-4 w-4" /> Add</Button>
                </div>
                <div className="md:col-span-6">
                  <Label>Description</Label>
                  <Input value={transactionForm.description} onChange={(event) => setTransactionForm({ ...transactionForm, description: event.target.value })} />
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Ledger</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>{tx.date}</TableCell>
                      <TableCell className="capitalize">{tx.type}</TableCell>
                      <TableCell>{tx.category}</TableCell>
                      <TableCell>{money(tx.amount)}</TableCell>
                      <TableCell className="capitalize">{tx.status}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(tx)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8">
                        <EmptyState
                          compact
                          title="No transactions found"
                          description="Try a different date range, clear the type filter, or add the first transaction for this period."
                          actionLabel="Reset filters"
                          onAction={() => { setFilterFrom(monthStart()); setFilterTo(today); setTypeFilter("all"); setCategoryFilter("all"); setStatusFilter("all"); setMinAmountFilter(""); setMaxAmountFilter(""); setExactAmountFilter(""); }}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Post Payroll to Accounting</CardTitle>
              <CardDescription>Approved or paid HR payroll runs can be posted as accounting expenses once. Duplicate posting is prevented by reference ID.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label>Payroll run</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedPayrollRun} onChange={(event) => setSelectedPayrollRun(event.target.value)}>
                  <option value="">Select payroll run</option>
                  {pendingPayrollRuns.map((run) => (
                    <option key={run.id} value={run.id}>{run.runMonth} - {run.status} - {money(run.totalNetPay)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={postPayrollRun}>Post Payroll</Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Payroll Expense Transactions</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Reference</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                <TableBody>
                  {transactions.filter((tx) => tx.referenceType === "payroll_run" || tx.category === "Payroll").map((tx) => (
                    <TableRow key={tx.id}><TableCell>{tx.date}</TableCell><TableCell>{money(tx.amount)}</TableCell><TableCell>{tx.status}</TableCell><TableCell>{tx.referenceId}</TableCell><TableCell>{tx.description}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loans" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Add Loan</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-4" onSubmit={submitLoan}>
                <div><Label>Lender</Label><Input value={loanForm.lenderName} onChange={(event) => setLoanForm({ ...loanForm, lenderName: event.target.value })} required /></div>
                <div><Label>Principal</Label><Input type="number" step="0.01" value={loanForm.principalAmount} onChange={(event) => setLoanForm({ ...loanForm, principalAmount: Number(event.target.value) })} /></div>
                <div><Label>Interest %</Label><Input type="number" step="0.001" value={loanForm.interestRate} onChange={(event) => setLoanForm({ ...loanForm, interestRate: Number(event.target.value) })} /></div>
                <div><Label>Monthly Payment</Label><Input type="number" step="0.01" value={loanForm.monthlyPayment} onChange={(event) => setLoanForm({ ...loanForm, monthlyPayment: Number(event.target.value) })} /></div>
                <div><Label>Start</Label><Input type="date" value={loanForm.startDate} onChange={(event) => setLoanForm({ ...loanForm, startDate: event.target.value })} /></div>
                <div><Label>End</Label><Input type="date" value={loanForm.endDate} onChange={(event) => setLoanForm({ ...loanForm, endDate: event.target.value })} /></div>
                <div><Label>Status</Label><Input value={loanForm.status} onChange={(event) => setLoanForm({ ...loanForm, status: event.target.value })} /></div>
                <div className="flex items-end"><Button className="w-full" type="submit">Save Loan</Button></div>
              </form>
            </CardContent>
          </Card>
          <Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Lender</TableHead><TableHead>Principal</TableHead><TableHead>Interest</TableHead><TableHead>Monthly</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{loans.map((loan) => <TableRow key={loan.id}><TableCell>{loan.lenderName}</TableCell><TableCell>{money(loan.principalAmount)}</TableCell><TableCell>{loan.interestRate}%</TableCell><TableCell>{money(loan.monthlyPayment)}</TableCell><TableCell>{loan.status}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="rentals" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Add Rental</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-4" onSubmit={submitRental}>
                <div><Label>Name</Label><Input value={rentalForm.name} onChange={(event) => setRentalForm({ ...rentalForm, name: event.target.value })} required /></div>
                <div><Label>Monthly Cost</Label><Input type="number" step="0.01" value={rentalForm.monthlyCost} onChange={(event) => setRentalForm({ ...rentalForm, monthlyCost: Number(event.target.value) })} /></div>
                <div><Label>Due Day</Label><Input type="number" min="1" max="31" value={rentalForm.dueDay} onChange={(event) => setRentalForm({ ...rentalForm, dueDay: Number(event.target.value) })} /></div>
                <div><Label>Status</Label><Input value={rentalForm.status} onChange={(event) => setRentalForm({ ...rentalForm, status: event.target.value })} /></div>
                <div><Label>Start</Label><Input type="date" value={rentalForm.startDate} onChange={(event) => setRentalForm({ ...rentalForm, startDate: event.target.value })} /></div>
                <div><Label>End</Label><Input type="date" value={rentalForm.endDate} onChange={(event) => setRentalForm({ ...rentalForm, endDate: event.target.value })} /></div>
                <div className="md:col-span-2"><Label>Landlord Info</Label><Input value={rentalForm.landlordInfo} onChange={(event) => setRentalForm({ ...rentalForm, landlordInfo: event.target.value })} /></div>
                <div className="md:col-span-4"><Button type="submit">Save Rental</Button></div>
              </form>
            </CardContent>
          </Card>
          <Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Monthly</TableHead><TableHead>Due Day</TableHead><TableHead>End Date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{rentals.map((rental) => <TableRow key={rental.id}><TableCell>{rental.name}</TableCell><TableCell>{money(rental.monthlyCost)}</TableCell><TableCell>{rental.dueDay}</TableCell><TableCell>{rental.endDate}</TableCell><TableCell>{rental.status}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="budgets" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Monthly Budget</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-4" onSubmit={submitBudget}>
                <div><Label>Month</Label><Input type="month" value={budgetForm.month} onChange={(event) => setBudgetForm({ ...budgetForm, month: event.target.value })} /></div>
                <div><Label>Category</Label><Input value={budgetForm.category} onChange={(event) => setBudgetForm({ ...budgetForm, category: event.target.value })} list="finance-categories" /></div>
                <div><Label>Target</Label><Input type="number" step="0.01" value={budgetForm.monthlyTarget} onChange={(event) => setBudgetForm({ ...budgetForm, monthlyTarget: Number(event.target.value) })} /></div>
                <div className="flex items-end"><Button className="w-full" type="submit">Save Budget</Button></div>
              </form>
            </CardContent>
          </Card>
          <Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Month</TableHead><TableHead>Target</TableHead><TableHead>Actual</TableHead><TableHead>Variance</TableHead></TableRow></TableHeader><TableBody>{budgets.map((budget) => <TableRow key={budget.id}><TableCell>{budget.category}</TableCell><TableCell>{budget.month}</TableCell><TableCell>{money(budget.monthlyTarget)}</TableCell><TableCell>{money(budget.actualAmount)}</TableCell><TableCell>{money(budget.variance)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Category Breakdown</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Type</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
                  <TableBody>{summary?.byCategory.map((item) => <TableRow key={`${item.type}-${item.category}`}><TableCell>{item.category}</TableCell><TableCell>{item.type}</TableCell><TableCell>{money(item.total)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Monthly Trend</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Income</TableHead><TableHead>Expense</TableHead><TableHead>Net</TableHead></TableRow></TableHeader>
                  <TableBody>{summary?.byMonth.map((item) => <TableRow key={item.month}><TableCell>{item.month}</TableCell><TableCell>{money(item.income)}</TableCell><TableCell>{money(item.expense)}</TableCell><TableCell>{money(item.net)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Recurring Processing</CardTitle><CardDescription>Processes enabled recurring finance entries for the current month.</CardDescription></CardHeader>
            <CardContent><Button onClick={processRecurring}>Process recurring entries</Button></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete transaction?"
        description={`This will permanently delete the ${deleteTarget?.type || ''} transaction for ${deleteTarget ? money(deleteTarget.amount) : ''}. This action cannot be undone.`}
        confirmLabel="Delete transaction"
        confirmVariant="destructive"
        busy={loading}
        onConfirm={async () => { if (deleteTarget) await deleteTransaction(deleteTarget); }}
      />
    </div>
  );
}
