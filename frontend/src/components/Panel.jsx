import { BarChart3, CircleHelp } from 'lucide-react';

export function TrafficPanel() {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-panel sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-[Manrope] text-base font-extrabold text-slate-900">Traffic overview</h2><p className="mt-1 text-xs text-slate-400">Volume event klik dari waktu ke waktu</p></div>
        <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500" disabled><span>Per jam</span><CircleHelp size={14} /></button>
      </div>
      <div className="mt-7 flex min-h-[205px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm"><BarChart3 size={22} /></span>
        <p className="mt-4 text-sm font-bold text-slate-600">Visualisasi disiapkan</p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">Grafik akan menampilkan agregasi traffic setelah data tersedia dari backend.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-400"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" />Total event</span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-400" />Event fraud</span></div>
    </section>
  );
}

export function ModelStatusPanel() {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-panel sm:p-6">
      <div><h2 className="font-[Manrope] text-base font-extrabold text-slate-900">Model status</h2><p className="mt-1 text-xs text-slate-400">Ketersediaan catatan model run</p></div>
      <div className="mt-5 rounded-xl bg-slate-50 p-4">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><CircleHelp size={19} /></span><div><p className="text-sm font-bold text-slate-700">Belum diverifikasi</p><p className="mt-0.5 text-[11px] text-slate-400">Status model belum terhubung</p></div></div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Keberadaan record model run saja tidak membuktikan bahwa model sudah terlatih, aktif, atau siap digunakan.</p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-xs text-slate-400">Sumber</span><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">model_runs</span></div>
    </section>
  );
}

export function EventsPanel() {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6"><div><h2 className="font-[Manrope] text-base font-extrabold text-slate-900">Recent click events</h2><p className="mt-1 text-xs text-slate-400">Event terbaru yang diterima sistem</p></div><span className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-400">Menunggu integrasi</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-slate-50/80"><tr>{['Click ID', 'IP address', 'Device', 'Timestamp', 'Classification'].map((item) => <th key={item} className="px-6 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{item}</th>)}</tr></thead><tbody><tr><td colSpan={5} className="px-6 py-12 text-center"><p className="text-sm font-semibold text-slate-500">Belum ada event untuk ditampilkan</p><p className="mt-1 text-xs text-slate-400">Tabel akan diisi ketika endpoint event tersedia dan berhasil dihubungkan.</p></td></tr></tbody></table></div>
    </section>
  );
}
