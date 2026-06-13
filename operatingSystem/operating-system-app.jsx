import { useState, useEffect } from "react";

// ---- ユーティリティ ----
const toHHMM = (date) =>
  date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
const toDateStr = (date) =>
  date.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit", weekday: "short" });
const minutesBetween = (start, end) =>
  Math.round((new Date(end) - new Date(start)) / 60000);
const formatHours = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? `${m}m` : ""}`;
};

const STORAGE_KEY = "attendance_v2";
const SETTINGS_KEY = "attendance_settings_v2";

// ---- ダミーデータ生成 ----
const generateDummyRecords = () => {
  const records = [];
  const year = 2026, month = 5; // 2026年6月
  const workDays = [2,3,4,5,6,9,10,11,12,13,16,17,18,19,20,23,24,25,26,27,30];
  workDays.forEach((day) => {
    const baseIn = new Date(year, month, day, 9, Math.floor(Math.random()*20));
    const breakMin = 60;
    const workMin = 480 + Math.floor(Math.random()*60) - 30; // ~8h
    const baseOut = new Date(baseIn.getTime() + (workMin + breakMin) * 60000);
    const notes = ["開発作業","ミーティング","資料作成","コードレビュー","テスト","設計","打ち合わせ",""];
    records.push({
      id: baseIn.getTime(),
      date: `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`,
      inTime: baseIn.toISOString(),
      outTime: baseOut.toISOString(),
      breakMin,
      duration: workMin,
      note: notes[Math.floor(Math.random()*notes.length)],
    });
  });
  return records;
};

const dummySettings = {
  myName: "山田 太郎",
  myAddress: "東京都渋谷区代々木1-1-1\ntel: 090-1234-5678\nmail: yamada@example.com",
  clientName: "株式会社サンプル",
  clientAddress: "東京都港区赤坂2-2-2",
  clientEmail: "guwon.info@gmail.com",
  hourlyRate: 5000,
  invoiceNo: 1,
};

const defaultSettings = {
  myName: "", myAddress: "",
  clientName: "", clientAddress: "",
  clientEmail: "",
  hourlyRate: 5000, invoiceNo: 1,
};

export default function App() {
  const [tab, setTab] = useState("clock");
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [clockedIn, setClockedIn] = useState(null);
  const [noteInput, setNoteInput] = useState("");
  const [now, setNow] = useState(new Date());
  const [invoiceMonth, setInvoiceMonth] = useState("2026-06");
  const [saved, setSaved] = useState(false);
  // 編集モーダル
  const [editRec, setEditRec] = useState(null);
  // 送信完了トースト
  const [toast, setToast] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 初回：ダミーデータをロード
  useEffect(() => {
    try {
      const r = localStorage.getItem(STORAGE_KEY);
      const s = localStorage.getItem(SETTINGS_KEY);
      if (r) setRecords(JSON.parse(r));
      else {
        const dummy = generateDummyRecords();
        setRecords(dummy);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dummy));
      }
      if (s) setSettings({ ...defaultSettings, ...JSON.parse(s) });
      else {
        setSettings(dummySettings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(dummySettings));
      }
    } catch {}
  }, []);

  const persist = (nr) => {
    setRecords(nr);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nr)); } catch {}
  };
  const persistSettings = (s) => {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  };

  const clockIn = () => {
    setClockedIn({ time: new Date().toISOString(), note: noteInput });
    setNoteInput("");
  };
  const clockOut = () => {
    const outTime = new Date().toISOString();
    const rawMin = minutesBetween(clockedIn.time, outTime);
    const breakMin = 60;
    const duration = Math.max(0, rawMin - breakMin);
    const newRec = {
      id: Date.now(),
      date: new Date(clockedIn.time).toISOString().slice(0,10),
      inTime: clockedIn.time,
      outTime,
      breakMin,
      duration,
      note: clockedIn.note,
    };
    persist([...records, newRec]);
    setClockedIn(null);
  };
  const deleteRecord = (id) => {
    if (confirm("この記録を削除しますか？")) persist(records.filter((r) => r.id !== id));
  };

  // 編集保存
  const saveEdit = () => {
    if (!editRec) return;
    const inD = new Date(editRec.inTime);
    const outD = new Date(editRec.outTime);
    const rawMin = Math.round((outD - inD) / 60000);
    const breakMin = Number(editRec.breakMin) || 0;
    const duration = Math.max(0, rawMin - breakMin);
    const updated = { ...editRec, breakMin, duration };
    persist(records.map((r) => r.id === updated.id ? updated : r));
    setEditRec(null);
  };

  const monthRecords = records.filter((r) => r.date.startsWith(invoiceMonth));
  const totalMinutes = monthRecords.reduce((s, r) => s + r.duration, 0);
  const totalAmount = Math.round((totalMinutes / 60) * settings.hourlyRate);
  const tax = Math.round(totalAmount * 0.1);
  const totalWithTax = totalAmount + tax;

  const dueDate = (() => {
    const d = new Date(invoiceMonth + "-01");
    d.setMonth(d.getMonth() + 2); d.setDate(0);
    return d.toLocaleDateString("ja-JP");
  })();

  // メール送信（Gmailアプリ起動）
  const sendMail = () => {
    const to = settings.clientEmail || "";
    const subject = encodeURIComponent(`【請求書】${invoiceMonth.replace("-","年")}月分 業務委託費 - ${settings.myName}`);
    const detail = monthRecords.map((r) =>
      `${toDateStr(new Date(r.inTime))} ${toHHMM(new Date(r.inTime))}〜${toHHMM(new Date(r.outTime))} 休憩${r.breakMin||0}分 実働${formatHours(r.duration)} ${r.note||""}`
    ).join("\n");
    const bodyText =
`${settings.clientName} 御中

