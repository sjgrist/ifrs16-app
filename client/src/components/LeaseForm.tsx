import React, { useState, useEffect } from "react";
import type { Lease, ExtractedLease, Entity, DiscountRate } from "../lib/api";
import { fmtPct } from "../lib/utils";
import { presentValue } from "@ifrs16/lib";

type FormData = Omit<Lease, "id" | "entity_name">;

function defaults(): FormData {
  return {
    entity_id: 0, lessor_name: "", asset_description: "", asset_class: "property",
    commencement_date: "", term_months: 36, extension_option_months: 0,
    extension_reasonably_certain: false, currency: "GBP", payment_amount: 0,
    payment_frequency: "monthly", payment_timing: "arrears", rent_free_months: 0,
    initial_direct_costs: 0, lease_incentives_receivable: 0, prepaid_payments: 0,
    residual_value_guarantee: 0, discount_rate: 0.05, discount_rate_id: null,
    country: "", status: "active", notes: "",
  };
}

function merge(base: FormData, ex: ExtractedLease): FormData {
  return {
    ...base,
    lessor_name: ex.lessor_name ?? base.lessor_name,
    asset_description: ex.asset_description ?? base.asset_description,
    asset_class: (ex.asset_class as FormData["asset_class"]) ?? base.asset_class,
    commencement_date: ex.commencement_date ?? base.commencement_date,
    term_months: ex.term_months ?? base.term_months,
    extension_option_months: ex.extension_option_months ?? base.extension_option_months,
    extension_reasonably_certain: ex.extension_reasonably_certain ?? base.extension_reasonably_certain,
    currency: (ex.currency as FormData["currency"]) ?? base.currency,
    payment_amount: ex.payment_amount ?? base.payment_amount,
    payment_frequency: (ex.payment_frequency as FormData["payment_frequency"]) ?? base.payment_frequency,
    payment_timing: (ex.payment_timing as FormData["payment_timing"]) ?? base.payment_timing,
    rent_free_months: ex.rent_free_months ?? base.rent_free_months,
    initial_direct_costs: ex.initial_direct_costs ?? base.initial_direct_costs,
    lease_incentives_receivable: ex.lease_incentives_receivable ?? base.lease_incentives_receivable,
    prepaid_payments: ex.prepaid_payments ?? base.prepaid_payments,
    residual_value_guarantee: ex.residual_value_guarantee ?? base.residual_value_guarantee,
    country: ex.country ?? base.country,
    notes: ex.notes ?? base.notes,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

interface Props {
  initial?: Lease;
  extracted?: ExtractedLease;
  entities: Entity[];
  rates: DiscountRate[];
  onSave: (d: Partial<Lease>) => void;
  onCancel: () => void;
}

export function LeaseForm({ initial, extracted, entities, rates, onSave, onCancel }: Props) {
  const [form, setForm] = useState<FormData>(() => {
    const base = initial ? { ...initial } : defaults();
    return extracted ? merge(base as FormData, extracted) : (base as FormData);
  });
  // Tracks raw string while user is editing a number field, so they can clear/backspace freely
  const [rawNums, setRawNums] = useState<Partial<Record<keyof FormData, string>>>({});

  useEffect(() => {
    if (extracted) setForm((f) => merge(f, extracted));
  }, [extracted]);

  const set = (field: keyof FormData, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }));

  // While typing: keep raw string visible; update form only when a valid number is entered
  const onNumChange = (field: keyof FormData, raw: string) => {
    setRawNums((r) => ({ ...r, [field]: raw }));
    const n = parseFloat(raw);
    if (!isNaN(n)) setForm((f) => ({ ...f, [field]: n }));
  };

  // On blur: commit the value (default 0 if empty/invalid) and clear raw override
  const onNumBlur = (field: keyof FormData, raw: string) => {
    const n = parseFloat(raw);
    setForm((f) => ({ ...f, [field]: isNaN(n) ? 0 : n }));
    setRawNums((r) => { const next = { ...r }; delete next[field]; return next; });
  };

  // Returns value for a number input: raw string while editing, number string otherwise
  const numVal = (field: keyof FormData) =>
    field in rawNums ? (rawNums[field] as string) : String(form[field as keyof FormData]);

  // Live PV preview
  const pvPreview = form.payment_amount && form.term_months && form.discount_rate
    ? presentValue({
        paymentAmount: form.payment_amount,
        paymentFrequency: form.payment_frequency,
        paymentTiming: form.payment_timing,
        termMonths: form.term_months,
        annualDiscountRate: form.discount_rate,
        rentFreeMonths: form.rent_free_months,
      })
    : null;

  const rouPreview = pvPreview != null
    ? pvPreview + form.initial_direct_costs + form.prepaid_payments - form.lease_incentives_receivable
    : null;

  const handleRateSelect = (rateId: string) => {
    const rate = rates.find((r) => r.id === parseInt(rateId));
    if (rate) {
      set("discount_rate_id", rate.id);
      set("discount_rate", rate.ibr);
    } else {
      set("discount_rate_id", null);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-6">
      {extracted && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
          Fields pre-filled from AI extraction — please review all values before saving.
        </div>
      )}

      {/* Section: Core */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Entity *">
          <select className="input" required value={form.entity_id}
            onChange={(e) => set("entity_id", parseInt(e.target.value))}>
            <option value={0}>Select entity…</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="modified">Modified</option>
          </select>
        </Field>
        <Field label="Lessor Name">
          <input className="input" value={form.lessor_name} onChange={(e) => set("lessor_name", e.target.value)} />
        </Field>
        <Field label="Asset Description">
          <input className="input" value={form.asset_description} onChange={(e) => set("asset_description", e.target.value)} />
        </Field>
        <Field label="Asset Class">
          <select className="input" value={form.asset_class} onChange={(e) => set("asset_class", e.target.value)}>
            <option value="property">Property</option>
            <option value="vehicle">Vehicle</option>
            <option value="equipment">Equipment</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Country">
          <input className="input" value={form.country} onChange={(e) => set("country", e.target.value)} />
        </Field>
      </div>

      {/* Section: Dates & Term */}
      <div className="grid grid-cols-3 gap-4">
        <Field label="Commencement Date *">
          <input type="date" className="input" required value={form.commencement_date}
            onChange={(e) => set("commencement_date", e.target.value)} />
        </Field>
        <Field label="Lease Term (months) *">
          <input type="number" className="input" required min={1}
            value={numVal("term_months")}
            onChange={(e) => onNumChange("term_months", e.target.value)}
            onBlur={(e) => onNumBlur("term_months", e.target.value)} />
        </Field>
        <Field label="Extension Option (months)">
          <input type="number" className="input" min={0}
            value={numVal("extension_option_months")}
            onChange={(e) => onNumChange("extension_option_months", e.target.value)}
            onBlur={(e) => onNumBlur("extension_option_months", e.target.value)} />
        </Field>
      </div>

      {/* Section: Payments */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Currency">
          <select className="input" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {["GBP","EUR","USD","SEK","NOK","DKK","CHF","other"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Payment Amount *">
          <input type="number" className="input" required min={0} step="0.01"
            value={numVal("payment_amount")}
            onChange={(e) => onNumChange("payment_amount", e.target.value)}
            onBlur={(e) => onNumBlur("payment_amount", e.target.value)} />
        </Field>
        <Field label="Payment Frequency">
          <select className="input" value={form.payment_frequency}
            onChange={(e) => set("payment_frequency", e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </Field>
        <Field label="Payment Timing">
          <select className="input" value={form.payment_timing}
            onChange={(e) => set("payment_timing", e.target.value)}>
            <option value="arrears">In Arrears</option>
            <option value="advance">In Advance</option>
          </select>
        </Field>
        <Field label="Rent-Free Period (months)">
          <input type="number" className="input" min={0}
            value={numVal("rent_free_months")}
            onChange={(e) => onNumChange("rent_free_months", e.target.value)}
            onBlur={(e) => onNumBlur("rent_free_months", e.target.value)} />
        </Field>
      </div>

      {/* Section: Initial measurement adjustments */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Initial Direct Costs">
          <input type="number" className="input" min={0} step="0.01"
            value={numVal("initial_direct_costs")}
            onChange={(e) => onNumChange("initial_direct_costs", e.target.value)}
            onBlur={(e) => onNumBlur("initial_direct_costs", e.target.value)} />
        </Field>
        <Field label="Lease Incentives Receivable">
          <input type="number" className="input" min={0} step="0.01"
            value={numVal("lease_incentives_receivable")}
            onChange={(e) => onNumChange("lease_incentives_receivable", e.target.value)}
            onBlur={(e) => onNumBlur("lease_incentives_receivable", e.target.value)} />
        </Field>
        <Field label="Prepaid Payments">
          <input type="number" className="input" min={0} step="0.01"
            value={numVal("prepaid_payments")}
            onChange={(e) => onNumChange("prepaid_payments", e.target.value)}
            onBlur={(e) => onNumBlur("prepaid_payments", e.target.value)} />
        </Field>
        <Field label="Residual Value Guarantee">
          <input type="number" className="input" min={0} step="0.01"
            value={numVal("residual_value_guarantee")}
            onChange={(e) => onNumChange("residual_value_guarantee", e.target.value)}
            onBlur={(e) => onNumBlur("residual_value_guarantee", e.target.value)} />
        </Field>
      </div>

      {/* Section: Discount Rate */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Rate Library (IBR)">
          <select className="input" value={form.discount_rate_id ?? ""} onChange={(e) => handleRateSelect(e.target.value)}>
            <option value="">Enter rate manually…</option>
            {rates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} ({fmtPct(r.ibr)}) — {r.currency} {r.tenor_months}mo
              </option>
            ))}
          </select>
        </Field>
        <Field label="Annual Discount Rate (IBR) *">
          <div className="relative">
            <input type="number" className="input pr-8" required min={0} max={1} step="0.0001"
              value={numVal("discount_rate")}
              onChange={(e) => onNumChange("discount_rate", e.target.value)}
              onBlur={(e) => onNumBlur("discount_rate", e.target.value)} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
              {fmtPct(form.discount_rate)}
            </span>
          </div>
        </Field>
      </div>

      {/* PV Preview */}
      {pvPreview != null && (
        <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] p-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="label">Initial Lease Liability (PV)</div>
            <div className="text-lg font-semibold font-mono">{form.currency} {pvPreview.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="label">Initial ROU Asset</div>
            <div className="text-lg font-semibold font-mono">{form.currency} {(rouPreview ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      )}

      <Field label="Notes">
        <textarea className="input h-20 resize-none" value={form.notes}
          onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" className="btn-primary">Save Lease</button>
      </div>
    </form>
  );
}
