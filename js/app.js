/* B1TCore clientseitige Logik: i18n & Blockchain-Status */

const i18n = {
  current: 'en',
  data: {},
  async load(lang) {
    const response = await fetch(`./i18n/${lang}.json`);
    if (!response.ok) throw new Error('i18n load failed');
    this.data = await response.json();
    this.current = lang;
  },
  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const value = key.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), this.data);
      if (value !== undefined) el.textContent = value;
    });
    document.documentElement.lang = this.current;
  }
};

const API_BASE = 'https://b1texplorer.com';
const HALVING_INTERVAL = 210000;
const BLOCK_TIME_SECONDS = 60;
const CURRENT_REWARD_B1T = 2.5;

async function fetchNumber(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  const num = Number(txt);
  if (Number.isNaN(num)) throw new Error('Not a number');
  return num;
}

async function loadStatus() {
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const showError = (v) => { const el = document.getElementById('statusError'); if (el) el.classList.toggle('hidden', !v); };
  showError(false);

  try {
    // Blockhöhe
    const height = await fetchNumber(`${API_BASE}/api/getblockcount`);
    setText('blockHeight', height.toLocaleString());
    setText('blockHeightHero', height.toLocaleString());

    // Halving & Reward
    try {
      setText('currentReward', `${CURRENT_REWARD_B1T} B1T`);
      const nextHalvingHeight = (Math.floor(height / HALVING_INTERVAL) + 1) * HALVING_INTERVAL;
      const blocksToHalving = Math.max(0, nextHalvingHeight - height);
      setText('nextHalvingHeight', nextHalvingHeight.toLocaleString());
      setText('blocksToHalving', blocksToHalving.toLocaleString());
      startHalvingCountdown(blocksToHalving);
    } catch {}

    // Umlaufende Menge (B1T)
    const supply = await fetchNumber(`${API_BASE}/ext/getmoneysupply`);
    const supplyStr = `${supply.toLocaleString(undefined, { maximumFractionDigits: 0 })} B1T`;
    setText('circulatingSupply', supplyStr);
    setText('circulatingSupplyHero', supplyStr);

    // Difficulty
    const diff = await fetchNumber(`${API_BASE}/api/getdifficulty`);
    setText('difficulty', Number.isFinite(diff) ? diff.toLocaleString() : '—');

    // Hashrate
    try {
      const hashrate = await fetchNumber(`${API_BASE}/api/getnetworkhashps`);
      // Anzeige in MH/s oder GH/s je nach Größe
      const units = ['H/s','kH/s','MH/s','GH/s','TH/s','PH/s'];
      let hr = hashrate, u = 0;
      while (hr >= 1000 && u < units.length - 1) { hr /= 1000; u++; }
      setText('hashrate', `${hr.toFixed(2)} ${units[u]}`);
    } catch {}

    // Preis (USDT)
    try {
      const res = await fetch(`${API_BASE}/ext/getprice`, { cache: 'no-store' });
      let priceUsdt = '—';
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          const p = data.last_price_usdt ?? data.USDT ?? data.usdt ?? data.price_usdt;
          if (typeof p === 'number') priceUsdt = p;
          else if (typeof p === 'string') {
            const n = Number(p);
            if (!Number.isNaN(n)) priceUsdt = n;
          }
        } catch {
          const n = Number(text);
          if (!Number.isNaN(n)) priceUsdt = n;
        }
      }
      if (typeof priceUsdt === 'number') priceUsdt = `${priceUsdt.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`;
      setText('priceUsdt', String(priceUsdt));
    } catch {}

    const now = new Date();
    setText('lastUpdated', `${i18n.data?.status?.updated || 'Zuletzt aktualisiert'}: ${now.toLocaleTimeString()}`);
  } catch (e) {
    console.error(e);
    showError(true);
  }
}

