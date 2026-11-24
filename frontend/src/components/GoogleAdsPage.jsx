import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatGoogleAdsAmount } from '../utils/currency.js';
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, PauseCircle, RefreshCw, ShieldCheck } from 'lucide-react';

function getApiEndpoint(path) {
  const base = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  const normalized = String(path).replace(/^\/+/, '').replace(/^api\//, '');
  if (!base) return `/api/${normalized}`;
  return base.endsWith('/api') ? `${base}/${normalized}` : `${base}/api/${normalized}`;
}

async function request(path, options = {}) {
  const { actionKey, ...fetchOptions } = options;
  const response = await fetch(getApiEndpoint(`google-ads/${path}`), {
    ...fetchOptions,
    headers: {
      Accept: 'application/json',
      ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(actionKey ? { 'X-Google-Ads-Action-Key': actionKey } : {}),
      ...(fetchOptions.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  return payload?.data ?? payload;
}

const dateInput = value => value.toISOString().slice(0, 10);
const number = value => new Intl.NumberFormat('id-ID').format(Number(value || 0));
const money = (micros, currencyCode = 'IDR') => formatGoogleAdsAmount(micros, currencyCode);
const boxStyle = { border: '1px solid #e7ecf5', borderRadius: 12, padding: 14, background: '#fff' };
const fieldStyle = { width: '100%', minWidth: 0, padding: '10px 12px', border: '1px solid #dfe6f1', borderRadius: 9, font: 'inherit', color: '#33445f', background: '#fff' };
const buttonStyle = { border: 0, borderRadius: 9, padding: '10px 13px', background: '#3768f5', color: '#fff', fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 7 };

export default function GoogleAdsPage() {
  const [status, setStatus] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionKey, setActionKey] = useState('');
  const [startDate, setStartDate] = useState(dateInput(new Date(Date.now() - 90 * 86400000)));
  const [endDate, setEndDate] = useState(dateInput(new Date(Date.now() - 86400000)));
  const [ipsText, setIpsText] = useState('');
  const [campaignForIps, setCampaignForIps] = useState('');
  const [pauseCampaignId, setPauseCampaignId] = useState('');
  const [pauseConfirmation, setPauseConfirmation] = useState('');
  const [ipConfirmation, setIpConfirmation] = useState('');
  const [syncConfirmation, setSyncConfirmation] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [syncResult, setSyncResult] = useState(null);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [trainingStatusLoading, setTrainingStatusLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const result = await request('status');
      setStatus(result);
      setError('');
    } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const loadCustomers = async () => {
    setLoading(true); setError(''); setNotice('');
    try {
      if (!actionKey) { setError('Masukkan kunci admin sebelum membaca akun Google Ads.'); return; }
      const result = await request('customers', { actionKey });
      const rows = Array.isArray(result) ? result : [];
      setCustomers(rows);
      if (rows.length) {
        setCustomerId(current => current || status?.defaultCustomerId || rows[0].customerId);
        setNotice(`${rows.length} akun Google Ads dapat diakses oleh pengguna OAuth ini.`);
      } else setNotice('Google tidak mengembalikan akun yang dapat diakses. Periksa izin pengguna OAuth.');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const loadCampaigns = async () => {
    if (!customerId) { setError('Pilih Customer ID terlebih dahulu.'); return; }
    setCampaignLoading(true); setError(''); setNotice('');
    try {
      if (!actionKey) { setError('Masukkan kunci admin sebelum membaca kampanye.'); return; }
      const result = await request(`campaigns?customerId=${encodeURIComponent(customerId)}`, { actionKey });
      setCampaigns(Array.isArray(result) ? result : []);
      setNotice(`${Array.isArray(result) ? result.length : 0} kampanye dimuat. Metrik merupakan ringkasan 30 hari terakhir.`);
    } catch (err) { setError(err.message); }
    finally { setCampaignLoading(false); }
  };

  useEffect(() => {
    if (status?.defaultCustomerId && !customerId) setCustomerId(status.defaultCustomerId);
  }, [status, customerId]);

  const selectedCampaign = useMemo(() => campaigns.find(item => item.id === campaignForIps), [campaigns, campaignForIps]);
  const loadTrainingStatus = async () => {
    if (!actionKey) { setError('Masukkan kunci admin terlebih dahulu.'); return; }
    setTrainingStatusLoading(true); setError('');
    try {
      const result = await request('training-data/model-status', { actionKey });
      setTrainingStatus(result);
    } catch (err) { setError(err.message); }
    finally { setTrainingStatusLoading(false); }
  };

  const runPause = async () => {
    if (!pauseCampaignId || pauseConfirmation !== `PAUSE ${pauseCampaignId}`) {
      setError(`Ketik persis: PAUSE ${pauseCampaignId}`); return;
    }
    setBusyAction('pause'); setError(''); setNotice('');
    try {
      await request(`campaigns/${pauseCampaignId}/pause`, {
        method: 'POST', actionKey,
        body: JSON.stringify({ customerId, confirm: pauseConfirmation }),
      });
      setNotice(`Kampanye ${pauseCampaignId} sudah diminta berstatus PAUSED di Google Ads.`);
      setPauseCampaignId(''); setPauseConfirmation(''); await loadCampaigns();
    } catch (err) { setError(err.message); }
    finally { setBusyAction(''); }
  };

  const runIpExclusion = async () => {
    const ips = ipsText.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
    if (!campaignForIps || !ips.length) { setError('Pilih kampanye dan masukkan minimal satu IP/CIDR.'); return; }
    if (ipConfirmation !== `EXCLUDE ${campaignForIps}`) { setError(`Ketik persis: EXCLUDE ${campaignForIps}`); return; }
    setBusyAction('exclude'); setError(''); setNotice('');
    try {
      const result = await request(`campaigns/${campaignForIps}/ip-exclusions`, {
        method: 'POST', actionKey,
        body: JSON.stringify({ customerId, ips, confirm: ipConfirmation }),
      });
      setNotice(`${result.added} IP/CIDR ditambahkan; ${result.skippedExisting} sudah ada. Total kriteria: ${result.total}.`);
      setIpsText(''); setIpConfirmation('');
    } catch (err) { setError(err.message); }
    finally { setBusyAction(''); }
  };

  const runSync = async () => {
    if (!customerId) { setError('Pilih Customer ID terlebih dahulu.'); return; }
    if (syncConfirmation !== 'SYNC GOOGLE ADS DATA') { setError('Ketik persis: SYNC GOOGLE ADS DATA'); return; }
    setBusyAction('sync'); setError(''); setNotice(''); setSyncResult(null);
    try {
      const result = await request('training-data/sync', {
        method: 'POST', actionKey,
        body: JSON.stringify({ customerId, startDate, endDate, confirm: syncConfirmation }),
      });
      setSyncResult(result);
      setNotice(`${result.rows} baris campaign-day disimpan untuk pelatihan/evaluasi.`);
      setSyncConfirmation('');
    } catch (err) { setError(err.message); }
    finally { setBusyAction(''); }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="panel" style={{ padding: 20 }}>
        <div className="panel-head">
          <div><h2>Google Ads API · Status koneksi</h2><p>Integrasi akun, kampanye, metrik invalid clicks, dan tindakan mitigasi yang memerlukan konfirmasi admin.</p></div>
          <span className={`status-chip ${status?.configured ? 'status-connected' : ''}`}><span />{status?.configured ? 'OAuth terkonfigurasi' : 'Belum dikonfigurasi'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 16 }}>
          <div style={boxStyle}><small style={{ color: '#8a99af' }}>Versi API</small><div style={{ fontWeight: 800, marginTop: 5 }}>{status?.apiVersion || 'v26'}</div></div>
          <div style={boxStyle}><small style={{ color: '#8a99af' }}>Mutasi eksternal</small><div style={{ fontWeight: 800, marginTop: 5 }}>{status?.mutationsEnabled ? 'Diaktifkan' : 'Dinonaktifkan secara aman'}</div></div>
          <div style={boxStyle}><small style={{ color: '#8a99af' }}>Akun default</small><div style={{ fontWeight: 800, marginTop: 5 }}>{status?.defaultCustomerId || 'Belum diatur'}</div></div>
        </div>
        <p style={{ color: '#75839b', fontSize: 12, lineHeight: 1.7, margin: '13px 0' }}>{status?.message || 'Memeriksa konfigurasi.'}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
          <button style={buttonStyle} onClick={loadCustomers} disabled={loading || !status?.configured || !actionKey}><RefreshCw size={14} />{loading ? 'Memuat akun...' : 'Hubungkan / Muat akun'}</button>
          <button style={{ ...buttonStyle, background: '#eff4ff', color: '#315cd6' }} onClick={loadStatus}><RefreshCw size={14} />Periksa status</button>
          <a href="https://developers.google.com/google-ads/api/docs/oauth/overview" target="_blank" rel="noreferrer" style={{ color: '#4168d5', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, padding: 8 }}>Panduan OAuth <ExternalLink size={13} /></a>
        </div>
        <label style={{ display: 'grid', gap: 6, marginTop: 14, fontSize: 11, color: '#71819a' }}>Kunci admin Google Ads (disimpan sementara di memori halaman)
          <input type="password" autoComplete="off" style={fieldStyle} value={actionKey} onChange={event => setActionKey(event.target.value)} placeholder="Masukkan GOOGLE_ADS_ACTION_KEY" />
        </label>
        <p style={{ color: '#8896aa', fontSize: 11, lineHeight: 1.6, marginTop: 6 }}>Kunci dibutuhkan untuk membaca data akun/kampanye dan melakukan tindakan. Kunci tidak disimpan di browser storage atau dikirim ke Google.</p>
        {customers.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginTop: 15 }}>
            <label style={{ flex: '1 1 270px', display: 'grid', gap: 6, fontSize: 11, color: '#71819a' }}>Customer ID
              <select style={fieldStyle} value={customerId} onChange={event => setCustomerId(event.target.value)}>
                {customers.map(item => <option key={item.customerId} value={item.customerId}>{item.name && item.name !== item.customerId ? `${item.name} · ${item.customerId}` : item.customerId}</option>)}
              </select>
            </label>
            <button style={buttonStyle} onClick={loadCampaigns} disabled={campaignLoading || !actionKey}>{campaignLoading ? 'Memuat...' : 'Tampilkan kampanye'}</button>
          </div>
        )}
      </section>

      {error && <div className="demo-banner" role="alert"><AlertTriangle size={17} />{error}</div>}
      {notice && <div style={{ ...boxStyle, color: '#14694e', background: '#f0fbf6', borderColor: '#ccefe0', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><CheckCircle2 size={16} />{notice}</div>}

      <section className="panel" style={{ padding: 20 }}>
        <div className="panel-head"><div><h2>Kampanye Google Ads</h2><p>Performa 30 hari terakhir berdasarkan Customer ID yang dipilih.</p></div><span className="table-badge">{campaigns.length} kampanye</span></div>
        {campaigns.length ? (
          <div style={{ overflowX: 'auto', marginTop: 15 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
              <thead><tr style={{ color: '#8190a8', textAlign: 'left' }}>{['Kampanye', 'Channel', 'Status', 'Impressions', 'Clicks', 'Invalid clicks', 'Biaya'].map(name => <th key={name} style={{ padding: '10px 8px', borderBottom: '1px solid #e8edf5' }}>{name}</th>)}<th style={{ padding: 8, borderBottom: '1px solid #e8edf5' }}>Aksi</th></tr></thead>
              <tbody>{campaigns.map(item => <tr key={item.id}>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #eff2f7' }}><b>{item.name}</b><small style={{ display: 'block', color: '#9aa8bd', marginTop: 3 }}>{item.id}</small></td>
                <td style={{ padding: 8, borderBottom: '1px solid #eff2f7' }}>{item.channelType}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eff2f7' }}>{item.status}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eff2f7' }}>{number(item.impressions)}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eff2f7' }}>{number(item.clicks)}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eff2f7' }}>{number(item.invalidClicks)} <small style={{ color: '#9aa8bd' }}>({(item.invalidClickRate * 100).toFixed(2)}%)</small></td>
                <td style={{ padding: 8, borderBottom: '1px solid #eff2f7' }}>{money(item.costMicros, item.currencyCode)}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eff2f7' }}><button style={{ ...buttonStyle, padding: '7px 9px', background: '#fff2f1', color: '#b24f49' }} onClick={() => { setPauseCampaignId(item.id); setPauseConfirmation(''); }} disabled={!status?.mutationsEnabled}><PauseCircle size={13} />Jeda</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <p style={{ color: '#8b99ae', fontSize: 12, marginTop: 15 }}>Pilih akun dan muat kampanye untuk menampilkan daftar kampanye. Tidak ada data contoh yang ditampilkan.</p>}
      </section>

      <section className="panel" style={{ padding: 20 }}>
        <div className="panel-head"><div><h2>Dataset label independen Google Ads</h2><p>Sinkronkan metrik invalid clicks harian untuk memperkirakan risiko kampanye pada hari berikutnya.</p></div><span className="status-chip"><span />Read-only sync</span></div>
        <div style={{ padding: 12, background: '#f6f8fd', borderRadius: 10, fontSize: 12, color: '#64748b', lineHeight: 1.7, margin: '13px 0' }}>
          <b>Definisi label:</b> has_invalid_clicks = metrics.invalid_clicks &gt; 0 pada tanggal target. Model memakai metrik hari kalender sebelumnya dari kampanye yang sama sebagai fitur, lalu memprediksi risiko hari berikutnya. Data Google Ads adalah pelaporan agregat kampanye-hari, bukan aliran klik real-time dan bukan label untuk setiap klik. Google menyatakan invalid clicks ini tidak ditagihkan, sehingga metriknya adalah sinyal kualitas traffic, bukan nominal biaya fraud yang telah dibayar. Kolom invalid_clicks/rate pada hari target tidak digunakan sebagai fitur model agar tidak terjadi kebocoran label.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <button style={{ ...buttonStyle, background: '#edf3ff', color: '#315cd6' }} onClick={loadTrainingStatus} disabled={!actionKey || trainingStatusLoading}><RefreshCw size={14} />{trainingStatusLoading ? 'Memeriksa...' : 'Muat hasil pelatihan'}</button>
          {trainingStatus && <span style={{ fontSize: 11, color: trainingStatus.status === 'trained' ? '#167451' : '#8b6b2e' }}>Status: {trainingStatus.status}</span>}
        </div>
        {trainingStatus && <div style={{ ...boxStyle, marginBottom: 12, fontSize: 12, color: '#61718b', lineHeight: 1.7 }}>
          <b>{trainingStatus.status === 'trained' ? 'Model risiko kampanye-hari sudah dilatih' : 'Status model risiko kampanye-hari'}</b>
          <p style={{ margin: '5px 0' }}>{trainingStatus.reason || 'Tidak ada keterangan tambahan.'}</p>
          {trainingStatus.metrics && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 10 }}>
            {[
              ['Accuracy', trainingStatus.metrics.accuracy],
              ['Balanced accuracy', trainingStatus.metrics.balanced_accuracy],
              ['Precision', trainingStatus.metrics.precision],
              ['Recall', trainingStatus.metrics.recall],
              ['F1-score', trainingStatus.metrics.f1_score],
              ['ROC-AUC', trainingStatus.metrics.roc_auc],
            ].map(([label, value]) => <div key={label} style={{ padding: 9, border: '1px solid #e7edf7', borderRadius: 8 }}><small style={{ color: '#8a99af' }}>{label}</small><div style={{ fontWeight: 800, fontSize: 16 }}>{(Number(value || 0) * 100).toFixed(2)}%</div></div>)}
          </div>}
          <small style={{ display: 'block', marginTop: 9 }}>Metrik ini hanya berlaku untuk prediksi risiko kampanye-hari berikutnya, bukan akurasi klasifikasi klik individual. Hasil bersifat evaluasi historis dan tidak otomatis menghentikan kampanye.</small>
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 11, color: '#71819a' }}>Mulai tanggal<input type="date" style={fieldStyle} value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
          <label style={{ display: 'grid', gap: 6, fontSize: 11, color: '#71819a' }}>Sampai tanggal<input type="date" style={fieldStyle} value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
          <label style={{ display: 'grid', gap: 6, fontSize: 11, color: '#71819a' }}>Konfirmasi sinkronisasi<input style={fieldStyle} value={syncConfirmation} onChange={event => setSyncConfirmation(event.target.value)} placeholder="SYNC GOOGLE ADS DATA" /></label>
        </div>
        <button style={{ ...buttonStyle, marginTop: 12 }} disabled={!status?.configured || !actionKey || busyAction === 'sync'} onClick={runSync}><RefreshCw size={14} />{busyAction === 'sync' ? 'Sinkronisasi...' : 'Sinkronkan data training'}</button>
        {syncResult && <div style={{ marginTop: 13, padding: 13, border: '1px solid #dce8f7', borderRadius: 10, fontSize: 12, color: '#52627c' }}>Dataset tersimpan: <b>{number(syncResult.rows)} baris</b> · {number(syncResult.campaigns)} kampanye · {number(syncResult.dates)} tanggal · positif {number(syncResult.positiveCampaignDays)} · negatif {number(syncResult.negativeCampaignDays)}.<br/>Jalankan `python ml/train_google_ads_campaign_model.py` pada folder backend untuk evaluasi kronologis.</div>}
      </section>

      <section className="panel" style={{ padding: 20 }}>
        <div className="panel-head"><div><h2>Kontrol mitigasi Google Ads</h2><p>Jeda kampanye atau tambahkan pengecualian IP/CIDR setelah verifikasi manual.</p></div><span className={`status-chip ${status?.mutationsEnabled ? '' : 'status-warning'}`}><span />{status?.mutationsEnabled ? 'Mutasi diaktifkan' : 'Mutasi OFF'}</span></div>
        <p style={{ color: '#8896aa', fontSize: 11, lineHeight: 1.6 }}>Server memvalidasi kunci admin dan GOOGLE_ADS_MUTATIONS_ENABLED sebelum melakukan perubahan pada akun iklan. Sinkronisasi invalid clicks bukan streaming per klik; kontrol ini membutuhkan pemeriksaan dan persetujuan admin, bukan jeda otomatis real-time.</p>
        {pauseCampaignId && <div style={{ ...boxStyle, marginTop: 12 }}>
          <b style={{ fontSize: 12 }}>Konfirmasi jeda kampanye {pauseCampaignId}</b>
          <p style={{ color: '#8391a7', fontSize: 11 }}>Menjeda kampanye akan menghentikan penayangan kampanye tersebut sampai diaktifkan kembali di Google Ads.</p>
          <input style={fieldStyle} value={pauseConfirmation} onChange={event => setPauseConfirmation(event.target.value)} placeholder={`PAUSE ${pauseCampaignId}`} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button style={{ ...buttonStyle, background: '#bf4f4a' }} disabled={!actionKey || busyAction === 'pause' || !status?.mutationsEnabled} onClick={runPause}>Konfirmasi jeda</button><button style={{ ...buttonStyle, background: '#edf1f8', color: '#53627a' }} onClick={() => setPauseCampaignId('')}>Batal</button></div>
        </div>}
        <div style={{ display: 'grid', gap: 9, marginTop: 15 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 11, color: '#71819a' }}>Kampanye untuk pengecualian IP<select style={fieldStyle} value={campaignForIps} onChange={event => { setCampaignForIps(event.target.value); setIpConfirmation(''); }}><option value="">Pilih kampanye</option>{campaigns.map(item => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}</select></label>
          <label style={{ display: 'grid', gap: 6, fontSize: 11, color: '#71819a' }}>Alamat IP/CIDR · satu per baris<textarea style={{ ...fieldStyle, minHeight: 85, resize: 'vertical' }} value={ipsText} onChange={event => setIpsText(event.target.value)} placeholder={'203.0.113.10\n2001:db8::1'} /></label>
          <label style={{ display: 'grid', gap: 6, fontSize: 11, color: '#71819a' }}>Konfirmasi tindakan<input style={fieldStyle} value={ipConfirmation} onChange={event => setIpConfirmation(event.target.value)} placeholder={campaignForIps ? `EXCLUDE ${campaignForIps}` : 'EXCLUDE campaignId'} /></label>
          <button style={{ ...buttonStyle, background: '#465b85' }} disabled={!status?.mutationsEnabled || !actionKey || !campaignForIps || busyAction === 'exclude'} onClick={runIpExclusion}><ShieldCheck size={14} />{busyAction === 'exclude' ? 'Menerapkan...' : `Tambahkan pengecualian IP${selectedCampaign ? ` · ${selectedCampaign.name}` : ''}`}</button>
          <small style={{ color: '#8c99ad', lineHeight: 1.6 }}>Google Ads membatasi hingga 500 IP/CIDR pengecualian per kampanye. Ketersediaan kriteria dapat bergantung pada tipe kampanye. Pastikan IP benar-benar diverifikasi sebelum diterapkan.</small>
        </div>
      </section>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, background: '#fff9ed', color: '#956b22', fontSize: 11, lineHeight: 1.6 }}><KeyRound size={15} style={{ flex: '0 0 auto', marginTop: 2 }} /><span>Semua mutasi Google Ads default OFF. Jangan mengaktifkan jeda otomatis berdasarkan model sebelum hasil evaluasi independen memadai dan aturan mitigasi disetujui. Google Ads invalid-click metrics adalah sinyal agregat, bukan audit label per klik.</span></div>
    </div>
  );
}
