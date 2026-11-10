import { Activity, LayoutDashboard, MousePointerClick, ShieldAlert, ShieldCheck, Settings2, X } from 'lucide-react';

const navigation = [
  { label: 'Overview', icon: LayoutDashboard, active: true },
  { label: 'Click events', icon: MousePointerClick },
  { label: 'Fraud monitoring', icon: ShieldAlert },
  { label: 'Blocked IPs', icon: ShieldCheck },
];

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && <button aria-label="Tutup menu" className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[76px] items-center justify-between border-b border-slate-100 px-6">
          <a href="#overview" className="flex items-center gap-3" aria-label="ClickGuard beranda">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><Activity size={21} strokeWidth={2.4} /></span>
            <span><span className="block font-[Manrope] text-[17px] font-extrabold tracking-tight text-slate-900">ClickGuard</span><span className="block text-[10px] font-bold uppercase tracking-[0.17em] text-slate-400">Fraud intelligence</span></span>
          </a>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={onClose} aria-label="Tutup sidebar"><X size={19} /></button>
        </div>

        <div className="px-4 pt-7">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
          <nav className="space-y-1" aria-label="Navigasi utama">
            {navigation.map(({ label, icon: Icon, active }) => (
              <a key={label} href={`#${label.toLowerCase().replaceAll(' ', '-')}`} onClick={onClose} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
                <span>{label}</span>
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" />}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" /><span className="text-xs font-bold text-slate-700">Workspace status</span></div>
            <p className="text-xs leading-5 text-slate-500">Kerangka dashboard telah disiapkan. Data monitoring akan dihubungkan pada tahap integrasi.</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/4 rounded-full bg-blue-500" /></div>
            <p className="mt-2 text-[10px] font-semibold text-slate-400">Frontend foundation</p>
          </div>
          <button className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"><Settings2 size={17} /> Pengaturan</button>
          <div className="mt-4 border-t border-slate-100 pt-4 text-[10px] leading-4 text-slate-400">SISTEM DETEKSI FRAUD KLIK IKLAN DIGITAL<br />Proyek Penelitian · Kelompok 2</div>
        </div>
      </aside>
    </>
  );
}
