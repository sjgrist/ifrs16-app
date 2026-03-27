import React, { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Plus, Upload, Edit2, Trash2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { api, type Lease, type ExtractedLease, type ScheduleRow } from "../lib/api";
import { useAppStore } from "../lib/store";
import { fmt, fmtDate, fmtPct, statusBadge, assetClassLabel, downloadBlob } from "../lib/utils";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import { LeaseForm } from "../components/LeaseForm";

export function LeasesPage() {
  const { toast } = useToast();
  const { entities, loadEntities, rates, loadRates } = useAppStore();

  const [leases, setLeases] = useState<Lease[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lease | null>(null);
  const [extracted, setExtracted] = useState<ExtractedLease | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [scheduleCache, setScheduleCache] = useState<Record<number, ScheduleRow[]>>({});

  const [filter, setFilter] = useState({ entity_id: "", status: "", search: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter.entity_id) params.entity_id = filter.entity_id;
      if (filter.status) params.status = filter.status;
      if (filter.search) params.search = filter.search;
      const { leases: ls, total: t } = await api.leases.list(params);
      setLeases(ls); setTotal(t);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }, [filter, toast]);

  useEffect(() => { loadEntities(); loadRates(); }, []);
  useEffect(() => { load(); }, [load]);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setExtracting(true);
    try {
      const { extracted: ex } = await api.leases.extract(file);
      setExtracted(ex);
      setEditing(null);
      setShowForm(true);
      toast("Lease data extracted — please review and confirm", "info");
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setExtracting(false); }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "application/pdf": [".pdf"] }, multiple: false,
  });

  const handleSave = async (data: Partial<Lease>) => {
    try {
      if (editing) {
        await api.leases.update(editing.id, data);
        toast("Lease updated");
      } else {
        await api.leases.create(data);
        toast("Lease saved");
      }
      setShowForm(false); setEditing(null); setExtracted(null);
      load();
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this lease and its schedule?")) return;
    try {
      await api.leases.delete(id);
      toast("Lease deleted");
      load();
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!scheduleCache[id]) {
      try {
        const s = await api.schedules.get(id);
        setScheduleCache((c) => ({ ...c, [id]: s.rows }));
      } catch (e: unknown) { toast((e as Error).message, "error"); }
    }
  };

  const exportScheduleXlsx = async (lease: Lease) => {
    try {
      const { buildSchedule } = await import("@ifrs16/lib");
      const schedule = buildSchedule({
        commencementDate: lease.commencement_date,
        termMonths: lease.term_months,
        paymentAmount: lease.payment_amount,
        paymentFrequency: lease.payment_frequency,
        paymentTiming: lease.payment_timing,
        annualDiscountRate: lease.discount_rate,
        initialDirectCosts: lease.initial_direct_costs,
        leaseIncentivesReceivable: lease.lease_incentives_receivable,
        prepaidPayments: lease.prepaid_payments,
        rentFreeMonths: lease.rent_free_months,
        residualValueGuarantee: lease.residual_value_guarantee,
      });

      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Schedule");
      ws.addRow(["Period", "Date", "Opening Liability", "Interest", "Payment",
                 "Closing Liability", "ROU Dep.", "Closing ROU", "Total P&L"]);
      for (const r of schedule.rows) {
        ws.addRow([r.period, r.date, r.openingLiability, r.interestCharge,
                   r.payment, r.closingLiability, r.rouDepreciation,
                   r.closingRouValue, r.totalPLCharge]);
      }
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf]), `schedule-${lease.id}.xlsx`);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leases</h1>
          <p className="text-sm text-[var(--text-muted)]">{total} lease{total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditing(null); setExtracted(null); setShowForm(true); }} className="btn-primary">
            <Plus size={16} /> New Lease
          </button>
        </div>
      </div>

      {/* PDF drop zone */}
      <div {...getRootProps()} className={`card p-6 border-2 border-dashed cursor-pointer transition-colors text-center
        ${isDragActive ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "border-[var(--border)] hover:border-brand-400"}`}>
        <input {...getInputProps()} />
        {extracting ? (
          <div className="flex flex-col items-center gap-3">
            <Spinner className="w-8 h-8 text-brand-500" />
            <p className="text-sm font-medium">Extracting lease data with AI…</p>
            <p className="text-xs text-[var(--text-muted)]">This may take 10–20 seconds</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={24} className="text-[var(--text-muted)]" />
            <p className="text-sm font-medium">Drop a lease PDF here, or click to browse</p>
            <p className="text-xs text-[var(--text-muted)]">AI will extract lease terms for review</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input className="input w-48" placeholder="Search…"
          value={filter.search} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))} />
        <select className="input w-44" value={filter.entity_id}
          onChange={(e) => setFilter((f) => ({ ...f, entity_id: e.target.value }))}>
          <option value="">All entities</option>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select className="input w-36" value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="modified">Modified</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left w-8"></th>
                <th className="table-header text-left">ID</th>
                <th className="table-header text-left">Entity</th>
                <th className="table-header text-left">Asset / Lessor</th>
                <th className="table-header text-left">Class</th>
                <th className="table-header">Commencement</th>
                <th className="table-header">Term (mo)</th>
                <th className="table-header">Ccy</th>
                <th className="table-header">Payment</th>
                <th className="table-header">Rate</th>
                <th className="table-header text-left">Status</th>
                <th className="table-header text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="py-12 text-center text-[var(--text-muted)]">
                  <Spinner className="w-6 h-6 mx-auto" />
                </td></tr>
              ) : leases.length === 0 ? (
                <tr><td colSpan={12} className="py-12 text-center text-[var(--text-muted)]">
                  No leases yet. Upload a PDF or create manually.
                </td></tr>
              ) : leases.map((lease) => (
                <React.Fragment key={lease.id}>
                  <tr className="border-b border-[var(--border)] hover:bg-[var(--bg)] transition-colors">
                    <td className="px-3 py-2">
                      <button onClick={() => toggleExpand(lease.id)} className="text-[var(--text-muted)]">
                        {expandedId === lease.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="table-cell-left font-mono text-xs text-[var(--text-muted)]">
                      L{String(lease.id).padStart(4, "0")}
                    </td>
                    <td className="table-cell-left">{lease.entity_name}</td>
                    <td className="table-cell-left">
                      <div className="font-medium truncate max-w-[180px]">{lease.asset_description || "—"}</div>
                      <div className="text-xs text-[var(--text-muted)]">{lease.lessor_name || "—"}</div>
                    </td>
                    <td className="table-cell-left">
                      <span className="badge-blue badge">{assetClassLabel(lease.asset_class)}</span>
                    </td>
                    <td className="table-cell">{fmtDate(lease.commencement_date)}</td>
                    <td className="table-cell">{lease.term_months}</td>
                    <td className="table-cell">{lease.currency}</td>
                    <td className="table-cell">{fmt(lease.payment_amount)}</td>
                    <td className="table-cell">{fmtPct(lease.discount_rate)}</td>
                    <td className="table-cell-left">
                      <span className={statusBadge(lease.status)}>{lease.status}</span>
                    </td>
                    <td className="table-cell-left">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(lease); setExtracted(null); setShowForm(true); }}
                          className="btn-ghost p-1.5"><Edit2 size={13} /></button>
                        <button onClick={() => handleDelete(lease.id)}
                          className="btn-ghost p-1.5 text-red-500 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === lease.id && (
                    <tr><td colSpan={12} className="bg-[var(--bg)] p-0">
                      <ScheduleInline
                        rows={scheduleCache[lease.id] || []}
                        lease={lease}
                        onExport={() => exportScheduleXlsx(lease)}
                      />
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lease form modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); setExtracted(null); }}
        title={editing ? "Edit Lease" : "New Lease"} size="xl">
        <LeaseForm
          initial={editing || undefined}
          extracted={extracted || undefined}
          entities={entities}
          rates={rates}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); setExtracted(null); }}
        />
      </Modal>
    </div>
  );
}

