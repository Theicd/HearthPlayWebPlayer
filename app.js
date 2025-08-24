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
  'wss://tracker.btorrent.xyz',
  'wss://tracker.fastcast.nz',
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
    const file = pickBestVideoFile(torrent.files)
    if (!file) { alert('לא נמצא קובץ וידאו בטורנט'); return }
    file.renderTo(video, { autoplay: true })
    bindStats(torrent)
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
