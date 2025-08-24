/* HearthPlay Web - נגן מגנט בדפדפן (ללא שרת) */
const video = document.getElementById('video')
const playBtn = document.getElementById('playBtn')
const stopBtn = document.getElementById('stopBtn')
const magnetInput = document.getElementById('magnet')
const peersEl = document.getElementById('peers')
const speedEl = document.getElementById('speed')
const progressEl = document.getElementById('progress')
const subsFile = document.getElementById('subsFile')
const subsUrl = document.getElementById('subsUrl')
const loadSubsBtn = document.getElementById('loadSubsBtn')
const langSelect = document.getElementById('langSelect')
const searchSubsBtn = document.getElementById('searchSubsBtn')
const subsResultsEl = document.getElementById('subsResults')

const client = new WebTorrent()
let currentTorrent = null
let currentTitle = ''
let jwt = ''

// הגדרת Proxy (ערוך לפני פריסה) – חייב לאפשר CORS
const PROXY = '' // דוגמה: 'https://your-proxy.example.com'
const OS_API_KEY = ''
const OS_USER = ''
const OS_PASS = ''

const DEFAULT_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
]

playBtn.onclick = () => {
  const magnet = magnetInput.value.trim()
  if (!magnet) { alert('הדבק מגנט'); return }
  if (currentTorrent) { stopAndClean() }
  client.add(magnet, { announce: DEFAULT_TRACKERS }, (torrent) => {
    currentTorrent = torrent
    // עדכון כותרת בעת קבלת metadata
    if (torrent.name) currentTitle = torrent.name
    torrent.on('metadata', () => { if (torrent.name) currentTitle = torrent.name })
    torrent.on('error', (e)=> console.warn('torrent error', e))
    torrent.on('warning', (w)=> console.warn('torrent warn', w))
    const file = pickBestVideoFile(torrent.files)
    if (!file) { alert('לא נמצא קובץ וידאו בטורנט'); return }
    file.renderTo(video, { autoplay: true })
    bindStats(torrent)
    // אם אין peers אחרי זמן מה – עדכון למשתמש
    setTimeout(()=>{
      if (currentTorrent === torrent && (torrent.numPeers||0) === 0) {
        alert('אין חיבור ל-peers. נסה מגנט עם WebRTC trackers (wss) או מגנט אחר.')
      }
    }, 12000)
  })
}

stopBtn.onclick = stopAndClean

function stopAndClean(){
  try { if (currentTorrent) currentTorrent.destroy() } catch {}
  currentTorrent = null
  video.removeAttribute('src'); video.load()
  // ניקוי cache בדפדפן (בגדול הדפדפן מנהל; זה מנקה חיבורים/זיכרון של הטורנט)
  try { client.torrents.forEach(t => t.destroy()) } catch {}
}

function pickBestVideoFile(files){
  const prefer = ['.mp4','.webm','.m4v','.mov','.mkv']
  const sorted = files.slice().sort((a,b)=> preferIndex(a)-preferIndex(b))
  return sorted[0]
  function preferIndex(f){
    const n = f.name.toLowerCase()
    for (let i=0;i<prefer.length;i++) if (n.endsWith(prefer[i])) return i
    return 999
  }
}

function bindStats(t){
  const iv = setInterval(()=>{
    if (!currentTorrent || currentTorrent.destroyed) { clearInterval(iv); return }
    peersEl.textContent = String(t.numPeers)
    speedEl.textContent = Math.round((t.downloadSpeed||0)/1024)
    progressEl.textContent = Math.round((t.progress||0)*100)+'%'
  }, 500)
}

// חיווי שגיאות גלובלי של הלקוח
client.on('error', (e)=> console.warn('client error', e))

// כתוביות: טעינת קובץ .srt/.vtt מקומי או URL (דורש CORS)
loadSubsBtn.onclick = async () => {
  try {
    let text = ''
    if (subsFile.files[0]) {
      text = await subsFile.files[0].text()
      const ext = subsFile.files[0].name.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt'
      applySubtitleText(text, ext)
      return
    }
    const url = subsUrl.value.trim()
    if (url) {
      const res = await fetch(url)
      if (!res.ok) throw new Error('fetch failed')
      const ct = (res.headers.get('content-type')||'').toLowerCase()
      const ext = ct.includes('srt') || url.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt'
      text = await res.text()
      applySubtitleText(text, ext)
      return
    }
    alert('בחר קובץ כתוביות או הדבק URL')
  } catch(e){
    alert('כשל טעינת כתוביות: '+e.message)
  }
}