function ScheduleInline({ rows, lease, onExport }: {
  rows: ScheduleRow[]; lease: Lease; onExport: () => void;
}) {
  if (!rows.length) return (
    <div className="p-6 text-center text-sm text-[var(--text-muted)]"><Spinner className="w-5 h-5 mx-auto" /></div>
  );
  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Amortisation Schedule — {lease.asset_description}
        </div>
        <button onClick={onExport} className="btn-secondary text-xs py-1 px-3">Export XLSX</button>
      </div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0">
            <tr>
              {["Period","Date","Opening Liability","Interest","Payment","Closing Liability","ROU Dep.","Closing ROU","Total P&L"].map((h) => (
                <th key={h} className="table-header whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} className="border-b border-[var(--border)] hover:bg-[var(--surface)]">
                <td className="table-cell text-xs">{r.period}</td>
                <td className="table-cell">{r.date}</td>
                <td className="table-cell">{fmt(r.openingLiability)}</td>
                <td className="table-cell text-amber-600 dark:text-amber-400">{fmt(r.interestCharge)}</td>
                <td className="table-cell text-emerald-600 dark:text-emerald-400">{fmt(r.payment)}</td>
                <td className="table-cell font-semibold">{fmt(r.closingLiability)}</td>
                <td className="table-cell">{fmt(r.rouDepreciation)}</td>
                <td className="table-cell">{fmt(r.closingRouValue)}</td>
                <td className="table-cell font-semibold">{fmt(r.totalPLCharge)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
