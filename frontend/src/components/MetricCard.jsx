export default function MetricCard({ title, subtitle, icon: Icon, accent = 'blue' }) {
  const accents = {
    blue: 'bg-blue-50 text-blue-600',
    rose: 'bg-rose-50 text-rose-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-panel sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[13px] font-semibold text-slate-500">{title}</p><p className="mt-3 font-[Manrope] text-3xl font-extrabold tracking-tight text-slate-300">—</p></div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${accents[accent]}`}><Icon size={20} strokeWidth={2} /></span>
      </div>
      <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-4 text-slate-400">{subtitle}</p>
    </section>
  );
}