function applySubtitleText(text, ext){
  const vtt = ext==='srt' ? srtToVtt(text) : text
  const blob = new Blob([vtt], { type: 'text/vtt' })
  const url = URL.createObjectURL(blob)
  // הסר רצועות קיימות
  ;[...video.querySelectorAll('track')].forEach(tr=>tr.remove())
  const track = document.createElement('track')
  track.kind = 'subtitles'
  track.label = 'עברית'
  track.srclang = 'he'
  track.default = true
  track.src = url
  video.appendChild(track)
}

// המרה בסיסית SRT->VTT (פשוטה כדי להימנע מספריות גדולות)
function srtToVtt(srt){
  const body = srt
    .replace(/\r/g,'')
    .replace(/^(\d+)$/gm,'')
    .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g,'$1.$2')
  return 'WEBVTT\n\n'+body.trim()
}

// ===== Proxy Auth + חיפוש/הורדת כתוביות (ללא fs) =====
async function initProxyAuth(){
  try {
    if (!PROXY || !OS_API_KEY || !OS_USER || !OS_PASS) return
    const res = await fetch(`${PROXY}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Api-Key': OS_API_KEY },
      body: JSON.stringify({ username: OS_USER, password: OS_PASS })
    })
    if (!res.ok) return
    const data = await res.json().catch(()=>({}))
    const tok = data.token || data.jwt || data.access_token || data.accessToken
    if (tok) jwt = `Bearer ${tok}`
  } catch(_){}
}

searchSubsBtn && (searchSubsBtn.onclick = () => searchSubtitles())

async function searchSubtitles(){
  try {
    const title = currentTitle || ''
    if (!PROXY) { alert('הגדר URL של ה-Proxy בקובץ app.js'); return }
    if (!title) { alert('אין שם טורנט (metadata)'); return }
    subsResultsEl.innerHTML = '<div class="loading">מחפש תרגומים...</div>'
    const url = new URL(`${PROXY}/subtitles`)
    url.searchParams.set('query', title)
    url.searchParams.set('languages', (langSelect?.value||'he'))
    url.searchParams.set('order_by', 'download_count')
    url.searchParams.set('order_direction', 'desc')
    const headers = { 'Api-Key': OS_API_KEY }
    if (jwt) headers['Authorization'] = jwt
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) throw new Error('search failed')
    const data = await res.json().catch(()=>({}))
    const items = Array.isArray(data?.data) ? data.data : []
    renderSubsResults(items)
  } catch(e){
    subsResultsEl.innerHTML = '<div class="error">שגיאה בחיפוש</div>'
  }
}

function renderSubsResults(items){
  if (!items.length){ subsResultsEl.innerHTML = '<div class="empty">לא נמצאו תרגומים</div>'; return }
  const lang = (langSelect?.value||'he').toUpperCase()
  subsResultsEl.innerHTML = items.map(it=>{
    const id = (it?.attributes?.files?.[0]?.file_id) || it?.attributes?.file_id || it?.id
    const release = it?.attributes?.release || it?.attributes?.feature?.title || 'ללא שם'
    const downloads = it?.attributes?.download_count || 0
    const uploader = it?.attributes?.uploader?.name || ''
    return `<div class="result" data-id="${id}">
      <div class="meta"><div class="name">${escapeHtml(release)}</div>
      <div class="muted">${lang} · ${downloads} הורדות ${uploader? '· '+escapeHtml(uploader): ''}</div></div>
      <div class="actions"><button class="btn" data-fileid="${id}">הורד</button></div>
    </div>`
  }).join('')
  subsResultsEl.querySelectorAll('button[data-fileid]').forEach(btn=>{
    btn.addEventListener('click', ()=> downloadSubtitle(btn.getAttribute('data-fileid')))
  })
}

function escapeHtml (s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])) }

async function downloadSubtitle(fileId){
  if (!fileId) return
  try {
    if (!PROXY) { alert('הגדר URL של ה-Proxy בקובץ app.js'); return }
    const headers = { 'Accept': 'text/plain, text/vtt, application/octet-stream', 'Api-Key': OS_API_KEY }
    if (jwt) headers['Authorization'] = jwt
    // צפייה שהפרוקסי מחזיר תוכן כתובית ישירות (עם CORS)
    const res = await fetch(`${PROXY}/download?file_id=${encodeURIComponent(fileId)}`, { headers })
    if (!res.ok) throw new Error('download failed')
    const ct = (res.headers.get('content-type')||'').toLowerCase()
    const isSrt = ct.includes('srt')
    const text = await res.text()
    applySubtitleText(text, isSrt ? 'srt' : 'vtt')
  } catch(e){
    alert('שגיאה בהורדת כתוביות')
  }
}

// אתחול התחברות לפרוקסי אם מולאו פרטים
initProxyAuth().catch(()=>{})
