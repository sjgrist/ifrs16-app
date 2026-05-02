import { useState, useEffect } from "react";
import { api, type JournalLine } from "../lib/api";
import { useAppStore } from "../lib/store";
import { fmt, downloadBlob, journalsToCSV } from "../lib/utils";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import { EntityMultiSelect } from "../components/ui/EntityMultiSelect";

export function JournalsPage() {
  const { toast } = useToast();
  const { entities, loadEntities } = useAppStore();
  const [journals, setJournals] = useState<JournalLine[]>([]);
  const [reportingCurrency, setReportingCurrencyState] = useState("GBP");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({
    entity_ids: [] as number[],
    year: String(new Date().getFullYear()),
    month: "",
    reporting_currency: "GBP",
  });

  useEffect(() => { loadEntities(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        year: filter.year,
        reporting_currency: filter.reporting_currency,
      };
      if (filter.entity_ids.length > 0) params.entity_ids = filter.entity_ids.join(",");
      if (filter.month) params.month = filter.month;
      const { journals: jls, reportingCurrency: rptCcy } = await api.journals.get(params);
      setJournals(jls);
      setReportingCurrencyState(rptCcy);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };

  const exportCSV = () => {
    const csv = journalsToCSV(journals, reportingCurrency);
    const suffix = `${filter.year}${filter.month ? "-" + filter.month : ""}`;
    downloadBlob(new Blob([csv], { type: "text/csv" }), `journals-${suffix}.csv`);
  };

  const exportXlsx = async () => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Journals");
      const rpt = reportingCurrency;
      ws.columns = [
        { header: "Date",                          key: "date",        width: 12 },
        { header: "Entity",                        key: "entity",      width: 22 },
        { header: "Currency",                      key: "ccy",         width: 10 },
        { header: "Account Code",                  key: "code",        width: 15 },
        { header: "Account Description",           key: "desc",        width: 32 },
        { header: "Debit",                         key: "dr",          width: 14 },
        { header: "Credit",                        key: "cr",          width: 14 },
        { header: `Rpt Debit (${rpt})`,            key: "drRpt",       width: 16 },
        { header: `Rpt Credit (${rpt})`,           key: "crRpt",       width: 16 },
        { header: "Lease Ref",                     key: "ref",         width: 20 },
        { header: "Asset Class",                   key: "cls",         width: 15 },
      ];

      // Style header row
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE55C2E" } };
      headerRow.alignment = { vertical: "middle" };
      ws.autoFilter = { from: "A1", to: "K1" };

      const numFmt = "#,##0.00";
      for (const j of journals) {
        const row = ws.addRow({
          date: j.date,
          entity: j.entityName,
          ccy: j.currency,
          code: j.accountCode,
          desc: j.accountDescription,
          dr: j.debit || "",
          cr: j.credit || "",
          drRpt: j.debitRpt ?? "",
          crRpt: j.creditRpt ?? "",
          ref: j.leaseRef,
          cls: j.assetClass,
        });
        (["dr", "cr", "drRpt", "crRpt"] as const).forEach((key) => {
          const cell = row.getCell(key);
          if (cell.value !== "") cell.numFmt = numFmt;
        });
      }

      const buf = await wb.xlsx.writeBuffer();
      const suffix = `${filter.year}${filter.month ? "-" + filter.month : ""}`;
      downloadBlob(new Blob([buf]), `journals-${suffix}.xlsx`);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  // Group by entity, then by date within each entity
  const byEntity = journals.reduce<Record<string, { entityName: string; lines: JournalLine[] }>>(
    (acc, j) => {
      const key = String(j.entityId);
      if (!acc[key]) acc[key] = { entityName: j.entityName, lines: [] };
      acc[key].lines.push(j);
      return acc;
    },
    {}
  );

  const totalDebit = journals.reduce((s, j) => s + j.debit, 0);
  const totalCredit = journals.reduce((s, j) => s + j.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const rpt = reportingCurrency;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Journal Entries</h1>
        {journals.length > 0 && (
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-secondary">Export CSV</button>
            <button onClick={exportXlsx} className="btn-secondary">Export XLSX</button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex gap-4 flex-wrap items-end">
        <div>
          <label className="label">Entities</label>
          <EntityMultiSelect
            entities={entities}
            value={filter.entity_ids}
            onChange={(ids) => setFilter((f) => ({ ...f, entity_ids: ids }))}
          />
        </div>
        <div>
          <label className="label">Year</label>
          <input type="number" className="input w-24" value={filter.year}
            onChange={(e) => setFilter((f) => ({ ...f, year: e.target.value }))} />
        </div>
        <div>
          <label className="label">Month (optional)</label>
          <select className="input w-36" value={filter.month}
            onChange={(e) => setFilter((f) => ({ ...f, month: e.target.value }))}>
            <option value="">Full year</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {new Date(2000, i).toLocaleString("en-GB", { month: "long" })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Reporting currency</label>
          <input
            type="text"
            className="input w-20 uppercase"
            maxLength={3}
            value={filter.reporting_currency}
            onChange={(e) => setFilter((f) => ({ ...f, reporting_currency: e.target.value.toUpperCase() }))}
          />
        </div>
        <button onClick={load} disabled={loading} className="btn-primary">
          {loading ? <Spinner className="w-4 h-4" /> : null} Generate
        </button>
      </div>

      {/* Overall balance check */}
      {journals.length > 0 && (
        <div className={`card p-3 flex items-center gap-4 text-sm ${
          isBalanced ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20" : "border-red-300 bg-red-50 dark:bg-red-900/20"
        }`}>
          <span className="font-medium">Total Dr: {fmt(totalDebit)}</span>
          <span className="font-medium">Total Cr: {fmt(totalCredit)}</span>
          <span className={isBalanced
            ? "text-emerald-600 dark:text-emerald-400 font-semibold"
            : "text-red-600 dark:text-red-400 font-semibold"}>
            {isBalanced ? "✓ Balanced" : `⚠ Diff: ${fmt(totalDebit - totalCredit)}`}
          </span>
        </div>
      )}

      {/* Journal table — grouped by entity */}
      {loading ? (
        <div className="card p-12 text-center"><Spinner className="w-6 h-6 mx-auto" /></div>
      ) : Object.keys(byEntity).length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="table-header text-left">Date</th>
                  <th className="table-header text-left">Account</th>
                  <th className="table-header text-left">Description</th>
                  <th className="table-header text-right">Debit</th>
                  <th className="table-header text-right">Credit</th>
                  <th className="table-header text-right">Rpt Dr ({rpt})</th>
                  <th className="table-header text-right">Rpt Cr ({rpt})</th>
                  <th className="table-header text-left">Ref</th>
                  <th className="table-header text-left">Class</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byEntity).map(([entityKey, { entityName, lines }]) => {
                  const entDr = lines.reduce((s, j) => s + j.debit, 0);
                  const entCr = lines.reduce((s, j) => s + j.credit, 0);
                  const entBalanced = Math.abs(entDr - entCr) < 0.01;

                  // Group lines by date within this entity
                  const byDate = lines.reduce<Record<string, JournalLine[]>>((acc, j) => {
                    (acc[j.date] = acc[j.date] || []).push(j);
                    return acc;
                  }, {});

                  return [
                    // Entity header row
                    <tr key={`entity-${entityKey}`} className="bg-[var(--bg)] border-b border-[var(--border)]">
                      <td colSpan={7} className="px-3 py-2 font-semibold text-[var(--text)]">
                        {entityName}
                        <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                          {lines[0]?.currency}
                        </span>
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-right text-xs">
                        <span className={entBalanced
                          ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                          : "text-red-600 dark:text-red-400 font-semibold"}>
                          {entBalanced ? "✓ balanced" : `⚠ diff ${fmt(entDr - entCr)}`}
                        </span>
                      </td>
                    </tr>,
                    // Journal lines grouped by date
                    ...Object.entries(byDate).flatMap(([date, dateLines]) =>
                      dateLines.map((j, i) => (
                        <tr key={`${entityKey}-${date}-${i}`} className="border-b border-[var(--border)] hover:bg-[var(--bg)]">
                          <td className="table-cell-left font-mono text-xs">{i === 0 ? date : ""}</td>
                          <td className="table-cell-left font-mono text-xs text-[var(--text-muted)]">{j.accountCode}</td>
                          <td className="table-cell-left">{j.accountDescription}</td>
                          <td className="table-cell text-right">{j.debit ? fmt(j.debit) : ""}</td>
                          <td className="table-cell text-right text-[var(--text-muted)]">{j.credit ? fmt(j.credit) : ""}</td>
                          <td className="table-cell text-right text-[var(--text-muted)]">{j.debitRpt != null ? fmt(j.debitRpt) : "—"}</td>
                          <td className="table-cell text-right text-[var(--text-muted)]">{j.creditRpt != null ? fmt(j.creditRpt) : "—"}</td>
                          <td className="table-cell-left font-mono text-xs">{j.leaseRef}</td>
                          <td className="table-cell-left text-xs capitalize">{j.assetClass}</td>
                        </tr>
                      ))
                    ),
                  ];
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--bg)] font-semibold border-t-2 border-[var(--border)]">
                  <td colSpan={3} className="table-cell-left">Total</td>
                  <td className="table-cell text-right">{fmt(totalDebit)}</td>
                  <td className="table-cell text-right">{fmt(totalCredit)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : !loading && (
        <div className="card p-12 text-center text-[var(--text-muted)] text-sm">
          Select filters above and click Generate.
        </div>
      )}
    </div>
  );
}
