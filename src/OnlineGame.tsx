import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, Copy, Crown, Home, RotateCcw, Users, Wifi, Zap,
} from 'lucide-react';
import {
  Board, Color, LegalMove, Move, allLegalMoves, charOf, cloneBoard, doMove,
  findKing, initialBoard, isInCheck, legalMovesFor,
} from './game/xiangqi';
import { cloud } from './game/cloud';
import { sfx } from './game/audio';
import ParticleCanvas, { type ParticleHandle } from './components/ParticleCanvas';

type RoomStatus = 'waiting' | 'playing' | 'finished';
interface RoomRow {
  code: string;
  status: RoomStatus;
  moves: Move[];
  move_count: number;
  red_seat: string | null;
  black_seat: string | null;
  winner: string | null;
  updated_at: string;
}

function randomSeat(): string {
  try {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return Array.from(arr, (n) => n.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}
function getSeat(): string {
  try {
    let s = localStorage.getItem('xq-seat');
    if (!s) { s = randomSeat(); localStorage.setItem('xq-seat', s); }
    return s;
  } catch {
    return randomSeat();
  }
}
function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function msgOf(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e || '');
  if (/duplicate|23505/i.test(m)) return '房间号已存在，请重试';
  if (/permission|42501/i.test(m)) return '权限不足，请稍后重试';
  if (/fetch|network|failed/i.test(m)) return '网络异常，请检查网络后重试';
  return m.slice(0, 80) || '操作失败，请重试';
}

async function fetchRoom(code: string): Promise<RoomRow | null> {
  const { data, error } = await cloud.database.from('rooms').select('*').eq('code', code).maybeSingle();
  if (error) throw error;
  return (data as RoomRow | null) ?? null;
}

export default function OnlineGame({ onExit }: { onExit: () => void }) {
  const seat = useRef(getSeat()).current;
  const [codeInput, setCodeInput] = useState('');
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [board, setBoard] = useState<Board>(() => initialBoard());
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [legal, setLegal] = useState<LegalMove[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [winner, setWinner] = useState<Color | 'draw' | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [netOk, setNetOk] = useState(true);

  const boardRef = useRef(board);
  boardRef.current = board;
  const appliedRef = useRef(0);
  const busyRef = useRef(false);
  const roomRef = useRef(room);
  roomRef.current = room;
  const myColorRef = useRef(myColor);
  myColorRef.current = myColor;
  const winnerRef = useRef(winner);
  winnerRef.current = winner;
  const particles = useRef<ParticleHandle>(null);

  const turn: Color = appliedRef.current % 2 === 0 ? 'r' : 'b';
  const myTurn = !!myColor && myColor === turn && !winner;

  const pieces = useMemo(() => {
    const list: (ReturnType<typeof cloneBoard>[number][number] & { x: number; y: number; id: string })[] = [];
    for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (p) list.push({ ...p, x, y, id: `${x}-${y}` });
    }
    return list;
  }, [board]);

  // ---------- 判定终局 ----------
  const settle = useCallback((b: Board, count: number, r: RoomRow | null) => {
    const side: Color = count % 2 === 0 ? 'r' : 'b';
    if (!findKing(b, side) || allLegalMoves(b, side).length === 0) {
      const w: Color = side === 'r' ? 'b' : 'r';
      setWinner(w);
      winnerRef.current = w;
      if (r && r.status !== 'finished') {
        void cloud.database.from('rooms')
          .update({ status: 'finished', winner: w })
          .eq('code', r.code)
          .eq('status', 'playing')
          .then(() => undefined, () => undefined);
      }
      if (w === myColorRef.current) { sfx.win(); particles.current?.confetti(); }
      else sfx.lose();
    }
  }, []);

  // ---------- 把远端新棋步应用到本地 ----------
  const applyRemote = useCallback((r: RoomRow) => {
    if (r.moves.length <= appliedRef.current) return;
    const nb = cloneBoard(boardRef.current);
    for (let i = appliedRef.current; i < r.moves.length; i++) {
      const m = r.moves[i];
      if (!m || typeof m.fx !== 'number' || typeof m.ty !== 'number') continue;
      const cap = doMove(nb, m);
      setLastMove(m);
      if (cap) {
        sfx.capture();
        if (navigator.vibrate) navigator.vibrate(30);
      } else sfx.move();
    }
    boardRef.current = nb;
    setBoard(nb);
    appliedRef.current = r.moves.length;
    setSelected(null);
    setLegal([]);
    settle(nb, r.moves.length, r);
  }, [settle]);

  // ---------- 轮询房间 ----------
  useEffect(() => {
    if (!room?.code) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetchRoom(room.code);
        if (!alive || !r) return;
        setNetOk(true);
        roomRef.current = r;
        setRoom(r);
        if (r.winner && r.status === 'finished' && !winnerRef.current) {
          setWinner(r.winner as Color);
          winnerRef.current = r.winner as Color;
        }
        applyRemote(r);
      } catch {
        if (alive) setNetOk(false);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 900);
    return () => { alive = false; window.clearInterval(id); };
  }, [room?.code, applyRemote]);

  // ---------- 创建 / 加入 ----------
  const createRoom = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMsg('正在创建房间…'); sfx.click();
    try {
      let created: RoomRow | null = null;
      for (let i = 0; i < 6; i++) {
        const code = genCode();
        const { data, error } = await cloud.database.from('rooms').insert({
          code,
          status: 'waiting',
          moves: [],
          move_count: 0,
          red_seat: seat,
          black_seat: null,
          winner: null,
        }).select();
        if (!error && data && (data as RoomRow[]).length) { created = (data as RoomRow[])[0]; break; }
        if (error && !/duplicate|23505/i.test(error.message)) throw error;
      }
      if (!created) throw new Error('房间号生成失败，请重试');
      setBoard(initialBoard()); boardRef.current = initialBoard();
      appliedRef.current = 0; setLastMove(null); setWinner(null); winnerRef.current = null;
      setMyColor('r'); myColorRef.current = 'r';
      setRoom(created); roomRef.current = created;
      setMsg('房间创建成功，把房间号告诉朋友吧');
      setNetOk(true);
    } catch (e) { setMsg(msgOf(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const joinRoom = async () => {
    const code = codeInput.trim();
    if (!/^\d{6}$/.test(code)) { setMsg('请输入 6 位房间号'); sfx.illegal(); return; }
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMsg('正在加入房间…'); sfx.click();
    try {
      const r = await fetchRoom(code);
      if (!r) throw new Error('房间不存在，请检查房间号');
      if (r.red_seat === seat) throw new Error('这是你创建的房间，请把房间号发给朋友');
      if (r.black_seat && r.black_seat !== seat) throw new Error('房间已满，请换一个房间号');
      const { data, error } = await cloud.database.from('rooms')
        .update({ black_seat: seat, status: 'playing' })
        .eq('code', code)
        .select();
      if (error) throw error;
      if (!data || !(data as RoomRow[]).length) throw new Error('加入失败，请重试');
      const joined = (data as RoomRow[])[0];
      setBoard(initialBoard()); boardRef.current = initialBoard();
      appliedRef.current = 0; setLastMove(null); setWinner(null); winnerRef.current = null;
      setMyColor('b'); myColorRef.current = 'b';
      setRoom(joined); roomRef.current = joined;
      setMsg('加入成功，你执黑方');
      setNetOk(true);
      applyRemote(joined);
    } catch (e) { setMsg(msgOf(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };

  // ---------- 落子并同步 ----------
  const commitMove = async (m: Move) => {
    if (!room || busyRef.current || winnerRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const latest = await fetchRoom(room.code);
      if (!latest) throw new Error('房间已解散');
      if (latest.status === 'finished') { setWinner(latest.winner as Color); return; }
      if (latest.moves.length > appliedRef.current) applyRemote(latest);
      const count = latest.moves.length;
      const side: Color = count % 2 === 0 ? 'r' : 'b';
      if (side !== myColorRef.current) { setMsg('还没轮到你走棋'); return; }

      const { data, error } = await cloud.database.from('rooms')
        .update({
          moves: [...latest.moves, m],
          move_count: count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('code', room.code)
        .eq('move_count', count)
        .select();
      if (error) throw error;
      if (!data || !(data as RoomRow[]).length) {
        setMsg('棋步冲突，正在同步最新棋局…');
        const r = await fetchRoom(room.code);
        if (r) { setRoom(r); roomRef.current = r; applyRemote(r); }
        return;
      }
      const nb = cloneBoard(boardRef.current);
      const cap = doMove(nb, m);
      boardRef.current = nb;
      setBoard(nb);
      appliedRef.current = count + 1;
      setLastMove(m);
      setSelected(null); setLegal([]);
      if (cap) { sfx.capture(); if (navigator.vibrate) navigator.vibrate(30); }
      else sfx.move();
      setMsg('');
      const updated = (data as RoomRow[])[0];
      roomRef.current = updated;
      setRoom(updated);
      settle(nb, count + 1, updated);
    } catch (e) { setMsg(msgOf(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const tapCell = (x: number, y: number) => {
    if (!myTurn || busyRef.current) return;
    const pc = board[y][x];
    if (selected) {
      if (selected.x === x && selected.y === y) {
        setSelected(null); setLegal([]); sfx.click(); return;
      }
      const dest = legal.find((m) => m.tx === x && m.ty === y);
      if (dest) { void commitMove({ fx: dest.fx, fy: dest.fy, tx: dest.tx, ty: dest.ty }); return; }
      if (pc && pc.c === myColor) {
        setSelected({ x, y }); setLegal(legalMovesFor(board, x, y)); sfx.select(); return;
      }
      setSelected(null); setLegal([]); return;
    }
    if (pc && pc.c === myColor) {
      const ms = legalMovesFor(board, x, y);
      if (!ms.length) { sfx.illegal(); return; }
      setSelected({ x, y }); setLegal(ms); sfx.select();
    }
  };

  const copyCode = async () => {
    if (!room) return;
    try { await navigator.clipboard.writeText(room.code); } catch { /* 忽略 */ }
    setCopied(true); sfx.click();
    window.setTimeout(() => setCopied(false), 1600);
  };

  const leave = () => {
    setRoom(null); roomRef.current = null;
    setMyColor(null); myColorRef.current = null;
    setBoard(initialBoard()); boardRef.current = initialBoard();
    appliedRef.current = 0; setLastMove(null); setWinner(null); winnerRef.current = null;
    setSelected(null); setLegal([]); setMsg(''); setCodeInput('');
    sfx.click(); onExit();
  };

  // ================= 房间大厅 =================
  if (!room) {
    return (
      <div className="bg-palace bg-grain min-h-[100dvh] relative overflow-hidden">
        <ParticleCanvas ref={particles} />
        <div className="relative z-10 mx-auto max-w-md px-5 pt-8 pb-10">
          <div className="flex items-center gap-2">
            <button onClick={leave} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-stone-200 active:scale-90">
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="gold-text text-2xl font-black tracking-widest">联机对战</h1>
              <p className="text-[11px] text-stone-400">建房报号 · 朋友进房 · 实时对弈</p>
            </div>
          </div>

          <div className="card-up mt-5 rounded-2xl border border-amber-300/25 bg-black/35 p-4">
            <div className="flex items-center gap-2 text-amber-200">
              <Users size={16} /> <span className="text-sm font-bold tracking-widest">创建房间</span>
              <span className="ml-auto rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-300">你执红先手</span>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-stone-400">创建后会生成 6 位房间号，把号码告诉朋友，对方在下方输入即可加入。</p>
            <button onClick={createRoom} disabled={busy}
              className="red-seal mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black tracking-widest text-amber-100 active:scale-95 disabled:opacity-50">
              <Zap size={16} /> 创建房间
            </button>
          </div>

          <div className="card-up mt-3 rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="flex items-center gap-2 text-sky-200">
              <Wifi size={16} /> <span className="text-sm font-bold tracking-widest">加入房间</span>
              <span className="ml-auto rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] text-sky-300">你执黑后手</span>
            </div>
            <div className="mt-3 flex gap-2">
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => { if (e.key === 'Enter') void joinRoom(); }}
                inputMode="numeric" placeholder="输入 6 位房间号"
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-3 text-center text-lg font-black tracking-[0.4em] text-amber-100 outline-none focus:border-amber-300/60" />
              <button onClick={joinRoom} disabled={busy}
                className="shrink-0 rounded-xl border border-sky-300/30 bg-sky-400/15 px-4 py-3 text-sm font-bold text-sky-100 active:scale-95 disabled:opacity-50">加入</button>
            </div>
          </div>

          {msg && <div className="pop-in mt-3 rounded-xl border border-amber-200/20 bg-amber-400/10 p-3 text-center text-[12px] text-amber-100">{msg}</div>}

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[12px] leading-6 text-stone-400">
            <div className="mb-1 font-bold text-amber-200">玩法说明</div>
            房主执红先走，朋友执黑。双方棋步自动同步，轮到谁走会明确提示。无需注册登录，房间号就是凭据。<br />
            <div className="mt-1 font-bold text-amber-200">小提示</div>
            把房间号发到微信/QQ，朋友用同一个链接打开 APP 即可加入。
          </div>
        </div>
      </div>
    );
  }

  // ================= 对局 =================
  const mySeatLabel = myColor === 'r' ? '红方 · 你' : '黑方 · 你';
  const oppLabel = myColor === 'r' ? '黑方 · 朋友' : '红方 · 朋友';
  const waitingForFriend = !room.black_seat;

  return (
    <div className="bg-palace bg-grain min-h-[100dvh] relative flex flex-col">
      <ParticleCanvas ref={particles} />

      <header className="relative z-20 mx-auto flex w-full max-w-md items-center gap-2 px-3 pt-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={leave} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-stone-200 active:scale-90">
          <Home size={16} />
        </button>
        <button onClick={copyCode} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 active:scale-[0.98]">
          <span className="text-[10px] tracking-widest text-amber-200/80">房间号</span>
          <span className="text-lg font-black tracking-[0.25em] text-amber-200 tabular-nums">{room.code}</span>
          {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} className="text-amber-300" />}
        </button>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${netOk ? 'border-emerald-300/30 text-emerald-300' : 'border-red-400/40 text-red-300'} bg-white/[0.06]`} title={netOk ? '同步正常' : '连接异常'}>
          <Wifi size={16} />
        </div>
      </header>

      <div className="relative z-20 mx-auto mt-2 flex w-full max-w-md items-center gap-2 px-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${turn === (myColor === 'r' ? 'b' : 'r') && !winner ? 'border-amber-300 shadow-[0_0_16px_rgba(255,200,90,0.5)]' : 'border-white/15'} bg-gradient-to-br from-zinc-700 to-zinc-900 text-stone-200`}>
          <Users size={19} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-stone-100">{oppLabel}</span>
            {waitingForFriend ? (
              <span className="rounded-full bg-amber-400/15 px-2 py-px text-[10px] text-amber-300">等待朋友加入…</span>
            ) : turn !== myColor && !winner ? (
              <span className="rounded-full bg-amber-400/15 px-2 py-px text-[10px] text-amber-300">对方行棋中</span>
            ) : null}
          </div>
          <div className="text-[10px] text-stone-500">第 {Math.floor(appliedRef.current / 2) + 1} 回合 · 棋步自动同步</div>
        </div>
      </div>

      <main className="relative z-20 mx-auto w-full max-w-md flex-1 px-3 py-2">
        <div className="board-wood rounded-[22px] p-2.5 sm:p-3">
          <div className="board-inner relative aspect-[9/10] w-full overflow-hidden rounded-[14px] select-none">
            <svg viewBox="0 0 9 10" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              <rect x="0.5" y="0.5" width="8" height="9" fill="none" stroke="#7a3c0d" strokeWidth="0.07" />
              <rect x="0.56" y="0.56" width="7.88" height="8.88" fill="none" stroke="#7a3c0d" strokeWidth="0.025" opacity="0.7" />
              {Array.from({ length: 10 }, (_, y) => (
                <line key={`h${y}`} x1="0.5" y1={y + 0.5} x2="8.5" y2={y + 0.5} stroke="#7a3c0d" strokeWidth={y === 0 || y === 9 ? 0.06 : 0.032} />
              ))}
              {Array.from({ length: 9 }, (_, x) => (
                <g key={`v${x}`}>
                  {x === 0 || x === 8 ? (
                    <line x1={x + 0.5} y1="0.5" x2={x + 0.5} y2="9.5" stroke="#7a3c0d" strokeWidth="0.045" />
                  ) : (
                    <>
                      <line x1={x + 0.5} y1="0.5" x2={x + 0.5} y2="4.5" stroke="#7a3c0d" strokeWidth="0.032" />
                      <line x1={x + 0.5} y1="5.5" x2={x + 0.5} y2="9.5" stroke="#7a3c0d" strokeWidth="0.032" />
                    </>
                  )}
                </g>
              ))}
              <line x1="3.5" y1="0.5" x2="5.5" y2="2.5" stroke="#7a3c0d" strokeWidth="0.032" />
              <line x1="5.5" y1="0.5" x2="3.5" y2="2.5" stroke="#7a3c0d" strokeWidth="0.032" />
              <line x1="3.5" y1="7.5" x2="5.5" y2="9.5" stroke="#7a3c0d" strokeWidth="0.032" />
              <line x1="5.5" y1="7.5" x2="3.5" y2="9.5" stroke="#7a3c0d" strokeWidth="0.032" />
              <text x="2.3" y="5.28" fontSize="0.42" fill="#7a3c0d" opacity="0.75" fontWeight="700" textAnchor="middle">楚 河</text>
              <text x="6.7" y="5.28" fontSize="0.42" fill="#7a3c0d" opacity="0.75" fontWeight="700" textAnchor="middle">漢 界</text>
            </svg>

            {lastMove && (
              <>
                <div className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${((lastMove.fx + 0.5) / 9) * 100}%`, top: `${((lastMove.fy + 0.5) / 10) * 100}%`, width: '10.6%', aspectRatio: '1', background: 'rgba(255,180,60,0.35)' }} />
                <div className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${((lastMove.tx + 0.5) / 9) * 100}%`, top: `${((lastMove.ty + 0.5) / 10) * 100}%`, width: '10.6%', aspectRatio: '1', background: 'rgba(255,120,40,0.45)', boxShadow: '0 0 14px rgba(255,140,40,0.7)' }} />
              </>
            )}

            {legal.map((m, i) => {
              const isCap = !!board[m.ty][m.tx];
              return (
                <button key={i} onClick={() => void commitMove({ fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty })}
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${((m.tx + 0.5) / 9) * 100}%`, top: `${((m.ty + 0.5) / 10) * 100}%`, width: '10%', aspectRatio: '1' }}>
                  {isCap ? (
                    <span className="dot-pulse block h-full w-full rounded-full border-[3px] border-red-500/90 bg-red-500/15 shadow-[0_0_12px_rgba(255,50,50,0.6)]" />
                  ) : (
                    <span className="dot-pulse mx-auto block h-[38%] w-[38%] rounded-full bg-emerald-600/85 shadow-[0_0_10px_rgba(20,180,100,0.8)] ring-2 ring-white/70" />
                  )}
                </button>
              );
            })}

            {pieces.map((p) => {
              const isSel = selected?.x === p.x && selected?.y === p.y;
              const isRed = p.c === 'r';
              const inChk = p.t === 'k' && isInCheck(board, p.c);
              return (
                <div key={p.id} className={`piece-layer absolute z-10 ${isSel ? 'z-30' : ''}`}
                  style={{ left: `${((p.x + 0.5) / 9) * 100}%`, top: `${((p.y + 0.5) / 10) * 100}%`, width: '10.6%', aspectRatio: '1', transform: 'translate(-50%,-50%)' }}>
                  <button onClick={() => tapCell(p.x, p.y)}
                    className={`piece-body relative flex h-full w-full items-center justify-center rounded-full ${isSel ? 'glow-selected' : ''} ${inChk ? 'check-flash' : ''}`}
                    style={{
                      background: isRed
                        ? 'radial-gradient(circle at 32% 28%, #fff8e6 0%, #ffe9b8 22%, #f7c873 48%, #d98f2e 78%, #9c5a12 100%)'
                        : 'radial-gradient(circle at 32% 28%, #f2f2f2 0%, #d9d9d9 22%, #a8a8a8 48%, #5a5a5a 78%, #222222 100%)',
                      border: `2px solid ${isRed ? '#8f1d1d' : '#1c1c1e'}`,
                      boxShadow: isSel ? undefined : '0 4px 8px rgba(60,20,0,0.45), inset 0 2px 3px rgba(255,255,255,0.7), inset 0 -3px 6px rgba(90,40,0,0.35)',
                    }}>
                    <span className="absolute inset-[7%] rounded-full border opacity-60" style={{ borderColor: isRed ? '#8f1d1d' : '#333' }} />
                    <span className={`font-black leading-none ${isRed ? 'text-[#a31212]' : 'text-[#171717]'}`}
                      style={{ fontSize: 'clamp(15px, 5.4vw, 24px)' }}>{charOf(p)}</span>
                    {isSel && <span className="absolute -inset-1 rounded-full border-2 border-amber-300/70" />}
                  </button>
                </div>
              );
            })}

            <div className="absolute inset-0 z-[5] grid" style={{ gridTemplateColumns: 'repeat(9,1fr)', gridTemplateRows: 'repeat(10,1fr)' }}>
              {Array.from({ length: 90 }, (_, i) => {
                const x = i % 9, y = (i / 9) | 0;
                return <button key={i} aria-label={`cell-${x}-${y}`} onClick={() => tapCell(x, y)} className="relative" style={{ touchAction: 'manipulation' }} />;
              })}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-gradient-to-r from-red-950/50 to-black/40 px-3 py-2">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg font-black text-amber-100 ${myColor === 'r' ? 'border-red-400 bg-gradient-to-br from-red-600 to-red-900' : 'border-zinc-500 bg-gradient-to-br from-zinc-700 to-zinc-900'}`}>
            {myColor === 'r' ? '帅' : '將'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-stone-100">{mySeatLabel}</span>
              {myTurn && <span className="rounded-full bg-emerald-400/15 px-2 py-px text-[10px] text-emerald-300">轮到你走</span>}
              {isInCheck(board, myColor || 'r') && myColor && <span className="check-flash rounded-full bg-red-600 px-2 py-px text-[10px] font-bold text-white">被将军!</span>}
            </div>
            <div className="text-[10px] text-stone-500">{msg || '点选棋子走子 · 棋步自动同步'}</div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={copyCode} className="flex items-center justify-center gap-1.5 rounded-2xl border border-amber-300/25 bg-amber-400/10 py-2.5 text-[12px] text-amber-200 active:scale-95">
            <Copy size={15} /> {copied ? '已复制房间号' : '复制房间号'}
          </button>
          <button onClick={leave} className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] py-2.5 text-[12px] text-stone-200 active:scale-95">
            <RotateCcw size={15} /> 退出房间
          </button>
        </div>
      </main>

      {winner && (
        <div className="overlay-in fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-6">
          <div className="card-up w-full max-w-xs rounded-3xl border border-amber-200/25 bg-gradient-to-b from-[#251712] to-[#100b09] p-6 text-center shadow-2xl">
            <div className="text-4xl">{winner === myColor ? '🏆' : '🌧️'}</div>
            <h2 className={`mt-1 text-2xl font-black tracking-widest ${winner === myColor ? 'gold-text' : 'text-stone-200'}`}>
              {winner === myColor ? '大 获 全 胜' : '惜 败 一 着'}
            </h2>
            <p className="mt-2 text-[12px] text-stone-400">共 {Math.ceil(appliedRef.current / 2)} 回合 · 房间号 {room.code}</p>
            <button onClick={leave} className="red-seal mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-amber-100 active:scale-95">
              <Home size={16} /> 返回主页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