let halvingTimerId;
function startHalvingCountdown(blocksToHalving) {
  const etaMs = Date.now() + (blocksToHalving * BLOCK_TIME_SECONDS * 1000);
  const el = document.getElementById('halvingCountdown');
  if (!el) return;
  if (halvingTimerId) clearInterval(halvingTimerId);
  const tick = () => {
    const diff = etaMs - Date.now();
    if (diff <= 0) { el.textContent = '0d 00:00:00'; clearInterval(halvingTimerId); return; }
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    el.textContent = `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };
  tick();
  halvingTimerId = setInterval(tick, 1000);
}

async function init() {
  const saved = localStorage.getItem('lang');
  const available = ['en','de','fr','id','vi','zh','sv','ru','pt','es'];
  const browserLang = (() => {
    const langs = navigator.languages || [navigator.language || 'en'];
    const norm = (s) => (s || '').toLowerCase().split('-')[0];
    for (const l of langs) {
      const n = norm(l);
      if (available.includes(n)) return n;
    }
    return 'en';
  })();
  const initLang = saved || browserLang;
  try {
    await i18n.load(initLang);
  } catch {
    await i18n.load('en');
  }
  i18n.apply();

  const select = document.getElementById('langSelect');
  if (select) {
    select.value = i18n.current;
    select.addEventListener('change', async (e) => {
      const lang = e.target.value;
      localStorage.setItem('lang', lang);
      await i18n.load(lang);
      i18n.apply();
    });
  }

  await loadStatus();
  setInterval(loadStatus, 60_000); // alle 60s aktualisieren
}

document.addEventListener('DOMContentLoaded', init);

// Links laden
async function loadLinks() {
  try {
    const res = await fetch('./data/links.json');
    if (!res.ok) return;
    const data = await res.json();
    // Labels: bekannte Gruppen hübsch betiteln, unbekannte => Key kapitalisieren
    const labelFor = (key) => {
      const known = {
        socials: 'Socials', wallets: 'Wallets', explorers: 'Explorers', exchanges: 'Exchanges',
        code: 'Code', community: 'Community', services: 'Services', others: 'Others', rabb1ts: 'Rabb1ts'
      };
      if (known[key]) return known[key];
      return String(key).charAt(0).toUpperCase() + String(key).slice(1);
    };

    // tatsächlich vorhandene Gruppen aus JSON holen (nur Arrays mit Einträgen)
    const present = Object.keys(data).filter(k => k !== 'order' && Array.isArray(data[k]) && data[k].length > 0);
    if (present.length === 0) return; // nichts zu rendern

    // Reihenfolge bestimmen: erst aus data.order, dann Rest anhängen
    const defaultOrder = ['socials','wallets','explorers','exchanges','code','community','services','others','rabb1ts'];
    const baseOrder = Array.isArray(data.order) && data.order.length ? data.order : defaultOrder;
    const ordered = [...baseOrder.filter(k => present.includes(k)), ...present.filter(k => !baseOrder.includes(k))];

    // Container leeren und vollständig dynamisch aufbauen
    const container = document.getElementById('linksContainer');
    if (!container) return;
    container.innerHTML = '';

    ordered.forEach(groupKey => {
      const items = data[groupKey];
      // Section erstellen
      const details = document.createElement('details');
      details.className = 'glass p-4 rounded-lg border border-white/10';
      details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'font-semibold text-white/90 mb-3 cursor-pointer';
      summary.textContent = labelFor(groupKey);
      details.appendChild(summary);

      const ul = document.createElement('ul');
      ul.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';
      ul.id = `linksGroup-${groupKey}`;

      items.forEach(i => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = i.url; a.textContent = i.name; a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'glass inline-flex items-center justify-between gap-2 px-3 py-2 rounded border border-white/10 text-brand hover:text-white hover:bg-brand/10 transition';
        const arrow = document.createElement('span');
        arrow.textContent = '↗';
        arrow.className = 'text-xs opacity-70';
        a.appendChild(arrow);
        li.appendChild(a);
        ul.appendChild(li);
      });

      details.appendChild(ul);
      container.appendChild(details);
    });
  } catch (e) { console.warn('links', e); }
}

document.addEventListener('DOMContentLoaded', loadLinks);

// Neueste Transaktionen laden
async function loadLatestTxs() {
  const container = document.getElementById('latestTxs');
  const err = document.getElementById('latestTxsError');
  if (!container) return;
  const showError = (v) => { if (err) err.classList.toggle('hidden', !v); };
  showError(false);
  container.innerHTML = '';
  try {
    const res = await fetch('https://b1texplorer.com/ext/getlasttxs/100/0/9', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    const fmtTimeUTC = (ts) => {
      const d = new Date(Number(ts) * 1000);
      const s = d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
      return `${s} UTC`;
    };
    list.forEach(tx => {
      const card = document.createElement('div');
      card.className = 'glass rounded-xl p-4 border border-white/10';
      // Headline: Blockhöhe, Amount (B1T) und Zeit (UTC) groß
      const headline = document.createElement('div');
      headline.className = 'text-xl md:text-2xl font-bold space-y-1';
      const blockLink = document.createElement('a');
      blockLink.href = `https://b1texplorer.com/block/${tx.blockhash}`;
      blockLink.target = '_blank';
      blockLink.rel = 'noopener noreferrer';
      blockLink.className = 'text-white hover:text-brand hover:underline';
      const blockLabel = i18n.data?.latest?.block || 'Block';
      blockLink.textContent = `${blockLabel} ${tx.blockindex}`;
      headline.appendChild(blockLink);
      const amount = document.createElement('div');
      const amtStr = Number(tx.amount).toLocaleString(undefined, { maximumFractionDigits: 8 });
      amount.className = 'text-brand';
      amount.textContent = `${amtStr} B1T`;
      headline.appendChild(amount);
      const time = document.createElement('div');
      time.className = 'text-white/80';
      time.textContent = fmtTimeUTC(tx.timestamp);
      headline.appendChild(time);
      card.appendChild(headline);

      // Rest kleiner: TxID (gekürzt) und Empfängeranzahl
      const meta = document.createElement('div');
      meta.className = 'text-xs text-gray-300 mt-3';
      const txLink = document.createElement('a');
      txLink.href = `https://b1texplorer.com/tx/${tx.txid}`;
      txLink.target = '_blank';
      txLink.rel = 'noopener noreferrer';
      txLink.className = 'text-brand hover:underline';
      const shortTx = `${String(tx.txid).slice(0, 12)}…${String(tx.txid).slice(-8)}`;
      txLink.textContent = shortTx;
      const txidLabel = i18n.data?.latest?.txid || 'TxID';
      meta.append(`${txidLabel}: `);
      meta.appendChild(txLink);
      const recipientsLabel = i18n.data?.latest?.recipients || 'Recipients';
      meta.append(` · ${recipientsLabel}: ${tx.recipients}`);
      card.appendChild(meta);

      container.appendChild(card);
    });
  } catch (e) {
    console.warn('latestTxs', e);
    showError(true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadLatestTxs();
  setInterval(loadLatestTxs, 60_000);
});

