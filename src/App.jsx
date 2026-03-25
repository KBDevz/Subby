import { useState, useEffect, useRef, useCallback } from "react";

// ─── Supabase ─────────────────────────────────────────────────
const SUPABASE_URL = "https://csiqrmzcnqtlxpuayqcq.supabase.co";
const SUPABASE_KEY = "sb_publishable_wyn6cp6XqwuFDSQbrJBZuQ_EQ3s12F0";

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = SUPABASE_URL || lsGet("scm_sb_url","");
  const key = SUPABASE_KEY || lsGet("scm_sb_key","");
  if (!url || !key) return null;
  try {
    const lib = window.supabase;
    if (!lib) return null;
    const create = lib.createClient || (lib.default && lib.default.createClient);
    if (!create) return null;
    _supabase = create(url, key);
  } catch(e) { console.warn("Supabase init failed:", e); return null; }
  return _supabase;
}
function resetSupabaseClient() { _supabase = null; }

// ─── Constants ───────────────────────────────────────────────
const HALF_SECS  = 25 * 60;
const ROLE_COLOR = { GK:"#f59e0b", DEF:"#60a5fa", MID:"#34d399", FWD:"#f87171" };

const fmt    = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
const fmtMin = s => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${String(s%60).padStart(2,"0")}s`;
const lsGet  = (k,d) => { try { const v=localStorage.getItem(k); return v!=null?JSON.parse(v):d; } catch { return d; } };
const lsSet  = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

// ─── Formation catalog ───────────────────────────────────────
const FORMATION_CATALOG = {
  4:  [{ f:"1-2-1",name:"Diamond",desc:"Classic 5v5 shape"},{f:"2-2",name:"Box",desc:"Balanced 2+2"},{f:"2-1-1",name:"Attacking",desc:"Push forward"},{f:"1-1-2",name:"Defensive",desc:"Sit deep, hit fast"}],
  5:  [{f:"2-2-1",name:"Balanced",desc:"Popular 6v6 shape"},{f:"1-3-1",name:"Mid-heavy",desc:"Dominate the middle"},{f:"3-2",name:"Defensive",desc:"Solid back 3"},{f:"2-1-2",name:"Attacking",desc:"Two up top"}],
  6:  [{f:"2-3-1",name:"Classic",desc:"Most common 7v7"},{f:"3-2-1",name:"Defensive",desc:"Strong defensive base"},{f:"2-2-2",name:"Balanced",desc:"Equal width & attack"},{f:"3-1-2",name:"Attacking",desc:"Three fwd thrust"},{f:"1-3-2",name:"Mid-heavy",desc:"Control the centre"}],
  7:  [{f:"3-3-1",name:"Balanced",desc:"Standard 8v8"},{f:"2-3-2",name:"Wide",desc:"Width in midfield"},{f:"3-2-2",name:"Attacking",desc:"Two strikers"},{f:"4-2-1",name:"Defensive",desc:"Deep defensive block"}],
  8:  [{f:"3-3-2",name:"Classic",desc:"Solid 9-a-side"},{f:"4-3-1",name:"Defensive",desc:"Packed defence"},{f:"3-4-1",name:"Mid-heavy",desc:"Midfield dominance"},{f:"4-2-2",name:"Attacking",desc:"Two wide forwards"}],
  9:  [{f:"4-3-2",name:"Xmas Tree",desc:"Narrow & clinical"},{f:"3-4-2",name:"Balanced",desc:"Strong mid block"},{f:"4-4-1",name:"Defensive",desc:"Compact & organised"},{f:"3-3-3",name:"Attacking",desc:"Fluid front three"}],
  10: [{f:"4-4-2",name:"Classic",desc:"The traditional 11v11"},{f:"4-3-3",name:"Total Football",desc:"High-press wide attack"},{f:"4-2-3-1",name:"Modern",desc:"Double pivot + #10"},{f:"3-5-2",name:"Wing-backs",desc:"Wing-backs provide width"},{f:"5-3-2",name:"Defensive",desc:"Back 5 + counter"}],
};

function buildPositions(f) {
  const lines=f.split("-").map(Number), n=lines.length;
  const pos=[{role:"GK",x:50,y:111}];
  lines.forEach((count,li)=>{
    const t=n===1?0.5:li/(n-1);
    const y=72-t*(72-12);
    const role=li===lines.length-1?"FWD":li===0?"DEF":"MID";
    for(let i=0;i<count;i++){
      const x=count===1?50:8+(84/(count-1))*i;
      pos.push({role,x,y});
    }
  });
  return pos;
}

async function acquireWakeLock() {
  try { if("wakeLock" in navigator) return await navigator.wakeLock.request("screen"); } catch(e) {}
  return null;
}

async function fireAlert() {
  // Audio — resume() is required on mobile; context starts suspended
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    [[660,0,.18],[880,.25,.18],[1100,.5,.3]].forEach(([f,t,d])=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value=f;
      g.gain.setValueAtTime(0.4, ctx.currentTime+t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+t+d);
      o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+d+0.05);
    });
  } catch(e) { console.warn("Audio failed:", e); }
  // Vibration — pattern: buzz-pause-buzz-pause-buzz
  try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 600]); } catch(e) {}
}

// ─── HalfField ───────────────────────────────────────────────
function HalfField({ positions, assigned, roster, numbers, onTapPos, alertActive, getTotal, getStint, phase }) {
  const L="rgba(255,255,255,0.55)", LW=0.55;
  return (
    <div style={{position:"relative",width:"100%",paddingBottom:"120%",borderRadius:16,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}>
      <div style={{position:"absolute",inset:0,background:"#1e5c20"}}>
        {[...Array(8)].map((_,i)=><div key={i} style={{position:"absolute",top:`${i*12.5}%`,height:"6.25%",left:0,right:0,background:"rgba(255,255,255,0.03)"}}/>)}
      </div>
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}} viewBox="0 0 100 120" preserveAspectRatio="xMidYMid meet">
        <rect x="3" y="2" width="94" height="108" rx="1" fill="none" stroke={L} strokeWidth={LW}/>
        <line x1="3" y1="2" x2="97" y2="2" stroke={L} strokeWidth={LW}/>
        <circle cx="50" cy="2" r="1.2" fill={L}/>
        <rect x="18" y="80" width="64" height="30" fill="none" stroke={L} strokeWidth={LW}/>
        <rect x="33" y="97" width="34" height="13" fill="none" stroke={L} strokeWidth={LW}/>
        <rect x="39.5" y="107" width="21" height="8" fill="rgba(255,255,255,0.15)" stroke={L} strokeWidth={LW}/>
        <line x1="44" y1="107" x2="44" y2="115" stroke={L} strokeWidth="0.3" strokeDasharray="1,1.5"/>
        <line x1="50" y1="107" x2="50" y2="115" stroke={L} strokeWidth="0.3" strokeDasharray="1,1.5"/>
        <line x1="56" y1="107" x2="56" y2="115" stroke={L} strokeWidth="0.3" strokeDasharray="1,1.5"/>
        <line x1="39.5" y1="110" x2="60.5" y2="110" stroke={L} strokeWidth="0.3" strokeDasharray="1,1.5"/>
        <line x1="39.5" y1="113" x2="60.5" y2="113" stroke={L} strokeWidth="0.3" strokeDasharray="1,1.5"/>
        <circle cx="50" cy="92" r="0.9" fill={L}/>
        <path d="M 38 80 A 12 12 0 0 1 62 80" fill="none" stroke={L} strokeWidth={LW}/>
        <path d="M 3 8 A 4 4 0 0 0 7 2" fill="none" stroke={L} strokeWidth={LW}/>
        <path d="M 93 8 A 4 4 0 0 1 97 2" fill="none" stroke={L} strokeWidth={LW}/>
      </svg>
      {positions.map((pos,pi)=>{
        const pid=assigned[pi], player=pid!=null?roster.find(p=>p.id===pid):null;
        const col=ROLE_COLOR[pos.role], empty=pid==null;
        const flash=alertActive&&!empty&&pos.role!=="GK";
        const mins=pid!=null?getTotal(pid):0;
        const stint=pid!=null?getStint(pid):0;
        const num=player?numbers[player.id]:"";
        const topPct=(pos.y/120)*100;
        return (
          <div key={pi} onClick={()=>onTapPos(pi)}
            style={{position:"absolute",left:`${pos.x}%`,top:`${topPct}%`,transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",zIndex:10,userSelect:"none"}}>
            <div style={{
              width:48,height:48,borderRadius:"50%",
              background:empty?"rgba(255,255,255,0.12)":col,
              border:empty?"2.5px dashed rgba(255,255,255,0.45)":`3px solid ${flash?"#fff":"rgba(255,255,255,0.85)"}`,
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              boxShadow:flash?`0 0 20px ${col},0 4px 12px rgba(0,0,0,0.5)`:empty?"none":"0 4px 12px rgba(0,0,0,0.5)",
              animation:flash?"bloop 1.1s ease-in-out infinite":"none",transition:"background .2s,box-shadow .2s",
            }}>
              {empty
                ? <span style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontWeight:700}}>{pos.role}</span>
                : <>
                    <span style={{fontSize:8,color:"rgba(255,255,255,0.9)",fontWeight:800,lineHeight:1}}>{pos.role}</span>
                    {num
                      ? <span style={{fontSize:12,color:"white",fontWeight:800,lineHeight:1}}>#{num}</span>
                      : phase==="game"&&<span style={{fontSize:8,color:"rgba(255,255,255,0.75)",lineHeight:1}}>{Math.floor(mins/60)}m</span>
                    }
                    {phase==="game"&&stint>0&&<span style={{fontSize:7,color:"rgba(255,255,255,0.55)",lineHeight:1}}>{fmt(stint)}</span>}
                  </>
              }
            </div>
            <div style={{marginTop:3,background:empty?"rgba(0,0,0,0.45)":"rgba(0,0,0,0.78)",color:empty?"rgba(255,255,255,0.45)":"white",fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:5,whiteSpace:"nowrap",maxWidth:58,overflow:"hidden",textOverflow:"ellipsis"}}>
              {player?player.name.split(" ")[0]:"—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PickerSheet ─────────────────────────────────────────────
function PickerSheet({ posIdx, positions, assigned, roster, numbers, notes, getTotal, getStint, onAssign, onClear, onClose, phase }) {
  if (posIdx===null) return null;
  const pos=positions[posIdx], curId=assigned[posIdx];
  const curP=curId!=null?roster.find(p=>p.id===curId):null;
  const usedSet=new Set(assigned.filter((_,i)=>i!==posIdx&&_!=null));
  const avail=roster.filter(p=>!usedSet.has(p.id));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#161b22",borderRadius:"22px 22px 0 0",padding:"20px 20px 44px",width:"100%",maxWidth:480,border:"1px solid #30363d",animation:"sheetUp .22s ease"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"#30363d",borderRadius:2,margin:"0 auto 18px"}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:ROLE_COLOR[pos.role],display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"white"}}>{pos.role}</div>
            <div>
              <div style={{fontSize:16,fontWeight:800,lineHeight:1}}>{curP?curP.name:<span style={{color:"#8b949e"}}>Empty</span>}</div>
              {curP&&phase==="game"&&<div style={{fontSize:11,color:"#8b949e"}}>{fmtMin(getTotal(curP.id))} total · on {fmtMin(getStint(curP.id))}</div>}
            </div>
          </div>
          {curP&&<button onClick={()=>onClear(posIdx)} style={{background:"#21262d",border:"1px solid #30363d",color:"#ef4444",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Remove</button>}
        </div>
        <div style={{fontSize:10,color:"#8b949e",textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:10}}>{phase==="game"?"Substitute In":"Assign Player"}</div>
        <div style={{display:"grid",gap:8,maxHeight:300,overflowY:"auto"}}>
          {avail.map(p=>(
            <button key={p.id} onClick={()=>onAssign(posIdx,p.id)}
              style={{background:p.id===curId?"#1f3a2a":"#21262d",border:`1px solid ${p.id===curId?"#4ade80":"#30363d"}`,borderRadius:12,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",color:"white",cursor:"pointer",textAlign:"left"}}>
              <div>
                <span style={{fontWeight:700,fontSize:14}}>{p.name}</span>
                {numbers[p.id]&&<span style={{fontSize:11,color:"#8b949e",marginLeft:6}}>#{numbers[p.id]}</span>}
                {notes[p.id]&&<div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{notes[p.id]}</div>}
              </div>
              {phase==="game"&&(
                <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                  <div style={{fontSize:12,color:"#8b949e"}}>{fmtMin(getTotal(p.id))}</div>
                  {getStint(p.id)>0&&<div style={{fontSize:10,color:"#f59e0b"}}>on {fmtMin(getStint(p.id))}</div>}
                </div>
              )}
            </button>
          ))}
          {avail.length===0&&<div style={{color:"#8b949e",textAlign:"center",padding:20,fontSize:13}}>All players assigned</div>}
        </div>
        <button onClick={onClose} style={{marginTop:14,width:"100%",padding:13,background:"#21262d",border:"1px solid #30363d",borderRadius:12,color:"#8b949e",fontSize:14,cursor:"pointer",fontWeight:600}}>Cancel</button>
      </div>
    </div>
  );
}

// ─── MiniFieldDot ────────────────────────────────────────────
function MiniFieldDot({ pos }) {
  return <div style={{position:"absolute",left:`${pos.x}%`,top:`${(pos.y/120)*100}%`,transform:"translate(-50%,-50%)",width:7,height:7,borderRadius:"50%",background:ROLE_COLOR[pos.role],border:"1px solid rgba(255,255,255,0.6)"}}/>;
}

// ─── FormationPicker ─────────────────────────────────────────
function FormationPicker({ catalog, formation, outfieldCount, onSelect, onDelete, onAdd, compact }) {
  const builtinFs=(FORMATION_CATALOG[Math.min(10,Math.max(4,outfieldCount))]||FORMATION_CATALOG[6]).map(e=>e.f);
  if (compact) return (
    <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
      {catalog.map(entry=>{
        const isCustom=!builtinFs.includes(entry.f), active=formation===entry.f;
        return (
          <div key={entry.f} style={{display:"flex",alignItems:"center",background:active?"#4ade80":"#21262d",border:`1px solid ${active?"#4ade80":isCustom?"#7c3aed":"#30363d"}`,borderRadius:8,overflow:"hidden"}}>
            <button onClick={()=>onSelect(entry.f)} style={{background:"transparent",border:"none",color:active?"#0d1117":isCustom?"#a78bfa":"#8b949e",padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{entry.f}</button>
            {isCustom&&<button onClick={()=>onDelete(entry.f)} style={{background:"transparent",border:"none",borderLeft:`1px solid ${active?"rgba(0,0,0,0.2)":"#30363d"}`,color:active?"#0d1117":"#6b7280",padding:"6px 7px",fontSize:11,cursor:"pointer",lineHeight:1}}>×</button>}
          </div>
        );
      })}
      <button onClick={onAdd} style={{background:"#21262d",border:"1.5px dashed #7c3aed",color:"#a78bfa",borderRadius:8,padding:"6px 12px",fontSize:14,fontWeight:700,cursor:"pointer",lineHeight:1}}>+</button>
    </div>
  );
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
      {catalog.map(entry=>{
        const isCustom=!builtinFs.includes(entry.f), active=formation===entry.f;
        const preview=buildPositions(entry.f);
        return (
          <div key={entry.f} onClick={()=>onSelect(entry.f)}
            style={{background:active?"#1a2e1a":"#161b22",border:`2px solid ${active?"#4ade80":isCustom?"#7c3aed44":"#21262d"}`,borderRadius:12,padding:"10px 10px 8px",cursor:"pointer",transition:"border-color .15s,background .15s"}}>
            <div style={{position:"relative",width:"100%",paddingBottom:"52%",borderRadius:8,overflow:"hidden",marginBottom:8}}>
              <div style={{position:"absolute",inset:0,background:"#1e5c20"}}/>
              <svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}} viewBox="0 0 100 52" preserveAspectRatio="xMidYMid meet">
                <rect x="2" y="1" width="96" height="46" rx="1" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8"/>
                <line x1="2" y1="1" x2="98" y2="1" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8"/>
                <rect x="22" y="33" width="56" height="14" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.7"/>
                <rect x="37" y="41" width="26" height="6" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.7"/>
                <rect x="42" y="45" width="16" height="5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7"/>
              </svg>
              {preview.map((pos,pi)=><MiniFieldDot key={pi} pos={pos}/>)}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:active?"#4ade80":"#e6edf3"}}>{entry.f}</div>
                <div style={{fontSize:10,color:active?"#4ade8099":"#6b7280",fontWeight:600}}>{entry.name}</div>
              </div>
              {active&&<div style={{fontSize:16}}>✓</div>}
              {isCustom&&!active&&<button onClick={e=>{e.stopPropagation();onDelete(entry.f);}} style={{background:"#21262d",border:"1px solid #30363d",color:"#6b7280",borderRadius:6,width:22,height:22,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>×</button>}
            </div>
          </div>
        );
      })}
      <div onClick={onAdd} style={{background:"#0d1117",border:"2px dashed #7c3aed55",borderRadius:12,padding:"10px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,minHeight:90}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:"#7c3aed22",border:"1.5px dashed #7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#a78bfa"}}>+</div>
        <div style={{fontSize:11,color:"#7c3aed",fontWeight:700,textAlign:"center",lineHeight:1.4}}>Custom<br/>Formation</div>
      </div>
    </div>
  );
}

// ─── FormationBuilder ────────────────────────────────────────
function FormationBuilder({ outfieldCount, onSave, onClose }) {
  const [lines,setLines]=useState(()=>{
    const n=outfieldCount;
    if(n<=3)return[n];
    if(n<=5)return[Math.floor(n/2),Math.ceil(n/2)];
    return[Math.floor(n/3),Math.floor(n/3),n-2*Math.floor(n/3)];
  });
  const total=lines.reduce((a,b)=>a+b,0), valid=total===outfieldCount, formStr=lines.join("-");
  const roleFor=i=>i===lines.length-1?"FWD":i===0?"DEF":"MID";
  const preview=buildPositions(formStr);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#161b22",borderRadius:"22px 22px 0 0",padding:"20px 20px 44px",width:"100%",maxWidth:480,border:"1px solid #30363d",animation:"sheetUp .22s ease",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"#30363d",borderRadius:2,margin:"0 auto 20px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div><div style={{fontSize:18,fontWeight:800}}>Custom Formation</div><div style={{fontSize:11,color:"#8b949e"}}>{outfieldCount} outfield + 1 GK</div></div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:28,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,color:valid?"#4ade80":"#f87171",lineHeight:1}}>{formStr}</div>
            <div style={{fontSize:10,color:valid?"#4ade80":"#f87171",fontWeight:700}}>{total}/{outfieldCount}</div>
          </div>
        </div>
        <div style={{position:"relative",width:"100%",paddingBottom:"55%",borderRadius:12,overflow:"hidden",border:"1px solid #30363d",marginBottom:20}}>
          <div style={{position:"absolute",inset:0,background:"#1e5c20"}}/>
          <svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}} viewBox="0 0 100 55" preserveAspectRatio="xMidYMid meet">
            <rect x="2" y="1" width="96" height="53" rx="1" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5"/>
          </svg>
          {preview.map((pos,pi)=><MiniFieldDot key={pi} pos={pos}/>)}
        </div>
        <div style={{display:"grid",gap:10,marginBottom:16}}>
          {lines.map((count,i)=>{
            const role=roleFor(i);
            return (
              <div key={i} style={{background:"#0d1117",borderRadius:12,padding:"12px 14px",border:"1px solid #21262d",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:34,height:34,borderRadius:"50%",background:ROLE_COLOR[role],display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"white",flexShrink:0}}>{role}</div>
                <div style={{flex:1,fontSize:12,color:"#8b949e",fontWeight:600}}>
                  {i===0?"Defensive":i===lines.length-1?"Forward":"Midfield"} row
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>setLines(prev=>{const n=[...prev];n[i]=Math.max(1,n[i]-1);return n;})} style={{width:32,height:32,borderRadius:8,background:"#21262d",border:"1px solid #30363d",color:"#e6edf3",fontSize:18,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                  <span style={{fontSize:20,fontWeight:800,fontFamily:"'Bebas Neue',sans-serif",minWidth:20,textAlign:"center",color:ROLE_COLOR[role]}}>{count}</span>
                  <button onClick={()=>setLines(prev=>{const n=[...prev];n[i]=n[i]+1;return n;})} style={{width:32,height:32,borderRadius:8,background:"#21262d",border:"1px solid #30363d",color:"#e6edf3",fontSize:18,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={()=>{if(lines.length<5)setLines(prev=>[...prev,1]);}} disabled={lines.length>=5} style={{flex:1,padding:"9px 0",background:lines.length>=5?"#161b22":"#21262d",border:"1px solid #30363d",color:lines.length>=5?"#4b5563":"#a78bfa",borderRadius:9,fontSize:13,fontWeight:700,cursor:lines.length>=5?"not-allowed":"pointer"}}>+ Add Line</button>
          <button onClick={()=>{if(lines.length>1)setLines(prev=>prev.slice(0,-1));}} disabled={lines.length<=1} style={{flex:1,padding:"9px 0",background:lines.length<=1?"#161b22":"#21262d",border:"1px solid #30363d",color:lines.length<=1?"#4b5563":"#ef4444",borderRadius:9,fontSize:13,fontWeight:700,cursor:lines.length<=1?"not-allowed":"pointer"}}>− Remove Line</button>
        </div>
        {!valid&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:9,padding:"9px 14px",fontSize:12,color:"#f87171",marginBottom:12,textAlign:"center"}}>Need {outfieldCount} players — currently {total}</div>}
        <button onClick={()=>valid&&onSave(formStr)} disabled={!valid} style={{width:"100%",padding:14,background:valid?"#7c3aed":"#21262d",border:"none",borderRadius:12,color:valid?"white":"#4b5563",fontSize:15,fontWeight:700,cursor:valid?"pointer":"not-allowed"}}>Save · {formStr}</button>
        <button onClick={onClose} style={{marginTop:10,width:"100%",padding:12,background:"transparent",border:"1px solid #30363d",borderRadius:12,color:"#8b949e",fontSize:14,cursor:"pointer",fontWeight:600}}>Cancel</button>
      </div>
    </div>
  );
}

// ─── SubQueuePanel ───────────────────────────────────────────
function SubQueuePanel({ queue, roster, numbers, positions, assigned, bench, onAdd, onRemove, onExecute }) {
  const [adding,setAdding]=useState(false);
  const [step,setStep]=useState(0);
  const [selectedIn,setSelectedIn]=useState(null);

  const cancel=()=>{setAdding(false);setStep(0);setSelectedIn(null);};

  if (adding) return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:700,color:"#e6edf3"}}>{step===0?"1. Who's coming on?":"2. Who are they replacing?"}</div>
        <button onClick={cancel} style={{background:"#21262d",border:"1px solid #30363d",color:"#8b949e",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer"}}>Cancel</button>
      </div>
      {step===0?(
        <div style={{display:"grid",gap:8}}>
          {bench.filter(p=>!queue.some(q=>q.inId===p.id)).map(p=>(
            <button key={p.id} onClick={()=>{setSelectedIn(p.id);setStep(1);}}
              style={{background:"#21262d",border:"1px solid #30363d",borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",color:"white",cursor:"pointer"}}>
              <span style={{fontWeight:700}}>{p.name}{numbers[p.id]?` #${numbers[p.id]}`:""}</span>
              <span style={{color:"#4ade80",fontSize:12}}>Select →</span>
            </button>
          ))}
          {bench.filter(p=>!queue.some(q=>q.inId===p.id)).length===0&&(
            <div style={{color:"#8b949e",textAlign:"center",padding:20,fontSize:13}}>No bench players available</div>
          )}
        </div>
      ):(
        <div style={{display:"grid",gap:8}}>
          {positions.map((pos,pi)=>{
            if(pos.role==="GK")return null;
            const outId=assigned[pi], outP=outId!=null?roster.find(p=>p.id===outId):null, inP=roster.find(p=>p.id===selectedIn);
            if(!outP)return null;
            return (
              <button key={pi} onClick={()=>{onAdd({posIdx:pi,outId,inId:selectedIn});cancel();}}
                style={{background:"#21262d",border:"1px solid #30363d",borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",color:"white",cursor:"pointer"}}>
                <div><div style={{fontWeight:700}}>{outP.name}</div><div style={{fontSize:11,color:"#8b949e"}}>{pos.role}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:11,color:"#a78bfa"}}>{inP?.name} in</div><div style={{fontSize:10,color:"#4ade80"}}>Queue →</div></div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:10,color:"#8b949e",textTransform:"uppercase",letterSpacing:1.5,fontWeight:700}}>Planned Subs ({queue.length}/3)</div>
        {queue.length<3&&bench.length>0&&(
          <button onClick={()=>setAdding(true)} style={{background:"#7c3aed22",border:"1px solid #7c3aed",color:"#a78bfa",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Plan Sub</button>
        )}
      </div>
      {queue.length===0?(
        <div style={{background:"#161b22",borderRadius:12,padding:"28px 20px",textAlign:"center",border:"1px dashed #30363d"}}>
          <div style={{fontSize:28,marginBottom:8}}>📋</div>
          <div style={{fontSize:13,color:"#8b949e"}}>No subs queued yet</div>
          <div style={{fontSize:11,color:"#4b5563",marginTop:4}}>Plan up to 3 substitutions in advance</div>
        </div>
      ):(
        <div style={{display:"grid",gap:8}}>
          {queue.map((q,i)=>{
            const inP=roster.find(p=>p.id===q.inId), outP=q.outId!=null?roster.find(p=>p.id===q.outId):null, pos=positions[q.posIdx];
            return (
              <div key={i} style={{background:"#161b22",borderRadius:12,padding:"12px 14px",border:`1px solid ${i===0?"#7c3aed":"#21262d"}`,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:i===0?"#7c3aed":"#30363d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"white",flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,fontSize:13}}>
                  <span style={{color:"#ef4444",fontWeight:700}}>{outP?.name||"?"}</span>
                  <span style={{color:"#4b5563",margin:"0 6px"}}>→</span>
                  <span style={{color:"#4ade80",fontWeight:700}}>{inP?.name||"?"}</span>
                  <div style={{fontSize:10,color:"#6b7280"}}>{pos?.role} position</div>
                </div>
                {i===0&&<button onClick={()=>onExecute(q)} style={{background:"#4ade80",border:"none",color:"#0d1117",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>Execute</button>}
                <button onClick={()=>onRemove(i)} style={{background:"transparent",border:"none",color:"#4b5563",fontSize:18,cursor:"pointer",flexShrink:0,padding:"0 2px",lineHeight:1}}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── SeasonView ──────────────────────────────────────────────
function SeasonView({ onClose }) {
  const season=lsGet("scm_season",[]);
  const [sel,setSel]=useState(null);

  const shareGame=(game)=>{
    const sorted=[...game.playerStats].sort((a,b)=>b.total-a.total);
    const text=[`${game.teamName} · ${new Date(game.date).toLocaleDateString()}`,`Formation: ${game.formation}`,"",
      ...sorted.map(p=>`${p.name}${p.number?` #${p.number}`:""}: ${fmtMin(p.total)}`)
    ].join("\n");
    if(navigator.share)navigator.share({title:"Game Report",text}).catch(()=>{});
    else navigator.clipboard?.writeText(text).then(()=>alert("Copied!")).catch(()=>alert(text));
  };

  if (sel!==null) {
    const game=season[sel], sorted=[...game.playerStats].sort((a,b)=>b.total-a.total), max=sorted[0]?.total||1;
    return (
      <div style={{padding:"16px 16px 48px",animation:"pageIn .25s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <button onClick={()=>setSel(null)} style={{background:"transparent",border:"none",color:"#8b949e",fontSize:12,cursor:"pointer",padding:0,marginBottom:4}}>← All Games</button>
            <div style={{fontSize:16,fontWeight:700}}>{new Date(game.date).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
            <div style={{fontSize:11,color:"#8b949e"}}>{game.formation} · {game.teamName}</div>
          </div>
          <button onClick={()=>shareGame(game)} style={{background:"#21262d",border:"1px solid #30363d",color:"#8b949e",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>📤 Share</button>
        </div>
        {sorted.map(p=>{
          const pct=Math.min(100,(p.total/max)*100);
          return (
            <div key={p.id} style={{background:"#161b22",borderRadius:12,padding:"12px 14px",border:"1px solid #21262d",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontWeight:700}}>{p.name}{p.number&&<span style={{color:"#8b949e",fontSize:11}}> #{p.number}</span>}</span>
                <span style={{fontFamily:"monospace",color:"#4ade80"}}>{fmtMin(p.total)}</span>
              </div>
              <div style={{background:"#0d1117",borderRadius:4,height:4,overflow:"hidden",marginBottom:6}}>
                <div style={{background:"#374151",height:"100%",width:`${pct}%`,borderRadius:4}}/>
              </div>
              {p.positions&&Object.entries(p.positions).filter(([_,v])=>v>0).length>0&&(
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {Object.entries(p.positions).filter(([_,v])=>v>0).map(([role,sec])=>(
                    <span key={role} style={{background:`${ROLE_COLOR[role]}18`,border:`1px solid ${ROLE_COLOR[role]}44`,borderRadius:5,padding:"1px 7px",fontSize:10,color:ROLE_COLOR[role],fontWeight:700}}>
                      {role} {Math.floor(sec/60)}m
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{padding:"16px 16px 48px",animation:"pageIn .25s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div style={{fontSize:18,fontWeight:700}}>Season</div>
        <button onClick={onClose} style={{background:"#21262d",border:"1px solid #30363d",color:"#8b949e",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>← Back</button>
      </div>
      {season.length===0?(
        <div style={{textAlign:"center",padding:"60px 0",color:"#8b949e"}}>
          <div style={{fontSize:40,marginBottom:12}}>📊</div>
          <div style={{fontSize:15,fontWeight:600}}>No games recorded yet</div>
          <div style={{fontSize:12,color:"#4b5563",marginTop:4}}>Stats auto-save at full time</div>
        </div>
      ):(
        <div style={{display:"grid",gap:10}}>
          {season.map((game,i)=>{
            const top=[...game.playerStats].sort((a,b)=>b.total-a.total)[0];
            return (
              <div key={i} onClick={()=>setSel(i)}
                style={{background:"#161b22",borderRadius:12,padding:"14px 16px",border:"1px solid #21262d",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:14,fontWeight:700}}>{new Date(game.date).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
                  <div style={{fontSize:11,color:"#8b949e",marginTop:2}}>{game.formation} · {game.playerStats.length} players</div>
                  {top&&<div style={{fontSize:10,color:"#4b5563",marginTop:2}}>Most time: {top.name} ({fmtMin(top.total)})</div>}
                </div>
                <div style={{color:"#8b949e",fontSize:18}}>›</div>
              </div>
            );
          })}
          {season.length>0&&(
            <button onClick={()=>{if(confirm("Clear all season data?"))lsSet("scm_season",[]);window.location.reload();}}
              style={{marginTop:8,width:"100%",padding:11,background:"transparent",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,color:"#ef4444",fontSize:12,cursor:"pointer",fontWeight:600}}>
              Clear Season Data
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────
function LandingPage({ onLogin, onSignup, sbReady }) {
  const [view, setView]       = useState("home");
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [name, setName]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  // Detect invite code in URL
  const inviteCode = new URLSearchParams(window.location.search).get("invite");
  useEffect(()=>{
    if(inviteCode) {
      lsSet("scm_pending_invite", inviteCode);
      setView("signup");
    }
  },[inviteCode]);

  const handleLogin = async () => {
    const sb = getSupabase(); if(!sb){ setError("Service unavailable, try again shortly."); return; }
    setLoading(true); setError("");
    const { error: e } = await sb.auth.signInWithPassword({ email, password: pass });
    setLoading(false);
    if(e) setError(e.message); else onLogin();
  };

  const handleSignup = async () => {
    const sb = getSupabase(); if(!sb){ setError("Service unavailable, try again shortly."); return; }
    setLoading(true); setError("");
    const { error: e } = await sb.auth.signUp({ email, password: pass, options:{ data:{ full_name: name } } });
    setLoading(false);
    if(e) setError(e.message); else setSent(true);
  };

  const features = [
    { icon:"⚽", title:"Live Field View", desc:"Half-field with real formations and tap-to-assign players" },
    { icon:"🤖", title:"Smart Auto Sub", desc:"AI suggests the fairest swap to equalise playing time" },
    { icon:"⏱", title:"Sub Alerts", desc:"Audio + vibration alerts so you never miss a rotation" },
    { icon:"📊", title:"Season Stats", desc:"Track every player's minutes across the whole season" },
    { icon:"📋", title:"Sub Queue", desc:"Plan your next 3 substitutions in advance" },
    { icon:"☁️", title:"Cloud Sync", desc:"Your team saves automatically across all your devices" },
  ];

  if (view === "home") return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", background:"#0d1117", minHeight:"100vh", color:"#e6edf3" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
      `}</style>

      {/* Nav */}
      <div style={{ padding:"20px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #21262d" }}>
        <div>
          <div style={{ fontSize:10, letterSpacing:3, textTransform:"uppercase", color:"#4ade80", fontWeight:700 }}>⚽ Coach Manager</div>
          <div style={{ fontSize:22, fontWeight:800, letterSpacing:-0.5, lineHeight:1.1 }}>Subby</div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setView("login")} style={{ background:"transparent", border:"1px solid #30363d", color:"#8b949e", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer" }}>Log In</button>
          <button onClick={()=>setView("signup")} style={{ background:"#4ade80", border:"none", color:"#0d1117", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer" }}>Sign Up Free</button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding:"64px 24px 48px", textAlign:"center", maxWidth:540, margin:"0 auto", animation:"fadeUp .6s ease" }}>
        <div style={{ display:"inline-block", background:"#4ade8018", border:"1px solid #4ade8033", borderRadius:20, padding:"6px 16px", fontSize:11, color:"#4ade80", fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:20 }}>
          Built for soccer coaches
        </div>
        <div style={{ fontSize:48, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2, lineHeight:1, marginBottom:16, background:"linear-gradient(135deg,#fff 40%,#4ade80)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          Manage Your Team Like a Pro
        </div>
        <div style={{ fontSize:16, color:"#8b949e", lineHeight:1.7, marginBottom:36 }}>
          Real-time substitution management, fairness tracking, and smart auto-subs — all in one sideline app.
        </div>
        <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
          <button onClick={()=>setView("signup")} style={{ background:"#4ade80", border:"none", color:"#0d1117", borderRadius:12, padding:"14px 32px", fontSize:16, fontWeight:800, cursor:"pointer", letterSpacing:0.3 }}>
            Get Started Free →
          </button>
          <button onClick={()=>setView("login")} style={{ background:"#21262d", border:"1px solid #30363d", color:"#e6edf3", borderRadius:12, padding:"14px 28px", fontSize:15, fontWeight:600, cursor:"pointer" }}>
            Log In
          </button>
        </div>
      </div>

      {/* Field preview graphic */}
      <div style={{ padding:"0 24px 48px", display:"flex", justifyContent:"center" }}>
        <div style={{ position:"relative", width:"100%", maxWidth:320, paddingBottom:"38%", borderRadius:16, overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px #30363d", animation:"fadeUp .8s ease" }}>
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,#1e5c20,#174d19)" }}>
            {[...Array(5)].map((_,i)=><div key={i} style={{ position:"absolute", top:`${i*20}%`, height:"10%", left:0, right:0, background:"rgba(255,255,255,0.03)" }}/>)}
          </div>
          <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
            <rect x="2" y="1" width="96" height="38" rx="1" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6"/>
            <line x1="2" y1="1" x2="98" y2="1" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6"/>
            <rect x="22" y="27" width="56" height="12" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5"/>
            <rect x="40" y="33" width="20" height="6" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5"/>
          </svg>
          {/* Sample player dots */}
          {[{x:50,y:88,r:"GK",c:"#f59e0b"},{x:20,y:65,r:"D",c:"#60a5fa"},{x:50,y:65,r:"D",c:"#60a5fa"},{x:80,y:65,r:"D",c:"#60a5fa"},{x:25,y:42,r:"M",c:"#34d399"},{x:50,y:38,r:"M",c:"#34d399"},{x:75,y:42,r:"M",c:"#34d399"},{x:50,y:18,r:"F",c:"#f87171"}].map((p,i)=>(
            <div key={i} style={{ position:"absolute", left:`${p.x}%`, top:`${p.y*(38/100)}%`, transform:"translate(-50%,-50%)", width:14, height:14, borderRadius:"50%", background:p.c, border:"1.5px solid rgba(255,255,255,0.8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:5, fontWeight:800, color:"white" }}>{p.r}</div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div style={{ padding:"0 24px 64px", maxWidth:560, margin:"0 auto" }}>
        <div style={{ fontSize:11, color:"#8b949e", textTransform:"uppercase", letterSpacing:2, fontWeight:700, textAlign:"center", marginBottom:24 }}>Everything you need on the sideline</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {features.map((f,i)=>(
            <div key={i} style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:14, padding:"16px 14px", animation:`fadeUp ${0.4+i*0.1}s ease` }}>
              <div style={{ fontSize:24, marginBottom:8 }}>{f.icon}</div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{f.title}</div>
              <div style={{ fontSize:11, color:"#6b7280", lineHeight:1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding:"32px 24px 64px", textAlign:"center", borderTop:"1px solid #21262d" }}>
        <div style={{ fontSize:28, fontWeight:800, marginBottom:8 }}>Ready to coach smarter?</div>
        <div style={{ fontSize:14, color:"#8b949e", marginBottom:24 }}>Free to use. No credit card required.</div>
        <button onClick={()=>setView("signup")} style={{ background:"#4ade80", border:"none", color:"#0d1117", borderRadius:12, padding:"14px 36px", fontSize:16, fontWeight:800, cursor:"pointer" }}>
          Create Free Account →
        </button>
      </div>
    </div>
  );

  // ── Auth forms ──────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", background:"#0d1117", minHeight:"100vh", color:"#e6edf3", display:"flex", flexDirection:"column" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Bebas+Neue&display=swap');*{box-sizing:border-box;margin:0;padding:0}input:focus{border-color:#4ade80!important;outline:none}input::placeholder{color:#4b5563}@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Back */}
      <div style={{ padding:"16px 24px" }}>
        <button onClick={()=>{setView("home");setError("");setSent(false);}} style={{ background:"transparent", border:"none", color:"#8b949e", fontSize:13, cursor:"pointer", padding:0 }}>← Back</button>
      </div>

      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 24px 48px" }}>
        <div style={{ width:"100%", maxWidth:400, animation:"fadeUp .3s ease" }}>

          {/* Logo */}
          <div style={{ textAlign:"center", marginBottom:32 }}>
            <div style={{ fontSize:10, letterSpacing:3, textTransform:"uppercase", color:"#4ade80", fontWeight:700, marginBottom:4 }}>⚽ Coach Manager</div>
            <div style={{ fontSize:36, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2 }}>Subby</div>
          </div>

          <div style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:20, padding:"32px 28px" }}>
            {sent ? (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:40, marginBottom:16 }}>📧</div>
                <div style={{ fontSize:20, fontWeight:800, marginBottom:8 }}>Check your email!</div>
                <div style={{ fontSize:13, color:"#8b949e", lineHeight:1.6 }}>We sent a confirmation link to<br/><strong style={{ color:"#e6edf3" }}>{email}</strong><br/>Click it to activate your account then come back and log in.</div>
                <button onClick={()=>{setSent(false);setView("login");}} style={{ marginTop:24, width:"100%", padding:13, background:"#4ade80", border:"none", borderRadius:12, color:"#0d1117", fontSize:15, fontWeight:700, cursor:"pointer" }}>Go to Log In</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>{view==="login" ? "Welcome back" : "Create account"}</div>
                <div style={{ fontSize:13, color:"#8b949e", marginBottom: inviteCode ? 12 : 24 }}>{view==="login" ? "Log in to access your team" : "Save your team across all devices"}</div>

                {inviteCode && (
                  <div style={{ background:"#4ade8018", border:"1px solid #4ade8044", borderRadius:10, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ fontSize:20 }}>🏆</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#4ade80" }}>You've been invited!</div>
                      <div style={{ fontSize:11, color:"#8b949e" }}>Sign up or log in to join the team</div>
                    </div>
                  </div>
                )}

                {error && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"10px 12px", fontSize:12, color:"#f87171", marginBottom:16 }}>{error}</div>}

                {view==="signup" && (
                  <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name (e.g. Coach Keith)"
                    style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:10, padding:"12px 14px", color:"#e6edf3", fontSize:14, marginBottom:10 }}/>
                )}
                <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" type="email"
                  style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:10, padding:"12px 14px", color:"#e6edf3", fontSize:14, marginBottom:10 }}/>
                <input value={pass} onChange={e=>setPass(e.target.value)} placeholder={view==="login"?"Password":"Password (min 6 characters)"} type="password"
                  onKeyDown={e=>e.key==="Enter"&&(view==="login"?handleLogin():handleSignup())}
                  style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:10, padding:"12px 14px", color:"#e6edf3", fontSize:14, marginBottom:20 }}/>

                <button
                  onClick={view==="login"?handleLogin:handleSignup}
                  disabled={loading||!email||!pass||(view==="signup"&&pass.length<6)||!sbReady}
                  style={{ width:"100%", padding:14, background:loading||!email||!pass||!sbReady?"#21262d":"#4ade80", border:"none", borderRadius:12, color:loading||!email||!pass||!sbReady?"#4b5563":"#0d1117", fontSize:15, fontWeight:700, cursor:"pointer" }}>
                  {!sbReady?"Connecting...":(loading?(view==="login"?"Logging in…":"Creating account…"):(view==="login"?"Log In →":"Create Account & Get Started →"))}
                </button>

                <div style={{ textAlign:"center", marginTop:16, fontSize:13, color:"#6b7280" }}>
                  {view==="login" ? "Don't have an account?" : "Already have an account?"}
                  {" "}
                  <button onClick={()=>{setView(view==="login"?"signup":"login");setError("");}} style={{ background:"none", border:"none", color:"#4ade80", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                    {view==="login"?"Sign up free":"Log in"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────
export default function App() {
  // ── Team state (must be first — auth block references these) ─
  const [teamName,setTeamName]   = useState(()=>lsGet("scm_teamName",""));
  const [playerCount,setPC]      = useState(()=>lsGet("scm_playerCount",7));
  const [names,setNames]         = useState(()=>lsGet("scm_names",Array(15).fill("")));
  const [numbers,setNumbers]     = useState(()=>lsGet("scm_numbers",Array(15).fill("")));
  const [notes,setNotes]         = useState(()=>lsGet("scm_notes",Array(15).fill("")));
  const [subIntervalMins,setSIM] = useState(()=>lsGet("scm_subInterval",8));
  const [formation,setFormation] = useState(()=>lsGet("scm_formation","2-3-1"));
  const [customForms,setCF]      = useState(()=>lsGet("scm_customForms",{}));
  const [autoSub,setAutoSub]     = useState(()=>lsGet("scm_autoSub",false));

  // ── Auth & cloud ─────────────────────────────────────────────
  const [sbReady,setSbReady]   = useState(false);
  const [user,setUser]         = useState(null);
  const [authView,setAuthView] = useState(null);
  const [authEmail,setAuthEmail]   = useState("");
  const [authPass,setAuthPass]     = useState("");
  const [authName,setAuthName]     = useState("");
  const [authError,setAuthError]   = useState("");
  const [authLoading,setAuthLoading] = useState(false);
  const [cloudSaving,setCloudSaving] = useState(false);
  const [lastSaved,setLastSaved]   = useState(null);
  const [inviteCode,setInviteCode] = useState(null);  // current team's invite code
  const [teamOwnerId,setTeamOwnerId] = useState(null); // owner of shared team
  const [showInviteModal,setShowInviteModal] = useState(false);
  const [appReady,setAppReady]     = useState(false); // true once session check done

  // Load Supabase SDK from CDN once
  useEffect(()=>{
    if(window.supabase){ setSbReady(true); return; }
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
    s.onload=()=>setSbReady(true);
    s.onerror=()=>console.warn("Supabase SDK failed to load");
    document.head.appendChild(s);
  },[]);

  // Once SDK ready, restore session
  useEffect(()=>{
    if(!sbReady) return;
    const sb=getSupabase();
    if(!sb){ setAppReady(true); return; }

    const hash=window.location.hash;
    if(hash&&(hash.includes("access_token")||hash.includes("type=signup")||hash.includes("type=recovery"))){
      sb.auth.getSession().then(({data})=>{
        if(data?.session?.user){ setUser(data.session.user); }
        setAppReady(true);
        window.history.replaceState(null,"",window.location.pathname);
      });
    } else {
      sb.auth.getSession().then(({data})=>{
        if(data?.session?.user) setUser(data.session.user);
        setAppReady(true);
      });
    }

    const {data:{subscription}}=sb.auth.onAuthStateChange((_event,session)=>{
      setUser(session?.user||null);
      if(session?.user) setAuthView(null);
    });
    return()=>subscription.unsubscribe();
  },[sbReady]);

  // Load team from cloud when user logs in
  useEffect(()=>{
    if(!user) return;
    const sb=getSupabase(); if(!sb) return;

    // Check if there's a pending invite code in localStorage
    const pendingInvite = lsGet("scm_pending_invite","");

    if(pendingInvite) {
      // Join team via invite code
      sb.from("teams").select("*").eq("invite_code", pendingInvite).single()
        .then(async ({data, error}) => {
          if(data && !error) {
            // Add this user to the team's members array
            const members = data.members || [];
            if(!members.includes(user.id)) {
              await sb.from("teams").update({
                members: [...members, user.id]
              }).eq("id", data.id);
            }
            // Load the team data
            setTeamName(data.team_name||"");
            if(data.player_count) setPC(data.player_count);
            if(data.names)      setNames(data.names);
            if(data.numbers)    setNumbers(data.numbers);
            if(data.notes)      setNotes(data.notes);
            if(data.formation)  setFormation(data.formation);
            if(data.custom_formations) setCF(data.custom_formations);
            if(data.sub_interval) setSIM(data.sub_interval);
            if(data.auto_sub!=null) setAutoSub(data.auto_sub);
            setTeamOwnerId(data.user_id);
            setInviteCode(data.invite_code);
            lsSet("scm_pending_invite","");
          }
        });
      return;
    }

    // Normal load — own team first, then check member teams
    sb.from("teams").select("*").eq("user_id",user.id).single()
      .then(async ({data,error})=>{
        if(data&&!error){
          if(data.team_name)  setTeamName(data.team_name);
          if(data.player_count) setPC(data.player_count);
          if(data.names)      setNames(data.names);
          if(data.numbers)    setNumbers(data.numbers);
          if(data.notes)      setNotes(data.notes);
          if(data.formation)  setFormation(data.formation);
          if(data.custom_formations) setCF(data.custom_formations);
          if(data.sub_interval) setSIM(data.sub_interval);
          if(data.auto_sub!=null) setAutoSub(data.auto_sub);
          setInviteCode(data.invite_code||null);
          setTeamOwnerId(data.user_id);
          setLastSaved(data.updated_at);
        } else {
          // Maybe this user is a member of someone else's team
          sb.from("teams").select("*").contains("members",[user.id]).single()
            .then(({data:td})=>{
              if(td){
                if(td.team_name)  setTeamName(td.team_name);
                if(td.player_count) setPC(td.player_count);
                if(td.names)      setNames(td.names);
                if(td.numbers)    setNumbers(td.numbers);
                if(td.notes)      setNotes(td.notes);
                if(td.formation)  setFormation(td.formation);
                if(td.custom_formations) setCF(td.custom_formations);
                if(td.sub_interval) setSIM(td.sub_interval);
                if(td.auto_sub!=null) setAutoSub(td.auto_sub);
                setInviteCode(td.invite_code||null);
                setTeamOwnerId(td.user_id);
                setLastSaved(td.updated_at);
              }
            });
        }
      });
  },[user]);

  const saveToCloud = useCallback(async(overrides={})=>{
    if(!user) return;
    const sb=getSupabase(); if(!sb) return;
    setCloudSaving(true);
    const payload={
      user_id: user.id,
      team_name: overrides.teamName??teamName,
      player_count: overrides.playerCount??playerCount,
      names: overrides.names??names,
      numbers: overrides.numbers??numbers,
      notes: overrides.notes??notes,
      formation: overrides.formation??formation,
      custom_formations: overrides.customForms??customForms,
      sub_interval: overrides.subIntervalMins??subIntervalMins,
      auto_sub: overrides.autoSub??autoSub,
      updated_at: new Date().toISOString(),
    };
    const {error}=await sb.from("teams").upsert(payload,{onConflict:"user_id"});
    setCloudSaving(false);
    if(!error) setLastSaved(payload.updated_at);
  },[user,teamName,playerCount,names,numbers,notes,formation,customForms,subIntervalMins,autoSub]);

  const generateInviteLink = async () => {
    const sb = getSupabase(); if(!sb) return;
    // Generate a random 8-char code
    const code = Math.random().toString(36).substring(2,10).toUpperCase();
    const {error} = await sb.from("teams")
      .update({ invite_code: code })
      .eq("user_id", user.id);
    if(!error) {
      setInviteCode(code);
      setShowInviteModal(true);
    }
  };

  const shareInviteLink = () => {
    const url = `${window.location.origin}?invite=${inviteCode}`;
    if(navigator.share) {
      navigator.share({ title:"Join my team on Subby", text:`Coach ${teamName} — join my team!`, url });
    } else {
      navigator.clipboard?.writeText(url).then(()=>alert("Link copied!"));
    }
  };
    const sb=getSupabase(); if(!sb){setAuthError("Supabase not configured.");return;}
    setAuthLoading(true); setAuthError("");
    const {error}=await sb.auth.signInWithPassword({email:authEmail,password:authPass});
    setAuthLoading(false);
    if(error)setAuthError(error.message); else setAuthView(null);
  };
  const handleSignup = async()=>{
    const sb=getSupabase(); if(!sb){setAuthError("Supabase not configured.");return;}
    setAuthLoading(true); setAuthError("");
    const {error}=await sb.auth.signUp({email:authEmail,password:authPass,options:{data:{full_name:authName}}});
    setAuthLoading(false);
    if(error)setAuthError(error.message); else { setAuthView(null); saveToCloud(); }
  };
  const handleLogout = async()=>{
    const sb=getSupabase(); if(!sb) return;
    await sb.auth.signOut(); setUser(null);
  };
  const saveCredentials = ()=>{
    lsSet("scm_sb_url",sbUrl.trim());
    lsSet("scm_sb_key",sbKey.trim());
    resetSupabaseClient();
    // Force init immediately so login screen can use it
    getSupabase();
    setAuthView("login");
  };

  // ── Persist settings ─────────────────────────────────────────
  useEffect(()=>lsSet("scm_teamName",teamName),[teamName]);
  useEffect(()=>lsSet("scm_playerCount",playerCount),[playerCount]);
  useEffect(()=>lsSet("scm_names",names),[names]);
  useEffect(()=>lsSet("scm_numbers",numbers),[numbers]);
  useEffect(()=>lsSet("scm_notes",notes),[notes]);
  useEffect(()=>lsSet("scm_subInterval",subIntervalMins),[subIntervalMins]);
  useEffect(()=>lsSet("scm_formation",formation),[formation]);
  useEffect(()=>lsSet("scm_customForms",customForms),[customForms]);
  useEffect(()=>lsSet("scm_autoSub",autoSub),[autoSub]);

  // Debounced cloud save — fires 2s after last change when logged in
  const cloudSaveTimer = useRef(null);
  useEffect(()=>{
    if(!user) return;
    clearTimeout(cloudSaveTimer.current);
    cloudSaveTimer.current=setTimeout(()=>saveToCloud(),2000);
    return()=>clearTimeout(cloudSaveTimer.current);
  },[user,teamName,playerCount,names,numbers,notes,formation,customForms,subIntervalMins,autoSub]);

  const [phase,setPhase]         = useState("setup");
  const [assigned,setAssigned]   = useState(Array(7).fill(null));
  const [pickerPos,setPickerPos] = useState(null);
  const [showFB,setShowFB]       = useState(false);

  const [gameTime,setGameTime]   = useState(0);
  const [isRunning,setIsRunning] = useState(false);
  const [subCountdown,setSC]     = useState(0);
  const [alertActive,setAlertActive] = useState(false);
  const [autoSubProposal,setAutoSubProposal] = useState(null); // {posIdx,outId,inId}
  const [stats,setStats]         = useState({});
  const [subLog,setSubLog]       = useState([]);
  const [subQueue,setSubQueue]   = useState([]);
  const [tab,setTab]             = useState("field");
  const [showStats,setShowStats] = useState(false);
  const [showSeason,setShowSeason] = useState(false);

  const timerRef    = useRef(null);
  const wakeLockRef = useRef(null);
  const savedGameRef = useRef(false);
  // Refs so the interval always sees fresh values without stale closures
  const scRef       = useRef(0);   // mirrors subCountdown
  const autoSubRef  = useRef(autoSub);
  const computeRef  = useRef(null); // set after computeBestSwap is defined

  useEffect(()=>{ autoSubRef.current = autoSub; }, [autoSub]);

  // Derived
  const outfieldCount  = playerCount - 1;
  const builtinEntries = FORMATION_CATALOG[Math.min(10,Math.max(4,outfieldCount))]||FORMATION_CATALOG[6];
  const customEntries  = (customForms[outfieldCount]||[]).map(f=>({f,name:"Custom",desc:"Your formation"}));
  const catalog        = [...builtinEntries,...customEntries];
  const positions      = buildPositions(formation);
  const roster         = names.map((n,i)=>({id:i,name:n.trim()})).filter(p=>p.name);
  const onField        = new Set(assigned.filter(id=>id!=null));
  const bench          = roster.filter(p=>!onField.has(p.id));
  const half           = gameTime<HALF_SECS?1:2;
  const halfDisplay    = gameTime<HALF_SECS?gameTime:gameTime-HALF_SECS;
  const gameOver       = gameTime>=HALF_SECS*2;
  const atHalftime     = gameTime===HALF_SECS&&!isRunning;

  const getTotal = useCallback(id=>{ const s=stats[id]; if(!s)return 0; return s.total+(s.startTime!=null?gameTime-s.startTime:0); },[stats,gameTime]);
  const getStint = useCallback(id=>{ const s=stats[id]; if(!s)return 0; return s.startTime!=null?gameTime-s.startTime:0; },[stats,gameTime]);

  // Fairness
  const expectedTime = roster.length>0?(gameTime*playerCount)/roster.length:0;
  const fairness = id=>{ if(expectedTime===0)return"ok"; const r=getTotal(id)/expectedTime; return r<0.55?"low":r<0.78?"warn":"ok"; };
  const fairColor = {ok:"#4ade80",warn:"#f59e0b",low:"#ef4444"};

  // Formation helpers
  const changeFormation = f => { setFormation(f); setAssigned(Array(buildPositions(f).length).fill(null)); };
  const changePlayerCount = n => {
    setPC(n);
    const cat=FORMATION_CATALOG[Math.min(10,Math.max(4,n-1))]||FORMATION_CATALOG[6];
    const newF=cat[0].f;
    setFormation(newF);
    setAssigned(Array(buildPositions(newF).length).fill(null));
  };
  const saveCustomFormation = fStr => {
    setCF(prev=>{ const k=outfieldCount,ex=prev[k]||[]; if(ex.includes(fStr)||builtinEntries.some(e=>e.f===fStr))return prev; return{...prev,[k]:[...ex,fStr]}; });
    changeFormation(fStr); setShowFB(false);
  };
  const deleteCustomFormation = fStr => {
    setCF(prev=>({...prev,[outfieldCount]:(prev[outfieldCount]||[]).filter(f=>f!==fStr)}));
    if(formation===fStr)changeFormation(builtinEntries[0].f);
  };

  // Wake lock
  useEffect(()=>{
    if(phase==="game"&&isRunning){ acquireWakeLock().then(l=>{wakeLockRef.current=l;}); }
    else{ wakeLockRef.current?.release().catch(()=>{}); wakeLockRef.current=null; }
  },[phase,isRunning]);

  // Timer — alert fires directly inside the interval to avoid stale-closure misses
  useEffect(()=>{
    if(isRunning&&!gameOver){
      timerRef.current=setInterval(()=>{
        setGameTime(t=>Math.min(t+1,HALF_SECS*2));
        setSC(prev=>{
          const next=Math.max(0,prev-1);
          scRef.current=next;
          if(next===0 && prev>0){
            // Fire immediately — no useEffect delay
            fireAlert();
            setAlertActive(true);
            if(autoSubRef.current && computeRef.current){
              const swap=computeRef.current();
              setAutoSubProposal(swap);
            }
          }
          return next;
        });
      },1000);
    }
    return()=>clearInterval(timerRef.current);
  },[isRunning,gameOver]);

  useEffect(()=>{ if(gameTime===HALF_SECS||gameTime>=HALF_SECS*2)setIsRunning(false); },[gameTime]);

  const computeBestSwap = useCallback(()=>{
    const benchPlayers = roster.filter(p => !onField.has(p.id));
    if (benchPlayers.length === 0) return null;
    const inPlayer = benchPlayers.slice().sort((a,b) => getTotal(a.id) - getTotal(b.id))[0];
    const fieldCandidates = positions
      .map((pos, pi) => ({ pos, pi, pid: assigned[pi] }))
      .filter(({ pos, pid }) => pos.role !== "GK" && pid != null);
    if (fieldCandidates.length === 0) return null;
    const outCandidate = fieldCandidates.slice().sort((a,b) => getTotal(b.pid) - getTotal(a.pid))[0];
    return { posIdx: outCandidate.pi, outId: outCandidate.pid, inId: inPlayer.id };
  }, [roster, onField, positions, assigned, getTotal]);

  // Keep ref fresh so interval can call it without stale closures
  useEffect(()=>{ computeRef.current = computeBestSwap; }, [computeBestSwap]);

  // Save to season on game over (once)
  useEffect(()=>{
    if(gameOver&&!savedGameRef.current&&roster.length>0&&gameTime>0){
      savedGameRef.current=true;
      const record={ date:new Date().toISOString(), teamName, formation,
        playerStats:roster.map(p=>({id:p.id,name:p.name,number:numbers[p.id],total:getTotal(p.id),positions:{...(stats[p.id]?.positions||{})}}))};
      lsSet("scm_season",[record,...lsGet("scm_season",[])].slice(0,20));
    }
  },[gameOver]);

  // Assign
  const handleAssign = (posIdx,playerId)=>{
    if(phase==="game"){
      const outId=assigned[posIdx], role=positions[posIdx].role;
      if(outId!=null&&outId!==playerId){
        setStats(prev=>{
          const next={...prev};
          const ps={...next[outId]}, stint=ps.startTime!=null?gameTime-ps.startTime:0;
          next[outId]={...ps,total:ps.total+stint,startTime:null,positions:{...ps.positions,[role]:(ps.positions[role]||0)+stint}};
          const ps2=next[playerId]||{total:0,startTime:null,positions:{}};
          next[playerId]={...ps2,startTime:gameTime};
          return next;
        });
        setSubLog(prev=>[...prev,{time:gameTime,half,role,outId,inId:playerId}]);
        setAlertActive(false);
        const newSC = subIntervalMins*60;
        setSC(newSC); scRef.current = newSC;
        setAutoSubProposal(null);
        setSubQueue(prev=>prev.filter(q=>!(q.posIdx===posIdx&&q.inId===playerId)));
      }
      if(outId==null){
        setStats(prev=>{const next={...prev},ps=next[playerId]||{total:0,startTime:null,positions:{}};next[playerId]={...ps,startTime:gameTime};return next;});
      }
    }
    setAssigned(prev=>{ const n=[...prev],ex=n.indexOf(playerId); if(ex!==-1&&ex!==posIdx)n[ex]=n[posIdx]; n[posIdx]=playerId; return n; });
    setPickerPos(null);
  };

  const handleClear = posIdx=>{
    if(phase==="game"){
      const outId=assigned[posIdx];
      if(outId!=null){
        const role=positions[posIdx].role;
        setStats(prev=>{const next={...prev},ps={...next[outId]},stint=ps.startTime!=null?gameTime-ps.startTime:0;next[outId]={...ps,total:ps.total+stint,startTime:null,positions:{...ps.positions,[role]:(ps.positions[role]||0)+stint}};return next;});
      }
    }
    setAssigned(prev=>{const n=[...prev];n[posIdx]=null;return n;}); setPickerPos(null);
  };

  // Sub queue
  const addToQueue = item=>{ if(subQueue.length<3)setSubQueue(prev=>[...prev,item]); };
  const removeFromQueue = i=>setSubQueue(prev=>prev.filter((_,j)=>j!==i));
  const executeQueued = q=>handleAssign(q.posIdx,q.inId);

  // Game controls
  const startGame = ()=>{
    const init={};
    roster.forEach(p=>{init[p.id]={total:0,startTime:null,positions:{}};});
    assigned.forEach((id,pi)=>{ if(id!=null){const role=positions[pi].role;init[id]={total:0,startTime:0,positions:{[role]:0}};} });
    setStats(init); setSC(subIntervalMins*60); scRef.current=subIntervalMins*60; setGameTime(0); setSubLog([]); setSubQueue([]);
    setAlertActive(false); setIsRunning(true); setTab("field"); setShowStats(false); setShowSeason(false);
    savedGameRef.current=false; setPhase("game");
  };
  const startSecondHalf = ()=>{ const newSC=subIntervalMins*60; setSC(newSC); scRef.current=newSC; setAlertActive(false); setIsRunning(true); };
  const resetToSetup = ()=>{
    setPhase("setup"); setGameTime(0); setIsRunning(false); setStats({}); setSubLog([]); setSubQueue([]);
    setAlertActive(false); setShowStats(false); setShowSeason(false);
  };

  // Share current game report
  const shareReport = ()=>{
    const lines=[`${teamName} · Game Report`,`Formation: ${formation}`,"",
      ...roster.slice().sort((a,b)=>getTotal(b.id)-getTotal(a.id)).map(p=>{
        const s=stats[p.id], pos=s?Object.entries(s.positions).filter(([_,v])=>v>0).map(([r,sec])=>r+":"+Math.floor(sec/60)+"m"):[];
        return p.name+(numbers[p.id]?" #"+numbers[p.id]:"")+": "+fmtMin(getTotal(p.id))+(pos.length?" ("+pos.join(", ")+")":""); })
    ].join("\n");
    if(navigator.share)navigator.share({title:"Game Report",text:lines}).catch(()=>{});
    else navigator.clipboard?.writeText(lines).then(()=>alert("Copied!")).catch(()=>alert(lines));
  };

  // ── Show landing page if not logged in ──────────────────────
  if(!appReady) return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", background:"#0d1117", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:"#4ade80" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3, marginBottom:12 }}>⚽ Subby</div>
        <div style={{ width:24, height:24, border:"3px solid #21262d", borderTopColor:"#4ade80", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }}/>
      </div>
    </div>
  );

  if(!user) return <LandingPage sbReady={sbReady} onLogin={()=>{}} onSignup={()=>{}}/>;

  // ── MAIN APP (logged in) ─────────────────────────────────────
  return (
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:"#0d1117",minHeight:"100vh",color:"#e6edf3",maxWidth:480,margin:"0 auto"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@500&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input,select,button,textarea{font-family:inherit}
        input:focus,select:focus,textarea:focus{border-color:#4ade80!important;outline:none}
        input::placeholder,textarea::placeholder{color:#4b5563}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}
        @keyframes bloop{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.18)}}
        @keyframes sheetUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pageIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes alertPulse{0%,100%{opacity:1}50%{opacity:0.82}}
      `}</style>

      {/* HEADER */}
      <div style={{background:"#0d1117",borderBottom:"1px solid #21262d",padding:"12px 20px 10px",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:10,letterSpacing:2.5,textTransform:"uppercase",color:"#4ade80",fontWeight:700,marginBottom:1}}>⚽ Coach Manager</div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:-0.3,lineHeight:1}}>{teamName||"My Team"}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {phase==="game"&&(
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:"#8b949e",textTransform:"uppercase",letterSpacing:1.5,fontWeight:700}}>{gameOver?"Full Time":atHalftime?"Half Time":`Half ${half}`}</div>
                <div style={{fontSize:38,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,lineHeight:1,color:gameOver?"#4ade80":"white"}}>{fmt(halfDisplay)}</div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:cloudSaving?"#f59e0b":"#4ade80"}}/>
                <span style={{fontSize:10,color:"#8b949e",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</span>
                <button onClick={handleLogout} style={{background:"#21262d",border:"1px solid #30363d",color:"#8b949e",borderRadius:6,padding:"3px 8px",fontSize:10,cursor:"pointer",fontWeight:600}}>Out</button>
              </div>
              {cloudSaving&&<div style={{fontSize:9,color:"#f59e0b"}}>Saving…</div>}
              {!cloudSaving&&lastSaved&&<div style={{fontSize:9,color:"#4b5563"}}>✓ Saved</div>}
            </div>
            {phase==="field"&&<button onClick={()=>setPhase("setup")} style={{background:"#21262d",border:"1px solid #30363d",color:"#8b949e",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>← Back</button>}
          </div>
        </div>
      </div>

      {/* ══ SETUP ══ */}
      {phase==="setup"&&!showSeason&&(
        <div style={{padding:"20px 20px 48px",animation:"pageIn .3s ease"}}>
          <Section label="Team Name">
            <input value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="e.g. Lightning FC"
              style={{width:"100%",background:"#161b22",border:"1px solid #30363d",borderRadius:10,padding:"11px 14px",color:"#e6edf3",fontSize:15}}/>
          </Section>

          <Section label="Players on field (including GK)">
            <div style={{display:"flex",gap:8}}>
              {[5,6,7,8,9,11].map(n=><Chip key={n} active={playerCount===n} onClick={()=>changePlayerCount(n)}>{n}</Chip>)}
            </div>
          </Section>

          <Section label={`Formation · ${outfieldCount} outfield + GK`}>
            <FormationPicker catalog={catalog} formation={formation} outfieldCount={outfieldCount}
              onSelect={changeFormation} onDelete={deleteCustomFormation} onAdd={()=>setShowFB(true)}/>
          </Section>

          <Section label="Sub alert every (minutes)">
            <div style={{display:"flex",gap:8}}>
              {[5,6,7,8,10,12].map(m=><Chip key={m} active={subIntervalMins===m} onClick={()=>setSIM(m)} flex>{m}</Chip>)}
            </div>
          </Section>

          <Section label="Auto Sub">
            <div style={{background:"#161b22",border:`1px solid ${autoSub?"#4ade80":"#30363d"}`,borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",transition:"border-color .2s"}}
              onClick={()=>setAutoSub(v=>!v)}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:autoSub?"#4ade80":"#e6edf3"}}>🤖 Smart Auto Sub</div>
                <div style={{fontSize:11,color:"#8b949e",marginTop:3,lineHeight:1.4}}>At each sub alert, automatically suggests the best<br/>swap to equalise playing time across all players</div>
              </div>
              <div style={{width:44,height:24,borderRadius:12,background:autoSub?"#4ade80":"#30363d",position:"relative",flexShrink:0,transition:"background .2s",marginLeft:12}}>
                <div style={{position:"absolute",top:2,left:autoSub?20:2,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.4)"}}/>
              </div>
            </div>
          </Section>

          <Section label="Roster — name & jersey number">
            <div style={{display:"grid",gap:7}}>
              {names.map((n,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 56px",gap:7}}>
                  <input value={n} onChange={e=>setNames(prev=>{const nx=[...prev];nx[i]=e.target.value;return nx;})}
                    placeholder={`Player ${i+1}`}
                    style={{background:"#161b22",border:"1px solid #30363d",borderRadius:8,padding:"9px 12px",color:"#e6edf3",fontSize:13}}/>
                  <input value={numbers[i]} onChange={e=>setNumbers(prev=>{const nx=[...prev];nx[i]=e.target.value;return nx;})}
                    placeholder="#"
                    style={{background:"#161b22",border:"1px solid #30363d",borderRadius:8,padding:"9px 8px",color:"#e6edf3",fontSize:13,textAlign:"center"}}/>
                </div>
              ))}
            </div>
          </Section>

          <button onClick={()=>{ if(roster.length<playerCount){alert(`Add at least ${playerCount} player names.`);return;} setPhase("field"); }}
            style={{width:"100%",padding:15,background:"#4ade80",border:"none",borderRadius:12,color:"#0d1117",fontSize:16,fontWeight:700,cursor:"pointer"}}>
            Set Lineup →
          </button>

          <button onClick={()=>setShowSeason(true)}
            style={{width:"100%",padding:12,background:"transparent",border:"1px solid #30363d",borderRadius:12,color:"#8b949e",fontSize:13,cursor:"pointer",fontWeight:600,marginTop:10}}>
            📊 Season Stats {lsGet("scm_season",[]).length>0?`(${lsGet("scm_season",[]).length} games)`:""}
          </button>

          <button onClick={inviteCode ? ()=>setShowInviteModal(true) : generateInviteLink}
            style={{width:"100%",padding:12,background:"#7c3aed22",border:"1px solid #7c3aed",borderRadius:12,color:"#a78bfa",fontSize:13,cursor:"pointer",fontWeight:600,marginTop:10}}>
            👥 Invite a Coach
          </button>
        </div>
      )}

      {/* ══ SEASON from setup ══ */}
      {phase==="setup"&&showSeason&&<SeasonView onClose={()=>setShowSeason(false)}/>}

      {/* ══ FIELD + GAME ══ */}
      {(phase==="field"||phase==="game")&&!showStats&&!showSeason&&(
        <div style={{animation:"pageIn .3s ease"}}>

          {/* Alert banner */}
          {alertActive&&(
            <div style={{background:"linear-gradient(90deg,#d97706,#dc2626)",padding:"14px 16px",animation:"alertPulse 1s ease-in-out infinite"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom: autoSubProposal ? 10 : 0}}>
                <div style={{fontSize:16,fontWeight:700}}>
                  {autoSub ? "🤖 Auto Sub Ready" : "🔔 Time to Sub!"}
                </div>
                <button onClick={()=>{setAlertActive(false);const newSC=subIntervalMins*60;setSC(newSC);scRef.current=newSC;setAutoSubProposal(null);}}
                  style={{background:"rgba(0,0,0,0.3)",border:"none",color:"white",padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  Skip
                </button>
              </div>

              {/* Auto-sub proposal card */}
              {autoSubProposal&&(()=>{
                const inP  = roster.find(p=>p.id===autoSubProposal.inId);
                const outP = roster.find(p=>p.id===autoSubProposal.outId);
                const pos  = positions[autoSubProposal.posIdx];
                return (
                  <div style={{background:"rgba(0,0,0,0.25)",borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginBottom:4}}>Suggested swap · {pos?.role}</div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:14,fontWeight:800,color:"#fca5a5"}}>{outP?.name||"?"}</div>
                          <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{fmtMin(getTotal(autoSubProposal.outId))} played</div>
                        </div>
                        <div style={{fontSize:18,color:"rgba(255,255,255,0.5)"}}>→</div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:14,fontWeight:800,color:"#86efac"}}>{inP?.name||"?"}</div>
                          <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{fmtMin(getTotal(autoSubProposal.inId))} played</div>
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <button onClick={()=>handleAssign(autoSubProposal.posIdx,autoSubProposal.inId)}
                        style={{background:"#4ade80",border:"none",color:"#0d1117",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>
                        ✓ Execute
                      </button>
                      <button onClick={()=>{setAutoSubProposal(null);setTab("field");}}
                        style={{background:"rgba(255,255,255,0.15)",border:"none",color:"white",borderRadius:10,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                        Override
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Queued sub hint when no auto-sub */}
              {!autoSubProposal&&subQueue.length>0&&(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"8px 12px",marginTop:8}}>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.85)"}}>
                    Queued: <strong>{roster.find(p=>p.id===subQueue[0].inId)?.name}</strong> → <strong>{roster.find(p=>p.id===subQueue[0].outId)?.name}</strong>
                  </div>
                  <button onClick={()=>executeQueued(subQueue[0])} style={{background:"rgba(255,255,255,0.25)",border:"none",color:"white",padding:"5px 12px",borderRadius:16,fontSize:12,fontWeight:700,cursor:"pointer"}}>Execute</button>
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div style={{padding:"12px 16px",borderBottom:"1px solid #21262d",display:"flex",alignItems:"center",gap:10}}>
            {phase==="field"?(
              <button onClick={startGame} style={{flex:1,padding:"11px 0",background:"#4ade80",border:"none",borderRadius:10,color:"#0d1117",fontSize:15,fontWeight:700,cursor:"pointer"}}>🏁 Start Game</button>
            ):atHalftime?(
              <button onClick={startSecondHalf} style={{flex:1,padding:"11px 0",background:"#4ade80",border:"none",borderRadius:10,color:"#0d1117",fontSize:15,fontWeight:700,cursor:"pointer"}}>▶ 2nd Half</button>
            ):gameOver?(
              <button onClick={resetToSetup} style={{flex:1,padding:"11px 0",background:"#4ade80",border:"none",borderRadius:10,color:"#0d1117",fontSize:15,fontWeight:700,cursor:"pointer"}}>🔄 New Game</button>
            ):(
              <button onClick={()=>setIsRunning(r=>!r)} style={{flex:1,padding:"11px 0",background:isRunning?"#ef4444":"#4ade80",border:"none",borderRadius:10,color:"#0d1117",fontSize:15,fontWeight:700,cursor:"pointer"}}>
                {isRunning?"⏸ Pause":"▶ Resume"}
              </button>
            )}
            {phase==="game"&&!gameOver&&(
              <div style={{textAlign:"center",minWidth:68}}>
                <div style={{fontSize:9,color:"#8b949e",textTransform:"uppercase",letterSpacing:1.5,fontWeight:700}}>Next Sub</div>
                <div style={{fontSize:28,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1.5,lineHeight:1,color:subCountdown<=60?"#f59e0b":subCountdown<=120?"#fb923c":"#4ade80"}}>{fmt(subCountdown)}</div>
              </div>
            )}
            {phase==="game"&&(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <button onClick={()=>setAutoSub(v=>!v)}
                  title={autoSub?"Auto Sub ON — tap to disable":"Auto Sub OFF — tap to enable"}
                  style={{background:autoSub?"#4ade8022":"#21262d",border:`1px solid ${autoSub?"#4ade80":"#30363d"}`,color:autoSub?"#4ade80":"#6b7280",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer",lineHeight:1}}>
                  🤖
                </button>
                <button onClick={()=>setShowStats(true)} style={{background:"#21262d",border:"1px solid #30363d",color:"#e6edf3",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer"}}>📊</button>
                <button onClick={()=>setShowSeason(true)} style={{background:"#21262d",border:"1px solid #30363d",color:"#e6edf3",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer"}}>🏆</button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:"1px solid #21262d"}}>
            {[["field","⚽ Field"],["queue",`📋 Queue${subQueue.length?` (${subQueue.length})`:""}`],["subs","🔄 Subs"]].map(([t,lbl])=>(
              <button key={t} onClick={()=>setTab(t)}
                style={{flex:1,padding:"10px",border:"none",background:tab===t?"#161b22":"transparent",color:tab===t?"#4ade80":"#6b7280",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:1,borderBottom:`2px solid ${tab===t?"#4ade80":"transparent"}`,cursor:"pointer",transition:"color .15s"}}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Field tab */}
          {tab==="field"&&(
            <div style={{padding:"14px 16px 32px"}}>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:10,color:"#8b949e",textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:8}}>Formation · {playerCount} players</div>
                <FormationPicker catalog={catalog} formation={formation} outfieldCount={outfieldCount}
                  onSelect={changeFormation} onDelete={deleteCustomFormation} onAdd={()=>setShowFB(true)} compact/>
              </div>
              <HalfField positions={positions} assigned={assigned} roster={roster} numbers={numbers}
                onTapPos={setPickerPos} alertActive={alertActive} getTotal={getTotal} getStint={getStint} phase={phase}/>
              {/* Legend */}
              <div style={{display:"flex",gap:12,marginTop:12,justifyContent:"center"}}>
                {Object.entries(ROLE_COLOR).map(([role,col])=>(
                  <div key={role} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#6b7280"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:col}}/>{role}
                  </div>
                ))}
              </div>
              {/* Bench */}
              {roster.length>0&&(
                <div style={{marginTop:18}}>
                  <div style={{fontSize:10,color:"#8b949e",textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:10}}>Bench · {bench.length}</div>
                  {bench.length===0
                    ? <div style={{color:"#8b949e",fontSize:13}}>All players on field</div>
                    : <div style={{display:"grid",gap:8}}>
                        {bench.map(p=>{
                          const f=fairness(p.id);
                          return (
                            <div key={p.id} style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,padding:"10px 13px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <div style={{width:9,height:9,borderRadius:"50%",background:fairColor[f],flexShrink:0}}/>
                                <div>
                                  <div style={{fontSize:13,fontWeight:700}}>
                                    {p.name.split(" ")[0]}
                                    {numbers[p.id]&&<span style={{color:"#8b949e",fontSize:11,marginLeft:5}}>#{numbers[p.id]}</span>}
                                  </div>
                                  {phase==="game"&&<div style={{fontSize:10,color:"#8b949e",marginTop:1}}>{fmtMin(getTotal(p.id))} total</div>}
                                </div>
                              </div>
                              {phase==="game"&&f==="low"&&<span style={{fontSize:10,color:"#ef4444",fontWeight:700,background:"rgba(239,68,68,0.1)",padding:"2px 8px",borderRadius:5}}>⚠ Needs time</span>}
                              {phase==="game"&&f==="warn"&&<span style={{fontSize:10,color:"#f59e0b",fontWeight:700,background:"rgba(245,158,11,0.1)",padding:"2px 8px",borderRadius:5}}>Due soon</span>}
                            </div>
                          );
                        })}
                      </div>
                  }
                  <div style={{marginTop:10,fontSize:11,color:"#4b5563",textAlign:"center"}}>Tap any position on the field to assign or swap</div>
                  {phase==="game"&&(
                    <div style={{display:"flex",gap:10,marginTop:10}}>
                      {[["ok","#4ade80","Fair"],["warn","#f59e0b","Due soon"],["low","#ef4444","Needs time"]].map(([k,col,lbl])=>(
                        <div key={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#6b7280"}}><div style={{width:7,height:7,borderRadius:"50%",background:col}}/>{lbl}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Queue tab */}
          {tab==="queue"&&(
            <div style={{padding:"14px 16px"}}>
              <SubQueuePanel queue={subQueue} roster={roster} numbers={numbers} positions={positions}
                assigned={assigned} bench={bench} onAdd={addToQueue} onRemove={removeFromQueue} onExecute={executeQueued}/>
            </div>
          )}

          {/* Subs tab */}
          {tab==="subs"&&(
            <div style={{padding:"16px 16px 32px"}}>
              {subLog.length===0
                ? <div style={{color:"#8b949e",textAlign:"center",padding:"40px 0",fontSize:14}}>No substitutions yet</div>
                : <div style={{display:"grid",gap:8}}>
                    {[...subLog].reverse().map((s,i)=>{
                      const outP=roster.find(p=>p.id===s.outId), inP=roster.find(p=>p.id===s.inId);
                      const hT=s.time<HALF_SECS?s.time:s.time-HALF_SECS;
                      return (
                        <div key={i} style={{background:"#161b22",borderRadius:10,padding:"11px 14px",border:"1px solid #30363d",display:"flex",alignItems:"center",gap:10}}>
                          <div style={{background:ROLE_COLOR[s.role],borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:800,color:"white",flexShrink:0}}>{s.role}</div>
                          <div style={{flex:1,fontSize:13}}>
                            <span style={{color:"#ef4444",fontWeight:700}}>{outP?.name||"?"}</span>
                            <span style={{color:"#4b5563",margin:"0 7px"}}>↔</span>
                            <span style={{color:"#4ade80",fontWeight:700}}>{inP?.name||"?"}</span>
                          </div>
                          <div style={{fontSize:11,color:"#6b7280",flexShrink:0}}>H{s.half} {fmt(hT)}</div>
                        </div>
                      );
                    })}
                  </div>
              }
            </div>
          )}
        </div>
      )}

      {/* ══ STATS ══ */}
      {phase==="game"&&showStats&&!showSeason&&(
        <div style={{padding:"16px 16px 48px",animation:"pageIn .25s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:700}}>Playing Time</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={shareReport} style={{background:"#21262d",border:"1px solid #30363d",color:"#8b949e",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>📤 Share</button>
              <button onClick={()=>setShowStats(false)} style={{background:"#21262d",border:"1px solid #30363d",color:"#8b949e",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>← Back</button>
            </div>
          </div>
          {roster.slice().sort((a,b)=>getTotal(b.id)-getTotal(a.id)).map(p=>{
            const total=getTotal(p.id), s=stats[p.id], live=onField.has(p.id), f=fairness(p.id);
            const pct=Math.min(100,(total/(HALF_SECS*2))*100), stint=getStint(p.id);
            return (
              <div key={p.id} style={{background:"#161b22",borderRadius:12,padding:"12px 14px",border:`1px solid ${live?"#4ade8030":"#21262d"}`,marginBottom:9}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:fairColor[f]}}/>
                    <span style={{fontWeight:700,fontSize:15}}>{p.name}</span>
                    {numbers[p.id]&&<span style={{fontSize:11,color:"#8b949e"}}>#{numbers[p.id]}</span>}
                    {live&&<span style={{fontSize:9,color:"#4ade80",fontWeight:700,letterSpacing:1}}>ON</span>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"'DM Mono',monospace",fontWeight:500,fontSize:18,color:"#4ade80"}}>{fmtMin(total)}</div>
                    {live&&stint>0&&<div style={{fontSize:10,color:"#f59e0b"}}>on {fmtMin(stint)}</div>}
                  </div>
                </div>
                <div style={{background:"#0d1117",borderRadius:4,height:4,overflow:"hidden",marginBottom:8}}>
                  <div style={{background:live?"#4ade80":"#374151",height:"100%",width:`${pct}%`,transition:"width .5s ease",borderRadius:4}}/>
                </div>
                {s&&Object.entries(s.positions).filter(([_,v])=>v>0).length>0&&(
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {Object.entries(s.positions).filter(([_,v])=>v>0).map(([role,sec])=>(
                      <span key={role} style={{background:`${ROLE_COLOR[role]}18`,border:`1px solid ${ROLE_COLOR[role]}44`,borderRadius:6,padding:"2px 9px",fontSize:11,color:ROLE_COLOR[role],fontWeight:700}}>
                        {role} {Math.floor(sec/60)}m
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ SEASON from game ══ */}
      {phase==="game"&&showSeason&&<SeasonView onClose={()=>setShowSeason(false)}/>}

      {showFB&&<FormationBuilder outfieldCount={outfieldCount} onSave={saveCustomFormation} onClose={()=>setShowFB(false)}/>}
      {pickerPos!==null&&<PickerSheet posIdx={pickerPos} positions={positions} assigned={assigned} roster={roster} numbers={numbers} notes={notes}
        getTotal={getTotal} getStint={getStint} onAssign={handleAssign} onClear={handleClear} onClose={()=>setPickerPos(null)} phase={phase}/>}

      {/* ══ INVITE MODAL ══ */}
      {showInviteModal&&inviteCode&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowInviteModal(false)}>
          <div style={{background:"#161b22",borderRadius:20,padding:28,width:"100%",maxWidth:400,border:"1px solid #30363d",animation:"sheetUp .22s ease"}} onClick={e=>e.stopPropagation()}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:40,marginBottom:10}}>👥</div>
              <div style={{fontSize:20,fontWeight:800,marginBottom:6}}>Invite a Coach</div>
              <div style={{fontSize:13,color:"#8b949e",lineHeight:1.6}}>Share this link with your co-coach.<br/>They'll get full access to <strong style={{color:"#e6edf3"}}>{teamName||"your team"}</strong>.</div>
            </div>

            {/* Link display */}
            <div style={{background:"#0d1117",border:"1px solid #30363d",borderRadius:10,padding:"12px 14px",marginBottom:16,fontFamily:"monospace",fontSize:12,color:"#a78bfa",wordBreak:"break-all",textAlign:"center"}}>
              {`${window.location.origin}?invite=${inviteCode}`}
            </div>

            <button onClick={shareInviteLink}
              style={{width:"100%",padding:14,background:"#7c3aed",border:"none",borderRadius:12,color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10}}>
              📤 Share Invite Link
            </button>

            <button onClick={()=>{
              navigator.clipboard?.writeText(`${window.location.origin}?invite=${inviteCode}`).then(()=>alert("Copied!"));
            }} style={{width:"100%",padding:12,background:"#21262d",border:"1px solid #30363d",borderRadius:12,color:"#8b949e",fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:10}}>
              📋 Copy Link
            </button>

            <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:8,padding:"9px 12px",fontSize:11,color:"#f59e0b",textAlign:"center",marginBottom:14}}>
              Anyone with this link gets full access to edit your team
            </div>

            <button onClick={()=>setShowInviteModal(false)}
              style={{width:"100%",padding:12,background:"transparent",border:"1px solid #30363d",borderRadius:12,color:"#8b949e",fontSize:13,cursor:"pointer",fontWeight:600}}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 9 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children, flex }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#4ade80" : "#161b22",
        border: `1px solid ${active ? "#4ade80" : "#30363d"}`,
        color: active ? "#0d1117" : "#8b949e",
        borderRadius: 8,
        padding: "8px 13px",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        flex: flex ? 1 : undefined,
        textAlign: "center",
        transition: "all .15s",
      }}
    >
      {children}
    </button>
  );
}
