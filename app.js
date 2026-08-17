import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const db = createClient('https://gozalxkeiwyofcfhoycn.supabase.co', 'sb_publishable_vB4k_lPzs9aSxiIJ0W8Xjg_LAsT5XAu');
const $ = s => document.querySelector(s), query = new URLSearchParams(location.search);
let room = query.get('room'), hostMode = query.get('host') === '1', hostToken = '', name = '', ticket = [], marked = [], called = [];
const key = what => `cc-live-${what}-${room}`;
const toast = msg => { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); };
const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function makeTicket() {
  let seed = [...(room + name + (localStorage.getItem('cc-device') || crypto.randomUUID()))].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17);
  localStorage.setItem('cc-device', localStorage.getItem('cc-device') || crypto.randomUUID());
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const pools = Array.from({ length: 9 }, (_, c) => { const low = c ? c * 10 : 1, high = c === 8 ? 90 : c * 10 + 9; return Array.from({ length: high - low + 1 }, (_, i) => low + i).sort(() => rand() - .5).slice(0, 3); });
  const rows = Array.from({ length: 3 }, () => Array(9).fill(null));
  rows.forEach(row => Array.from({ length: 9 }, (_, i) => i).sort(() => rand() - .5).slice(0, 5).forEach(col => { row[col] = pools[col].pop(); }));
  return rows.flat();
}
function storePlayer() { localStorage.setItem(key('name'), name); localStorage.setItem(key('ticket'), JSON.stringify(ticket)); localStorage.setItem(key('marked'), JSON.stringify(marked)); }
function restorePlayer() { name = localStorage.getItem(key('name')) || ''; ticket = JSON.parse(localStorage.getItem(key('ticket')) || '[]'); marked = JSON.parse(localStorage.getItem(key('marked')) || '[]'); }
function render() {
  $('#roomLabel').textContent = `Room ${room}`; $('#roleLabel').textContent = hostMode ? 'Host control room' : 'Guest reading room'; $('#ticketTitle').textContent = `${name}'s ticket`;
  $('#current').textContent = called[0] ?? '—'; $('#numberMessage').textContent = called.length ? (hostMode ? 'Your guests can see it now.' : 'Your host has drawn this number.') : (hostMode ? 'Invite everyone, then begin.' : 'Waiting for your host to begin…');
  $('#draw').classList.toggle('hidden', !hostMode); $('#markCount').textContent = `${marked.length} / 15 marked`; $('#historyCount').textContent = called.length;
  $('#ticket').innerHTML = ticket.map(n => n === null ? '<div class="cell empty"></div>' : `<button class="cell ${called.includes(n) ? 'called' : ''} ${marked.includes(n) ? 'marked' : ''}" data-n="${n}">${n}</button>`).join('');
  $('#history').innerHTML = called.map(n => `<span>${n}</span>`).join('');
}
async function fetchRoom() { const { data, error } = await db.from('chapter_charm_rooms').select('called_numbers').eq('room_id', room).single(); if (error || !data) { toast('Room not found. Ask the host for a new invite.'); return false; } called = data.called_numbers || []; return true; }
function subscribe() {
  db.channel(`room-${room}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chapter_charm_rooms', filter: `room_id=eq.${room}` }, p => { called = p.new.called_numbers || []; render(); if (!hostMode && called.length) toast(`Number ${called[0]} has been drawn!`); }).subscribe();
  db.channel(`claims-${room}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chapter_charm_claims', filter: `room_id=eq.${room}` }, p => announce(p.new)).subscribe();
}
function announce(claim) { $('#winnerAward').textContent = `${claim.award}!`; $('#winnerName').textContent = `${claim.player_name} has claimed ${claim.award}.`; $('#winner').classList.remove('hidden'); }
async function enter() {
  const typedName = $('#name').value.trim() || (hostMode ? 'Host' : 'Guest');
  if (!room) { hostMode = true; room = roomCode(); hostToken = crypto.randomUUID(); const { error } = await db.rpc('cc_create_room', { p_room: room, p_token: hostToken }); if (error) return toast('Room could not be created. Run the setup SQL first.'); localStorage.setItem(key('host-token'), hostToken); history.replaceState({}, '', `${location.pathname}?host=1&room=${room}`); }
  if (hostMode) { hostToken ||= localStorage.getItem(key('host-token')) || ''; if (!hostToken) return toast('This host link must be opened on the host device.'); }
  if (!await fetchRoom()) return; restorePlayer(); name ||= typedName; if (!ticket.length) ticket = makeTicket(); storePlayer(); $('#welcome').classList.add('hidden'); $('#game').classList.remove('hidden'); render(); subscribe();
}
async function draw() { let n; if (!hostMode) return; do n = Math.floor(Math.random() * 90) + 1; while (called.includes(n)); const { data, error } = await db.rpc('cc_draw_number', { p_room: room, p_token: hostToken, p_number: n }); if (error) return toast('Could not draw a number.'); called = data; render(); }
async function claim(award) { const row = { 'Top Line': 0, 'Middle Line': 1, 'Bottom Line': 2 }[award], need = award === 'Early Five' ? 5 : award === 'Full House' ? 15 : 5, count = row === undefined ? marked.length : ticket.slice(row * 9, row * 9 + 9).filter(n => n && marked.includes(n)).length; if (count < need) return toast(`${award} needs ${need - count} more mark${need - count === 1 ? '' : 's'}.`); const { error } = await db.from('chapter_charm_claims').insert({ room_id: room, player_name: name, award }); if (error) return toast('That prize was already claimed.'); }
$('#enter').onclick = enter; $('#name').addEventListener('keydown', e => { if (e.key === 'Enter') enter(); }); $('#draw').onclick = draw;
$('#invite').onclick = async () => { const link = `${location.origin}${location.pathname}?room=${room}`; try { await navigator.clipboard.writeText(link); toast('Guest link copied — send it to everyone!'); } catch { prompt('Copy this guest link:', link); } };
$('#ticket').onclick = e => { const n = Number(e.target.dataset.n); if (!n) return; if (!called.includes(n)) return toast('That number has not been called yet.'); marked = marked.includes(n) ? marked.filter(x => x !== n) : [...marked, n]; storePlayer(); render(); };
$('#claimButtons').onclick = e => { const b = e.target.closest('button'); if (b) claim(b.dataset.award); }; $('#closeWinner').onclick = () => $('#winner').classList.add('hidden');
if (room && !hostMode) { $('#welcomeKicker').textContent = 'Guest reading room'; $('#welcomeTitle').textContent = 'Join the Tambola table.'; $('#welcomeText').textContent = 'Your host draws the numbers. You receive your own ticket and mark it as the story unfolds.'; $('#enter').innerHTML = 'Join the game <span>→</span>'; $('#welcomeNote').textContent = 'Guests can play and claim prizes, but cannot draw numbers.'; }
if (room && hostMode) { $('#welcomeTitle').textContent = 'Return to your host room.'; $('#enter').innerHTML = 'Open host room <span>→</span>'; }