// Exchanges Logos Grid
async function loadExchangesGrid() {
  const container = document.getElementById('exchangesGrid');
  if (!container) return;
  container.innerHTML = '';
  try {
    const res = await fetch('./data/links.json');
    if (!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data.exchanges) ? data.exchanges : [];

    // Logo-Quellen laut Vorgabe
    const logos = {
      'SafeTrade': 'https://safetrade.com/_nuxt/rectangular_logo.DLlWT1dC.png',
      'Exbitron': 'https://app.exbitron.com/images/logo-light.svg',
      'BIT.COM': 'https://www.bit.com/_next/static/media/logo.680abac3.png',
      'NestEx': 'https://trade.nestex.one/img/nestex-1.png',
      'BITGOGET': 'https://bitgoget.com/resources/logo/logo-text.webp',
      'KlingEx': 'https://klingex.io/symbol.svg'
    };

    items.forEach(item => {
      const a = document.createElement('a');
      a.href = item.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.className = 'glass rounded-xl p-4 border border-white/10 flex items-center justify-center hover:bg-brand/10 transition';

      const img = document.createElement('img');
      img.src = logos[item.name] || '';
      img.alt = item.name;
      img.className = 'h-10 object-contain';

      // Fallback: wenn kein Logo bekannt oder Laden fehlschlägt, zeige Text
      img.onerror = () => {
        a.innerHTML = '';
        const span = document.createElement('span');
        span.textContent = item.name;
        span.className = 'text-sm font-semibold text-white';
        a.appendChild(span);
      };

      if (img.src) {
        a.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.textContent = item.name;
        span.className = 'text-sm font-semibold text-white';
        a.appendChild(span);
      }

      container.appendChild(a);
    });
  } catch (e) { console.warn('exchangesGrid', e); }
}

document.addEventListener('DOMContentLoaded', loadExchangesGrid);

// Rabbit animation
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('rabbitCta');
  const overlay = document.getElementById('rabbitOverlay');
  if (btn && overlay) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      overlay.classList.remove('hidden');
      overlay.classList.add('flex');
      setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
      }, 3200);
    });
  }
});