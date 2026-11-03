import { inputCls } from "@/components/ui-kit";

export type LeadDefaults = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  score?: number | null;
  notes?: string | null;
  deal_value?: number | null;
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className ?? ""}`}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function LeadFields({ d = {}, withDealValue = false }: { d?: LeadDefaults; withDealValue?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre *">
        <input name="name" required defaultValue={d.name ?? ""} className={inputCls} />
      </Field>
      <Field label="Empresa">
        <input name="company" defaultValue={d.company ?? ""} className={inputCls} />
      </Field>
      <Field label="Correo">
        <input name="email" type="email" defaultValue={d.email ?? ""} className={inputCls} />
      </Field>
      <Field label="Teléfono">
        <input name="phone" defaultValue={d.phone ?? ""} className={inputCls} />
      </Field>
      <Field label="Sitio web">
        <input name="website" defaultValue={d.website ?? ""} placeholder="https://" className={inputCls} />
      </Field>
      <Field label="Ciudad">
        <input name="city" defaultValue={d.city ?? ""} className={inputCls} />
      </Field>
      <Field label="Score (0-100)">
        <input name="score" type="number" min={0} max={100} defaultValue={d.score ?? 0} className={inputCls} />
      </Field>
      {withDealValue && (
        <Field label="Valor estimado del trato">
          <input name="deal_value" type="number" step="0.01" min={0} defaultValue={d.deal_value ?? ""} className={inputCls} />
        </Field>
      )}
      <Field label="Notas" className="sm:col-span-2">
        <textarea name="notes" rows={3} defaultValue={d.notes ?? ""} className={inputCls} />
      </Field>
    </div>
  );
}