お世話になっております。${settings.myName}です。

${invoiceMonth.replace("-","年")}月分の業務委託費についてご請求申し上げます。

■ご請求金額（税込）：¥${totalWithTax.toLocaleString()}
　小計：¥${totalAmount.toLocaleString()}
　消費税（10%）：¥${tax.toLocaleString()}

■稼働内容
　対象月：${invoiceMonth.replace("-","年")}月
　稼働時間：${formatHours(totalMinutes)}
　時給単価：¥${settings.hourlyRate.toLocaleString()}/h
　請求書No：INV-${String(settings.invoiceNo).padStart(4,"0")}

■勤務明細
${detail}

お振込期限：${dueDate}（翌月末）

ご確認のほどよろしくお願いいたします。

---
${settings.myName}
${settings.myAddress}
`;
    const body = encodeURIComponent(bodyText);
    // Android Gmail アプリ用URLスキーム
    const gmailUrl = `googlegmail://co?to=${encodeURIComponent(to)}&subject=${subject}&body=${body}`;
    // フォールバック用（Gmailウェブ）
    const gmailWeb = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${subject}&body=${body}`;

    // Gmailアプリを試み、失敗したらGmailウェブを開く
    const a = document.createElement("a");
    a.href = gmailUrl;
    a.click();

    // 500ms後にGmailアプリが開かなかった場合はGmailウェブにフォールバック
    setTimeout(() => {
      if (!document.hidden) {
        window.open(gmailWeb, "_blank");
      }
    }, 500);

    setToast("Gmailを起動しています…");
    setTimeout(() => setToast(""), 3000);
  };

  const tabs = [
    { id: "clock", label: "⏱ 打刻" },
    { id: "records", label: "📋 記録" },
    { id: "invoice", label: "📄 請求書" },
    { id: "settings", label: "⚙️ 設定" },
  ];

  const S = {
    wrap: { fontFamily: "'Hiragino Sans','Meiryo',sans-serif", minHeight: "100vh", background: "#f0f4f8" },
    header: { background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 10 },
    hInner: { maxWidth: 720, margin: "0 auto", padding: "14px 16px 0" },
    body: { maxWidth: 720, margin: "0 auto", padding: "16px" },
    card: { background: "white", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,.08)", padding: "20px", marginBottom: 14 },
    lbl: { fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 5 },
    inp: { width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1.5px solid #cbd5e1", borderRadius: 8, fontSize: 14, outline: "none" },
    btnGreen: { width: "100%", padding: "14px", border: "none", borderRadius: 10, background: "#16a34a", color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer" },
    btnRed: { width: "100%", padding: "14px", border: "none", borderRadius: 10, background: "#dc2626", color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer" },
    btnBlue: { padding: "10px 18px", border: "none", borderRadius: 8, background: "#1e40af", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" },
    btnOrange: { padding: "12px 24px", border: "none", borderRadius: 10, background: "#ea580c", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" },
    tab: (a) => ({ flex:1, padding:"10px 2px", border:"none", background:"transparent", cursor:"pointer", fontSize:11, color: a?"#1e40af":"#64748b", borderBottom: a?"3px solid #1e40af":"3px solid transparent", fontWeight: a?700:500 }),
    th: { textAlign:"left", padding:"8px 8px", fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" },
    td: { padding:"8px 8px", fontSize:12, borderBottom:"1px solid #f1f5f9", verticalAlign:"middle" },
  };

  return (
    <div style={S.wrap}>
      {/* トースト */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:"white", padding:"10px 20px", borderRadius:10, fontSize:13, zIndex:100, whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}

      {/* 編集モーダル */}
      {editRec && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"white", borderRadius:16, padding:24, width:"100%", maxWidth:400 }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#1e293b", marginBottom:18 }}>記録を編集</div>
            {[
              { label:"出勤時刻", key:"inTime", type:"datetime-local" },
              { label:"退勤時刻", key:"outTime", type:"datetime-local" },
            ].map(({ label, key, type }) => (
              <div key={key} style={{ marginBottom:14 }}>
                <label style={S.lbl}>{label}</label>
                <input type={type} style={S.inp}
                  value={editRec[key] ? editRec[key].slice(0,16) : ""}
                  onChange={(e) => setEditRec({ ...editRec, [key]: new Date(e.target.value).toISOString() })} />
              </div>
            ))}
            <div style={{ marginBottom:14 }}>
              <label style={S.lbl}>休憩時間（分）</label>
              <input type="number" style={S.inp} value={editRec.breakMin || 0}
                onChange={(e) => setEditRec({ ...editRec, breakMin: Number(e.target.value) })} />
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={S.lbl}>メモ</label>
              <input type="text" style={S.inp} value={editRec.note || ""}
                onChange={(e) => setEditRec({ ...editRec, note: e.target.value })}
                placeholder="作業内容など" />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button style={{ ...S.btnBlue, flex:1 }} onClick={saveEdit}>保存</button>
              <button style={{ flex:1, padding:"10px 18px", border:"1.5px solid #cbd5e1", borderRadius:8, background:"white", fontSize:14, fontWeight:700, cursor:"pointer", color:"#475569" }}
                onClick={() => setEditRec(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div style={S.header}>
        <div style={S.hInner}>
          <div style={{ display:"flex", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontSize:16, fontWeight:800, color:"#1e293b" }}>🕐 勤怠・請求書管理</span>
            {clockedIn && <span style={{ marginLeft:"auto", fontSize:11, fontWeight:700, background:"#dcfce7", color:"#166534", padding:"2px 8px", borderRadius:20 }}>● 勤務中</span>}
          </div>
          <div style={{ display:"flex" }}>
            {tabs.map((t) => <button key={t.id} style={S.tab(tab===t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>
        </div>
      </div>

      <div style={S.body}>

        {/* ===== 打刻 ===== */}
        {tab === "clock" && (
          <>
            <div style={{ ...S.card, textAlign:"center" }}>
              <div style={{ fontSize:42, fontWeight:800, color:"#1e293b", letterSpacing:1 }}>
                {now.toLocaleTimeString("ja-JP")}
              </div>
              <div style={{ color:"#64748b", fontSize:13, marginTop:4 }}>
                {now.toLocaleDateString("ja-JP", { year:"numeric", month:"long", day:"numeric", weekday:"long" })}
              </div>
            </div>
            {!clockedIn ? (
              <div style={S.card}>
                <label style={S.lbl}>メモ（任意）</label>
                <input style={{ ...S.inp, marginBottom:14 }} value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)} placeholder="例: 開発作業、打ち合わせ" />
                <button style={S.btnGreen} onClick={clockIn}>出勤打刻</button>
              </div>
            ) : (
              <div style={S.card}>
                <div style={{ background:"#f0fdf4", borderRadius:8, padding:"12px 16px", marginBottom:14 }}>
                  <div style={{ fontSize:12, color:"#166534", fontWeight:600 }}>出勤時刻</div>
                  <div style={{ fontSize:22, fontWeight:700, color:"#15803d" }}>{toHHMM(new Date(clockedIn.time))}</div>
                  {clockedIn.note && <div style={{ fontSize:12, color:"#166534", marginTop:3 }}>📝 {clockedIn.note}</div>}
                  <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>経過: {formatHours(minutesBetween(clockedIn.time, now.toISOString()))}</div>
                </div>
                <div style={{ fontSize:12, color:"#94a3b8", marginBottom:12, textAlign:"center" }}>退勤打刻時に休憩60分を自動差し引きします</div>
                <button style={S.btnRed} onClick={clockOut}>退勤打刻</button>
              </div>
            )}
            {(() => {
              const today = new Date().toISOString().slice(0,10);
              const tr = records.filter((r) => r.date === today);
              if (!tr.length) return null;
              return (
                <div style={S.card}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#64748b", marginBottom:8 }}>今日の記録</div>
                  {tr.map((r) => (
                    <div key={r.id} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f1f5f9" }}>
                      <span style={{ fontSize:13 }}>{toHHMM(new Date(r.inTime))}〜{toHHMM(new Date(r.outTime))} 休憩{r.breakMin||0}分</span>
                      <span style={{ fontSize:13, color:"#1e40af", fontWeight:700 }}>{formatHours(r.duration)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}

        {/* ===== 記録 ===== */}
        {tab === "records" && (
          <>
            <div style={{ ...S.card, padding:"14px 16px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                <span style={{ fontWeight:700, color:"#1e293b", fontSize:14 }}>勤怠記録</span>
                <input type="month" value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)}
                  style={{ ...S.inp, width:"auto", padding:"6px 10px" }} />
              </div>
            </div>
            {monthRecords.length === 0 ? (
              <div style={{ ...S.card, textAlign:"center", color:"#94a3b8", padding:36 }}>この月の記録はありません</div>
            ) : (
              <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      {["日付","出勤","退勤","休憩","実働","メモ",""].map((h,i) => (
                        <th key={i} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthRecords.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...S.td, fontWeight:600, whiteSpace:"nowrap" }}>{toDateStr(new Date(r.inTime))}</td>
                        <td style={{ ...S.td, whiteSpace:"nowrap" }}>{toHHMM(new Date(r.inTime))}</td>
                        <td style={{ ...S.td, whiteSpace:"nowrap" }}>{toHHMM(new Date(r.outTime))}</td>
                        <td style={{ ...S.td, color:"#64748b" }}>{r.breakMin||0}分</td>
                        <td style={{ ...S.td, color:"#1e40af", fontWeight:700, whiteSpace:"nowrap" }}>{formatHours(r.duration)}</td>
                        <td style={{ ...S.td, color:"#64748b", fontSize:11 }}>{r.note||"-"}</td>
                        <td style={S.td}>
                          <div style={{ display:"flex", gap:4 }}>
                            <button onClick={() => setEditRec({ ...r })}
                              style={{ background:"#eff6ff", border:"none", borderRadius:6, color:"#1e40af", cursor:"pointer", fontSize:12, padding:"3px 7px", fontWeight:600 }}>編集</button>
                            <button onClick={() => deleteRecord(r.id)}
                              style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:15, padding:"0 3px" }}>×</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:"#f8fafc" }}>
                      <td colSpan={4} style={{ ...S.td, fontWeight:700 }}>合計実働</td>
                      <td style={{ ...S.td, fontWeight:800, color:"#1e40af" }}>{formatHours(totalMinutes)}</td>
                      <td colSpan={2} style={S.td}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}

        {/* ===== 請求書 ===== */}
        {tab === "invoice" && (
          <>
            <div style={{ ...S.card, padding:"14px 16px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>対象月:</span>
                <input type="month" value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)}
                  style={{ ...S.inp, width:"auto", padding:"6px 10px" }} />
              </div>
            </div>

            {/* 送信ボタン */}
            <div style={S.card}>
              <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:6 }}>
                送信先: <span style={{ color:"#1e40af" }}>{settings.clientEmail || "（設定でメールを登録してください）"}</span>
              </div>
              <button style={S.btnOrange} onClick={sendMail}>
                📧 Gmailで請求書を送信する
              </button>
              <div style={{ marginTop:8, fontSize:11, color:"#94a3b8" }}>
                タップするとメールアプリが開き、件名・本文・勤務明細が自動入力されます
              </div>
            </div>

            {/* 請求書プレビュー */}
            <div style={{ ...S.card, padding:"24px 18px" }}>
              <div style={{ fontSize:20, fontWeight:800, color:"#1e293b", borderBottom:"3px solid #1e40af", paddingBottom:10, marginBottom:18, letterSpacing:3 }}>
                請　求　書
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16, gap:10, flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>請求先</div>
                  <div style={{ fontSize:15, fontWeight:700, color:"#1e293b" }}>{settings.clientName||"（取引先名）"} 御中</div>
                  <div style={{ fontSize:11, color:"#475569", marginTop:2, whiteSpace:"pre-line" }}>{settings.clientAddress}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:11, color:"#64748b", marginBottom:2 }}>発行者</div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>{settings.myName||"（名前）"}</div>
                  <div style={{ fontSize:11, color:"#475569", marginTop:2, whiteSpace:"pre-line", textAlign:"right" }}>{settings.myAddress}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:12, marginBottom:16, fontSize:11, color:"#64748b", flexWrap:"wrap" }}>
                <span>No: <strong style={{ color:"#1e293b" }}>INV-{String(settings.invoiceNo).padStart(4,"0")}</strong></span>
                <span>発行日: <strong style={{ color:"#1e293b" }}>{new Date().toLocaleDateString("ja-JP")}</strong></span>
                <span>対象: <strong style={{ color:"#1e293b" }}>{invoiceMonth.replace("-","年")}月</strong></span>
              </div>
              <div style={{ background:"#eff6ff", borderRadius:10, padding:"12px 16px", marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:13, color:"#1e40af", fontWeight:600 }}>ご請求金額（税込）</span>
                <span style={{ fontSize:22, fontWeight:800, color:"#1e40af" }}>¥{totalWithTax.toLocaleString()}</span>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:12, fontSize:12 }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width:"40%" }}>品目</th>
                    <th style={{ ...S.th, textAlign:"right" }}>時間</th>
                    <th style={{ ...S.th, textAlign:"right" }}>単価</th>
                    <th style={{ ...S.th, textAlign:"right" }}>金額</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={S.td}>業務委託費（{invoiceMonth.replace("-","年")}月分）</td>
                    <td style={{ ...S.td, textAlign:"right" }}>{(totalMinutes/60).toFixed(2)}h</td>
                    <td style={{ ...S.td, textAlign:"right" }}>¥{settings.hourlyRate.toLocaleString()}/h</td>
                    <td style={{ ...S.td, textAlign:"right", fontWeight:700 }}>¥{totalAmount.toLocaleString()}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ ...S.td, textAlign:"right", fontWeight:700 }}>小計</td>
                    <td style={{ ...S.td, textAlign:"right", fontWeight:700 }}>¥{totalAmount.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} style={{ ...S.td, textAlign:"right", color:"#64748b" }}>消費税（10%）</td>
                    <td style={{ ...S.td, textAlign:"right", color:"#64748b" }}>¥{tax.toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderTop:"2px solid #1e40af" }}>
                    <td colSpan={3} style={{ ...S.td, textAlign:"right", fontWeight:800, fontSize:14 }}>合計</td>
                    <td style={{ ...S.td, textAlign:"right", fontWeight:800, fontSize:14, color:"#1e40af" }}>¥{totalWithTax.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
              {monthRecords.length > 0 && (
                <div style={{ marginTop:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#475569", borderBottom:"2px solid #e2e8f0", paddingBottom:5 }}>
                    勤務明細（{monthRecords.length}日）
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                    <thead>
                      <tr>
                        <th style={S.th}>日付</th>
                        <th style={{ ...S.th, textAlign:"center" }}>出勤</th>
                        <th style={{ ...S.th, textAlign:"center" }}>退勤</th>
                        <th style={{ ...S.th, textAlign:"center" }}>休憩</th>
                        <th style={{ ...S.th, textAlign:"right" }}>実働</th>
                        <th style={S.th}>作業内容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthRecords.map((r) => (
                        <tr key={r.id}>
                          <td style={{ ...S.td, whiteSpace:"nowrap" }}>{toDateStr(new Date(r.inTime))}</td>
                          <td style={{ ...S.td, textAlign:"center" }}>{toHHMM(new Date(r.inTime))}</td>
                          <td style={{ ...S.td, textAlign:"center" }}>{toHHMM(new Date(r.outTime))}</td>
                          <td style={{ ...S.td, textAlign:"center", color:"#64748b" }}>{r.breakMin||0}分</td>
                          <td style={{ ...S.td, textAlign:"right", fontWeight:600 }}>{formatHours(r.duration)}</td>
                          <td style={{ ...S.td, color:"#64748b" }}>{r.note||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop:"1.5px solid #cbd5e1", background:"#f8fafc" }}>
                        <td colSpan={4} style={{ ...S.td, fontWeight:700 }}>合計実働時間</td>
                        <td style={{ ...S.td, textAlign:"right", fontWeight:800, color:"#1e40af" }}>{formatHours(totalMinutes)}</td>
                        <td style={S.td}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <div style={{ marginTop:18, fontSize:11, color:"#94a3b8", borderTop:"1px solid #e2e8f0", paddingTop:10 }}>
                お振込期限: {dueDate}（翌月末）
              </div>
            </div>
          </>
        )}

        {/* ===== 設定 ===== */}
        {tab === "settings" && (
          <>
            <div style={S.card}>
              <div style={{ fontWeight:700, color:"#1e293b", marginBottom:16, fontSize:15 }}>基本設定</div>
              {[
                { key:"myName", label:"自分の名前・屋号", placeholder:"例: 山田 太郎" },
                { key:"myAddress", label:"住所・連絡先", placeholder:"例: 東京都渋谷区〇〇\nmail: xxx@example.com", multi:true },
                { key:"clientName", label:"取引先名", placeholder:"例: 株式会社〇〇" },
                { key:"clientAddress", label:"取引先住所", placeholder:"例: 東京都港区〇〇", multi:true },
                { key:"clientEmail", label:"送信先メールアドレス", placeholder:"例: client@example.com" },
              ].map(({ key, label, placeholder, multi }) => (
                <div key={key} style={{ marginBottom:14 }}>
                  <label style={S.lbl}>{label}</label>
                  {multi ? (
                    <textarea rows={2} value={settings[key]||""} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                      placeholder={placeholder} style={{ ...S.inp, resize:"vertical" }} />
                  ) : (
                    <input type="text" value={settings[key]||""} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                      placeholder={placeholder} style={S.inp} />
                  )}
                </div>
              ))}
              <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                <div style={{ flex:1 }}>
                  <label style={S.lbl}>時給単価（円）</label>
                  <input type="number" value={settings.hourlyRate}
                    onChange={(e) => setSettings({ ...settings, hourlyRate: Number(e.target.value) })} style={S.inp} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={S.lbl}>請求書番号</label>
                  <input type="number" value={settings.invoiceNo}
                    onChange={(e) => setSettings({ ...settings, invoiceNo: Number(e.target.value) })} style={S.inp} />
                </div>
              </div>
              <div style={{ marginTop:16 }}>
                <button style={S.btnBlue} onClick={() => { persistSettings(settings); setSaved(true); setTimeout(() => setSaved(false), 2500); }}>
                  {saved ? "✓ 保存しました" : "設定を保存"}
                </button>
              </div>
            </div>
            <div style={{ ...S.card, borderLeft:"4px solid #f59e0b", background:"#fffbeb" }}>
              <div style={{ fontSize:12, color:"#92400e", fontWeight:700, marginBottom:4 }}>⚠️ データについて</div>
              <div style={{ fontSize:12, color:"#78350f" }}>データはこのブラウザのlocalStorageに保存されます。ブラウザのデータ消去で失われます。</div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
