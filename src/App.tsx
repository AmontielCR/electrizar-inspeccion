import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════
   USUARIOS
═══════════════════════════════════════════ */
const USUARIOS = [
  { user: "amontiel",  pass: "cubillo26",  nombre: "Ing. Alonso Montiel Cubillo",  matricula: "IE-24011 / CAPDEE-165", rol: "ingeniero" },
  { user: "jrodriguez", pass: "reyes26",   nombre: "Ing. Josué Rodríguez Reyes",   matricula: "",                       rol: "ingeniero" },
  { user: "tecnicos",  pass: "usuario26",  nombre: "Técnico de Campo",              matricula: "",                       rol: "tecnico" },
];

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */
const Y    = "#F5A800";
const DARK = "#111827";
const CO   = {
  nombre: "Electrizar Electromecánica SRL",
  tel: "4001-7246",
  correo: "amontiel@electrizarcr.com",
  dir: "Calle Blancos, Goicoechea, San José, Costa Rica.",
};
const PRIOS = [
  { v:"alta",   L:"Alta",   c:"#dc2626", tw:"bg-red-50 text-red-700 border-red-200" },
  { v:"normal", L:"Normal", c:Y,         tw:"bg-amber-50 text-amber-700 border-amber-200" },
  { v:"baja",   L:"Baja",   c:"#16a34a", tw:"bg-green-50 text-green-700 border-green-200" },
];
const RESS  = ["Aprobada","Condicionada","Rechazada"];
const HOY   = new Date().toISOString().split("T")[0];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */
const sto = {
  get: (k)    => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const processPhoto = (file) =>
  new Promise((res, rej) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1100;
      let w = img.width, h = img.height;
      if (w > max) { h = Math.round(h * max / w); w = max; }
      if (h > max) { w = Math.round(w * max / h); h = max; }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(u);
      const dUrl = c.toDataURL("image/jpeg", 0.82);
      res({ url: dUrl, b64: dUrl.split(",")[1] });
    };
    img.onerror = rej;
    img.src = u;
  });

const callAI = async (b64, titulo) => {
  const r = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type:"image", source:{ type:"base64", media_type:"image/jpeg", data: b64 } },
          { type:"text", text:
`Eres ingeniero eléctrico experto en NEC 2020 (NFPA 70) aplicado en Costa Rica bajo RTCR 458:2011 (D.E. 36979-MEIC).
Analiza la foto de inspección eléctrica titulada: "${titulo}"
Las anotaciones (flechas, círculos, marcas) indican los puntos específicos a evaluar.
Responde SOLO con JSON válido sin texto adicional ni backticks:
{"hallazgos":["hallazgo citando Art. NEC"],"acciones":["acción correctiva"]}
Reglas: cita Art. NEC en cada hallazgo, máximo 5 de cada uno, español técnico.
Sin observaciones → {"hallazgos":["Sin observaciones."],"acciones":["Verificar sellos y fijación en campo."]}` },
        ],
      }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  const txt = (d.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  return JSON.parse(txt);
};

const saveToOneDrive = async (informe) => {
  const r = await fetch("/api/onedrive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ informe }),
  });
  return r.json();
};

const fmtFecha = (iso) => {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d} de ${MESES[+m-1]} de ${y}`;
};

/* ═══════════════════════════════════════════
   ATOMS
═══════════════════════════════════════════ */
const Logo = ({ sm, white }) => (
  <div className="flex items-center gap-2">
    <div className={`${sm?"w-7 h-7":"w-10 h-10"} flex items-center justify-center rounded-md flex-shrink-0`} style={{background:Y}}>
      <svg viewBox="0 0 22 22" className={sm?"w-4 h-4":"w-6 h-6"} fill="white">
        <rect x="2" y="2" width="18" height="3"/>
        <rect x="2" y="8.5" width="11" height="3"/>
        <rect x="2" y="15" width="18" height="3"/>
        <polygon points="14,8.5 18,8.5 15,12.5 19,12.5 12,20 13,13.5 9,13.5"/>
      </svg>
    </div>
    <div>
      <div className={`font-bold leading-tight ${sm?"text-xs":"text-sm"} ${white?"text-white":"text-gray-900"}`}>Electrizar</div>
      <div className={`leading-tight ${sm?"text-[9px]":"text-[10px]"}`} style={{color:Y}}>Constructora Electromecánica</div>
    </div>
  </div>
);

const Badge = ({v}) => { const p=PRIOS.find(x=>x.v===v)||PRIOS[1]; return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.tw}`}>{p.L}</span>; };

const ResBadge = ({v}) => {
  if (!v) return null;
  const cfg = v==="Aprobada"?"bg-green-100 text-green-700":v==="Rechazada"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700";
  return <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg}`}>{v}</span>;
};

const Pill = ({children,active,color,onClick}) => (
  <button onClick={onClick}
    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${active?"text-white":"border-gray-200 text-gray-400 bg-white hover:bg-gray-50"}`}
    style={active?{background:color||Y,borderColor:color||Y}:{}}>{children}</button>
);

const Btn = ({children,onClick,variant="pri",sm,disabled,full,className=""}) => {
  const base=`font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 ${sm?"px-3 py-2 text-sm":"px-5 py-3"} ${full?"w-full":""} ${className}`;
  if (variant==="pri") return <button onClick={onClick} disabled={disabled} className={`${base} ${disabled?"opacity-50 cursor-not-allowed":"hover:opacity-90"}`} style={{background:disabled?"#9ca3af":Y,color:"white"}}>{children}</button>;
  return <button onClick={onClick} disabled={disabled} className={`${base} border-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50 ${disabled?"opacity-50":""}`}>{children}</button>;
};

const Card = ({title,children,accent}) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    {title && <div className="px-4 pt-4 pb-2 flex items-center gap-2">{accent && <div className="w-1 h-4 rounded-full" style={{background:Y}}/>}<h3 className="font-bold text-gray-700 text-xs uppercase tracking-widest">{title}</h3></div>}
    <div className="px-4 pb-4 space-y-3">{children}</div>
  </div>
);

const FI = ({label,value,onChange,...rest}) => (
  <div>
    <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">{label}</label>
    <input value={value} onChange={onChange} className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:border-amber-400 focus:bg-white transition-all" {...rest}/>
  </div>
);

const ListEditor = ({label,items,set,placeholder}) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</label>
      <button onClick={()=>set([...items,""])} className="text-xs font-bold px-2.5 py-1 rounded-lg hover:opacity-80" style={{color:Y,background:Y+"18"}}>+ Agregar</button>
    </div>
    <div className="space-y-2">
      {!items.length && <div className="text-xs text-gray-400 text-center py-4 border-2 border-dashed border-gray-100 rounded-xl">Sin {label.toLowerCase()} — usa IA o toca Agregar</div>}
      {items.map((h,i)=>(
        <div key={i} className="flex gap-2 items-start">
          <textarea value={h} onChange={e=>{const c=[...items];c[i]=e.target.value;set(c);}} rows={2} placeholder={placeholder}
            className="flex-1 border-2 border-gray-100 rounded-xl px-3 py-2 text-sm bg-gray-50 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-all"/>
          <button onClick={()=>set(items.filter((_,j)=>j!==i))} className="mt-1.5 w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all text-base font-bold">×</button>
        </div>
      ))}
    </div>
  </div>
);

/* ═══════════════════════════════════════════
   LOGIN VIEW
═══════════════════════════════════════════ */
function LoginView({onLogin}) {
  const [user,setUser]   = useState("");
  const [pass,setPass]   = useState("");
  const [err,setErr]     = useState(null);
  const [show,setShow]   = useState(false);

  const handle = () => {
    const found = USUARIOS.find(u=>u.user===user.trim()&&u.pass===pass);
    if (!found) { setErr("Usuario o contraseña incorrectos."); return; }
    setErr(null);
    onLogin(found);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{background:DARK}}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-3xl p-6 shadow-2xl"><Logo/></div>
        </div>
        <h1 className="text-white font-extrabold text-2xl text-center mb-1">Inspecciones Eléctricas</h1>
        <p className="text-white/40 text-sm text-center mb-8">Verificación NEC 2020 · Electrizar</p>

        <div className="space-y-3">
          <div>
            <label className="block text-white/50 text-xs font-bold mb-1.5 uppercase tracking-wider">Usuario</label>
            <input value={user} onChange={e=>{setUser(e.target.value);setErr(null);}}
              onKeyDown={e=>e.key==="Enter"&&handle()}
              className="w-full bg-white/10 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-amber-400 transition-all"
              placeholder="amontiel"/>
          </div>
          <div>
            <label className="block text-white/50 text-xs font-bold mb-1.5 uppercase tracking-wider">Contraseña</label>
            <div className="relative">
              <input value={pass} onChange={e=>{setPass(e.target.value);setErr(null);}}
                onKeyDown={e=>e.key==="Enter"&&handle()}
                type={show?"text":"password"}
                className="w-full bg-white/10 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-amber-400 transition-all"
                placeholder="••••••••"/>
              <button onClick={()=>setShow(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs">
                {show?"Ocultar":"Ver"}
              </button>
            </div>
          </div>

          {err && <div className="bg-red-900/40 border border-red-500/40 rounded-xl px-4 py-2.5 text-red-300 text-xs font-medium">⚠️ {err}</div>}

          <button onClick={handle}
            className="w-full py-3.5 rounded-2xl font-extrabold text-gray-900 text-sm hover:opacity-90 active:scale-95 transition-all mt-2"
            style={{background:Y}}>
            Entrar →
          </button>
        </div>

        <p className="text-white/20 text-xs text-center mt-8">
          ☁️ Los informes se guardan en OneDrive
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ANNOTATION EDITOR
═══════════════════════════════════════════ */
function AnnotationEditor({imageUrl,onConfirm,onClose}) {
  const canvasRef=useRef(null);
  const imgRef=useRef(new Image());
  const [tool,setTool]=useState("arrow");
  const [color,setColor]=useState("#ef4444");
  const [shapes,setShapes]=useState([]);
  const [drawing,setDraw]=useState(false);
  const [startPt,setStart]=useState(null);
  const [curPt,setCur]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [textDlg,setTDlg]=useState(null);
  const [textVal,setTVal]=useState("");

  useEffect(()=>{
    const img=imgRef.current;
    img.onload=()=>{const c=canvasRef.current;if(!c)return;c.width=img.naturalWidth;c.height=img.naturalHeight;setLoaded(true);};
    img.src=imageUrl;
  },[imageUrl]);

  const getPos=useCallback((e)=>{
    const c=canvasRef.current;if(!c)return{x:0,y:0};
    const r=c.getBoundingClientRect();const sx=c.width/r.width,sy=c.height/r.height;
    let cx,cy;
    if(e.touches?.length){cx=e.touches[0].clientX;cy=e.touches[0].clientY;}
    else if(e.changedTouches?.length){cx=e.changedTouches[0].clientX;cy=e.changedTouches[0].clientY;}
    else{cx=e.clientX;cy=e.clientY;}
    return{x:(cx-r.left)*sx,y:(cy-r.top)*sy};
  },[]);

  const drawOne=useCallback((ctx,s)=>{
    ctx.save();ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineWidth=4;ctx.lineCap="round";ctx.lineJoin="round";
    if(s.tool==="arrow"){
      const dx=s.x2-s.x1,dy=s.y2-s.y1,len=Math.sqrt(dx*dx+dy*dy);
      if(len<6){ctx.restore();return;}
      const ang=Math.atan2(dy,dx),hl=Math.min(26,len*0.36);
      ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(s.x2,s.y2);
      ctx.lineTo(s.x2-hl*Math.cos(ang-Math.PI/6),s.y2-hl*Math.sin(ang-Math.PI/6));
      ctx.lineTo(s.x2-hl*Math.cos(ang+Math.PI/6),s.y2-hl*Math.sin(ang+Math.PI/6));
      ctx.closePath();ctx.fill();
    } else if(s.tool==="circle"){
      const rx=Math.abs(s.x2-s.x1)/2,ry=Math.abs(s.y2-s.y1)/2;
      ctx.beginPath();ctx.ellipse((s.x1+s.x2)/2,(s.y1+s.y2)/2,Math.max(rx,4),Math.max(ry,4),0,0,2*Math.PI);ctx.stroke();
    } else if(s.tool==="rect"){
      ctx.beginPath();ctx.rect(s.x1,s.y1,s.x2-s.x1,s.y2-s.y1);ctx.stroke();
    } else if(s.tool==="cross"){
      const sz=24;ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(s.x1-sz,s.y1-sz);ctx.lineTo(s.x1+sz,s.y1+sz);ctx.moveTo(s.x1+sz,s.y1-sz);ctx.lineTo(s.x1-sz,s.y1+sz);ctx.stroke();
    } else if(s.tool==="text"){
      const fs=Math.max(18,Math.round((canvasRef.current?.width||900)/20));
      ctx.font=`bold ${fs}px sans-serif`;ctx.strokeStyle="rgba(0,0,0,0.6)";ctx.lineWidth=3;
      ctx.strokeText(s.text,s.x1,s.y1);ctx.fillStyle=s.color;ctx.fillText(s.text,s.x1,s.y1);
    }
    ctx.restore();
  },[]);

  const redraw=useCallback(()=>{
    const c=canvasRef.current;if(!c||!loaded)return;
    const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(imgRef.current,0,0,c.width,c.height);
    shapes.forEach(s=>drawOne(ctx,s));
    if(drawing&&startPt&&curPt&&tool!=="text"&&tool!=="cross")
      drawOne(ctx,{tool,color,x1:startPt.x,y1:startPt.y,x2:curPt.x,y2:curPt.y});
  },[loaded,shapes,drawing,startPt,curPt,tool,color,drawOne]);

  useEffect(()=>{redraw();},[redraw]);

  const onDown=useCallback((e)=>{
    if(e.cancelable)e.preventDefault();const pos=getPos(e);
    if(tool==="cross"){setShapes(p=>[...p,{tool:"cross",color,x1:pos.x,y1:pos.y}]);return;}
    if(tool==="text"){setTDlg(pos);setTVal("");return;}
    setDraw(true);setStart(pos);setCur(pos);
  },[tool,color,getPos]);

  const onMove=useCallback((e)=>{if(!drawing)return;if(e.cancelable)e.preventDefault();setCur(getPos(e));},[drawing,getPos]);
  const onUp=useCallback((e)=>{
    if(!drawing||!startPt)return;if(e.cancelable)e.preventDefault();
    const end=curPt||getPos(e);
    setShapes(p=>[...p,{tool,color,x1:startPt.x,y1:startPt.y,x2:end.x,y2:end.y}]);
    setDraw(false);setStart(null);setCur(null);
  },[drawing,startPt,curPt,tool,color,getPos]);

  const addText=()=>{
    if(textVal.trim()&&textDlg)setShapes(p=>[...p,{tool:"text",color,x1:textDlg.x,y1:textDlg.y,text:textVal.trim()}]);
    setTDlg(null);setTVal("");
  };

  const doConfirm=()=>{const c=canvasRef.current;if(!c)return;const dUrl=c.toDataURL("image/jpeg",0.88);onConfirm(dUrl,dUrl.split(",")[1]);};

  const TOOLS=[{id:"arrow",icon:"↗",L:"Flecha"},{id:"circle",icon:"○",L:"Círculo"},{id:"rect",icon:"□",L:"Rect."},{id:"cross",icon:"✕",L:"Cruz"},{id:"text",icon:"T",L:"Texto"}];
  const COLS=["#ef4444","#F5A800","#ffffff","#22c55e","#3b82f6","#000000"];

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none">
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0" style={{background:DARK}}>
        <button onClick={onClose} className="text-white/50 hover:text-white text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-white/10">✕ Cancelar</button>
        <span className="font-bold text-white text-sm">✏️ Anotaciones</span>
        <button onClick={doConfirm} className="px-4 py-1.5 rounded-xl font-bold text-sm text-gray-900" style={{background:Y}}>✓ Confirmar</button>
      </div>
      <div className="flex-1 overflow-hidden flex items-center justify-center bg-black relative">
        {!loaded&&<div className="flex flex-col items-center gap-3 text-white/50"><div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"/><span className="text-sm">Cargando…</span></div>}
        <canvas ref={canvasRef} className="max-w-full max-h-full touch-none" style={{display:loaded?"block":"none",cursor:"crosshair"}}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}/>
        {textDlg&&(
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 p-4">
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <p className="text-sm font-bold text-gray-800 mb-3">✏️ Texto para la anotación</p>
              <input autoFocus value={textVal} onChange={e=>setTVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addText()}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 mb-4" placeholder="Ej: Sin conductor de tierra…"/>
              <div className="flex gap-2">
                <button onClick={()=>{setTDlg(null);setTVal("");}} className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-500">Cancelar</button>
                <button onClick={addText} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{background:Y}}>Agregar →</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0 px-3 pt-2.5 pb-3 space-y-2.5" style={{background:DARK}}>
        <div className="flex items-center gap-1.5">
          {TOOLS.map(t=>(
            <button key={t.id} onClick={()=>setTool(t.id)}
              className={`flex-1 py-2 rounded-xl flex flex-col items-center gap-0.5 text-xs font-bold border-2 transition-all ${tool===t.id?"border-transparent text-gray-900":"border-white/10 text-white/50 hover:text-white"}`}
              style={tool===t.id?{background:Y}:{}}>
              <span className="text-sm leading-none">{t.icon}</span><span className="text-[9px]">{t.L}</span>
            </button>
          ))}
          <div className="w-px h-10 bg-white/10 mx-0.5"/>
          <button onClick={()=>setShapes(p=>p.slice(0,-1))} className="px-2.5 py-2 rounded-xl border-2 border-white/10 text-white/50 hover:text-white flex flex-col items-center"><span className="text-sm">↩</span><span className="text-[9px] text-white/40">Undo</span></button>
          <button onClick={()=>{if(confirm("¿Borrar anotaciones?"))setShapes([]);}} className="px-2.5 py-2 rounded-xl border-2 border-white/10 text-white/50 hover:text-red-400 flex flex-col items-center"><span className="text-sm">🗑️</span><span className="text-[9px] text-white/40">Clear</span></button>
        </div>
        <div className="flex items-center justify-center gap-3 pb-1">
          <span className="text-white/30 text-[11px] mr-1">Color:</span>
          {COLS.map(c=>(
            <button key={c} onClick={()=>setColor(c)} className="transition-all active:scale-90"
              style={{width:26,height:26,borderRadius:"50%",background:c,outline:color===c?`3px solid ${Y}`:"3px solid transparent",outlineOffset:2,border:c==="#ffffff"?"2px solid rgba(255,255,255,0.25)":"none"}}/>
          ))}
          <div className="w-6 h-6 rounded-full ml-1 border-2 border-white/30"><div className="w-full h-full rounded-full" style={{background:color}}/></div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FINALIZAR MODAL
═══════════════════════════════════════════ */
function FinalizarModal({informe,onConfirm,onClose}) {
  const alta  =(informe.elementos||[]).filter(e=>e.prioridad==="alta").length;
  const normal=(informe.elementos||[]).filter(e=>e.prioridad==="normal").length;
  const baja  =(informe.elementos||[]).filter(e=>e.prioridad==="baja").length;
  const total =informe.elementos?.length||0;
  const suggested=alta>0?"Rechazada":normal>0?"Condicionada":"Aprobada";
  const [resultado,setRes]=useState(informe.resultado||suggested);
  const [plazo,setPlazo]=useState(informe.plazo||"12 meses");
  const [notas,setNotas]=useState(informe.notas||"");
  const [saving,setSaving]=useState(false);
  const [odStatus,setOdStatus]=useState(null); // null | "ok" | "error"

  const RES_CONFIG={
    "Aprobada"    :{color:"#16a34a",bg:"#f0fdf4",desc:"Instalación cumple con los requisitos normativos."},
    "Condicionada":{color:Y,        bg:"#fffbeb",desc:"Requiere correcciones en el plazo establecido."},
    "Rechazada"   :{color:"#dc2626",bg:"#fef2f2",desc:"No conformidades críticas que impiden la aprobación."},
  };
  const cfg=RES_CONFIG[resultado];

  const handleConfirm=async()=>{
    setSaving(true);
    const data={resultado,plazo,notas};
    // Guardar en OneDrive
    try {
      const updated={...informe,...data};
      const r=await saveToOneDrive(updated);
      setOdStatus(r.ok?"ok":"error");
      if(r.ok) console.log("OneDrive folder:", r.folder);
    } catch(e) {
      console.warn("OneDrive:", e);
      setOdStatus("error");
    }
    setSaving(false);
    onConfirm(data);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" style={{maxHeight:"95vh"}}>
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-lg font-extrabold text-gray-900">🏁 Finalizar Inspección</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-gray-600 hover:bg-gray-100 font-bold text-lg">✕</button>
          </div>
          <p className="text-xs text-gray-400">Código: <span className="font-mono font-bold text-gray-600">{informe.codigo}</span> · {informe.propietario}</p>
        </div>
        <div className="overflow-y-auto p-5 space-y-5 pb-6">
          {/* Resumen */}
          <div className="rounded-2xl border-2 border-gray-100 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100"><p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Resumen de la inspección</p></div>
            <div className="grid grid-cols-4 divide-x divide-gray-100">
              {[["Total",total,"text-gray-800"],["Alta",alta,"text-red-500"],["Normal",normal,"text-amber-500"],["Baja",baja,"text-green-500"]].map(([l,n,cl])=>(
                <div key={l} className="px-3 py-3 text-center"><div className={`text-xl font-extrabold ${cl}`}>{n}</div><div className="text-[10px] text-gray-400 mt-0.5">{l}</div></div>
              ))}
            </div>
          </div>

          {/* Sugerencia */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border-2" style={{borderColor:cfg.color+"40",background:cfg.bg}}>
            <span className="text-lg mt-0.5">💡</span>
            <div>
              <p className="text-xs font-bold" style={{color:cfg.color}}>Resultado sugerido: {suggested}</p>
              <p className="text-xs mt-0.5" style={{color:cfg.color+"cc"}}>{cfg.desc}</p>
            </div>
          </div>

          {/* Selector resultado */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Resultado de la Verificación *</label>
            <div className="space-y-2.5">
              {RESS.map(r=>{
                const c=RES_CONFIG[r];const active=resultado===r;
                return (
                  <button key={r} onClick={()=>setRes(r)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all"
                    style={{borderColor:active?c.color:"#e5e7eb",background:active?c.bg:"white"}}>
                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{borderColor:active?c.color:"#d1d5db",background:active?c.color:"white"}}>
                      {active&&<div className="w-2 h-2 rounded-full bg-white"/>}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm" style={{color:active?c.color:"#374151"}}>{r}</p>
                      <p className="text-xs mt-0.5" style={{color:active?c.color+"aa":"#9ca3af"}}>{c.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plazo */}
          {resultado!=="Aprobada"&&(
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Plazo para mejoras</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {["3 meses","6 meses","12 meses","18 meses","24 meses"].map(p=>(
                  <button key={p} onClick={()=>setPlazo(p)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all"
                    style={{borderColor:plazo===p?Y:"#e5e7eb",background:plazo===p?Y+"15":"white",color:plazo===p?Y:"#6b7280"}}>{p}</button>
                ))}
              </div>
              <FI label="" value={plazo} onChange={e=>setPlazo(e.target.value)} placeholder="Ej: 12 meses"/>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Notas adicionales</label>
            <textarea value={notas} onChange={e=>setNotas(e.target.value)} rows={3}
              placeholder="Ej: Requiere sistema de iluminación de emergencia en salida principal."
              className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm bg-gray-50 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-all"/>
          </div>

          {/* OneDrive info */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
            <span>☁️</span>
            <p className="text-xs text-blue-700 font-medium">
              Las fotos y datos se guardarán en OneDrive → <span className="font-mono">Electrizar-Reportes/{informe.codigo}-...</span>
            </p>
          </div>

          <button onClick={handleConfirm} disabled={saving}
            className="w-full py-4 rounded-2xl font-extrabold text-white text-base hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
            style={{background:resultado==="Aprobada"?"#16a34a":resultado==="Rechazada"?"#dc2626":Y}}>
            {saving?"⏳ Guardando en OneDrive…":`Generar Reporte ${resultado} →`}
          </button>
          <p className="text-center text-xs text-gray-400">Podrás editar el resultado antes de imprimir el PDF.</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HOME
═══════════════════════════════════════════ */
function HomeView({informes,onNew,onOpen,usuario,onLogout}) {
  const sorted=[...informes].reverse();
  return (
    <div className="min-h-screen" style={{background:"#f8f9fb"}}>
      <header style={{background:DARK}} className="px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <Logo white/>
          <div className="flex items-center gap-2">
            <div className="text-right mr-1 hidden sm:block">
              <div className="text-white text-xs font-bold leading-tight">{usuario.nombre}</div>
              <button onClick={onLogout} className="text-white/40 hover:text-white/70 text-[10px] transition-colors">Cerrar sesión</button>
            </div>
            <button onClick={onLogout} className="sm:hidden text-white/40 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10">↩</button>
            <button onClick={onNew}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm text-gray-900 hover:opacity-90 active:scale-95"
              style={{background:Y}}>
              <span className="text-base leading-none">+</span> Nuevo
            </button>
          </div>
        </div>
      </header>
      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4 mt-1">
          <h2 className="font-bold text-gray-400 text-xs uppercase tracking-widest">Informes ({informes.length})</h2>
          <span className="text-xs text-gray-300">☁️ OneDrive activo</span>
        </div>
        {!sorted.length?(
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl" style={{background:Y+"22"}}>⚡</div>
            <p className="text-gray-400 mb-6 text-sm">No hay informes guardados aún.</p>
            <Btn onClick={onNew}>Crear primer informe</Btn>
          </div>
        ):(
          <div className="space-y-3">
            {sorted.map(inf=>{
              const alta=(inf.elementos||[]).filter(e=>e.prioridad==="alta").length;
              return (
                <div key={inf.id} onClick={()=>onOpen(inf)}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:shadow-md active:bg-gray-50 transition-all">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-mono text-[11px] text-gray-300 tracking-wider">{inf.codigo}</div>
                        {!inf.resultado&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 border border-blue-100">En curso</span>}
                      </div>
                      <div className="font-bold text-gray-800 truncate mt-0.5 text-sm">{inf.propietario||"Sin nombre"}</div>
                      <div className="text-xs text-gray-400 truncate mt-0.5">{inf.direccion}</div>
                    </div>
                    <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                      <ResBadge v={inf.resultado}/>
                      <div className="text-[11px] text-gray-300">{inf.fecha}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400">
                    <span>📷 <b className="text-gray-600">{inf.elementos?.length||0}</b> elementos</span>
                    {alta>0&&<span className="font-bold text-red-400">🔴 {alta} alta prioridad</span>}
                    <span className="ml-auto text-gray-300">→</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   NUEVO INFORME
═══════════════════════════════════════════ */
function NuevoView({onCreate,onBack,usuario}) {
  const [f,setF]=useState({
    codigo:"",propietario:"",direccion:"",fecha:HOY,
    ingeniero:usuario.nombre,matricula:usuario.matricula,
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const go=()=>{
    if(!f.codigo.trim())return alert("El código de informe es requerido.\nEjemplo: INF-26-055");
    if(!f.propietario.trim())return alert("El nombre del propietario es requerido.");
    onCreate({...f,id:Date.now(),elementos:[],resultado:null,plazo:"12 meses",notas:"",createdAt:new Date().toISOString()});
  };
  return (
    <div className="min-h-screen" style={{background:"#f8f9fb"}}>
      <header style={{background:DARK}} className="px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={onBack} className="text-white/60 hover:text-white text-xl transition-colors">←</button>
          <Logo sm white/><span className="font-bold text-white text-sm ml-1">Nuevo Informe</span>
        </div>
      </header>
      <div className="p-4 max-w-lg mx-auto space-y-3 pb-24">
        <Card title="Identificación" accent>
          <FI label="Código *" value={f.codigo} onChange={e=>s("codigo",e.target.value)} placeholder="INF-26-055"/>
          <FI label="Fecha *" value={f.fecha} onChange={e=>s("fecha",e.target.value)} type="date"/>
        </Card>
        <Card title="Datos del Proyecto" accent>
          <FI label="Propietario / Cliente *" value={f.propietario} onChange={e=>s("propietario",e.target.value)} placeholder="Nombre completo…"/>
          <FI label="Dirección" value={f.direccion} onChange={e=>s("direccion",e.target.value)} placeholder="San José, Montes de Oca…"/>
        </Card>
        <Card title="Responsable de Verificación" accent>
          <FI label="Nombre del Ingeniero" value={f.ingeniero} onChange={e=>s("ingeniero",e.target.value)} placeholder="Ing. Nombre Apellido"/>
          <FI label="Matrícula" value={f.matricula} onChange={e=>s("matricula",e.target.value)} placeholder="IE-XXXXX / CAPDEE-XXX"/>
        </Card>
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl border-2" style={{borderColor:Y+"40",background:Y+"0f"}}>
          <span className="text-lg mt-0.5">💡</span>
          <p className="text-xs leading-relaxed" style={{color:"#92400e"}}>
            El <b>resultado de la verificación</b> se asigna al finalizar la inspección. Las fotos se guardarán automáticamente en <b>OneDrive</b>.
          </p>
        </div>
        <Btn onClick={go} full>Iniciar Inspección →</Btn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   INSPECCIÓN ACTIVA
═══════════════════════════════════════════ */
function InspeccionView({informe,onUpdate,onBack,onFinalize,onPreview}) {
  const [modal,setModal]=useState(false);
  const [editIdx,setEditIdx]=useState(null);
  const [finalM,setFinalM]=useState(false);

  const saveEl=(el)=>{
    const els=[...(informe.elementos||[])];
    if(editIdx!==null)els[editIdx]={...el,num:editIdx+1};
    else els.push({...el,num:els.length+1});
    onUpdate({...informe,elementos:els});setModal(false);
  };
  const delEl=(i)=>{
    if(!confirm("¿Eliminar este elemento?"))return;
    const els=informe.elementos.filter((_,j)=>j!==i).map((e,j)=>({...e,num:j+1}));
    onUpdate({...informe,elementos:els});
  };
  const handleFinalize=(data)=>{onFinalize(data);setFinalM(false);};
  const alta=(informe.elementos||[]).filter(e=>e.prioridad==="alta").length;
  const total=informe.elementos?.length||0;

  return (
    <div className="min-h-screen" style={{background:"#f8f9fb"}}>
      <header style={{background:DARK}} className="px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={onBack} className="text-white/60 hover:text-white text-xl transition-colors">←</button>
            <Logo sm white/>
          </div>
          <div className="flex items-start justify-between ml-1">
            <div>
              <div className="font-mono text-[11px] text-white/40 tracking-wider">{informe.codigo}</div>
              <div className="font-bold text-white text-sm">{informe.propietario}</div>
            </div>
            <div className="flex items-center gap-2">
              {informe.resultado&&<ResBadge v={informe.resultado}/>}
              {informe.resultado&&<Btn onClick={onPreview} sm variant="out">📄 PDF</Btn>}
            </div>
          </div>
        </div>
      </header>
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="max-w-2xl mx-auto flex gap-5 text-xs">
          <span className="text-gray-500">📷 <b className="text-gray-700">{total}</b> elementos</span>
          <span className="text-gray-500">📅 {informe.fecha}</span>
          {alta>0&&<span className="font-bold text-red-500">🔴 {alta} alta prioridad</span>}
          {!informe.resultado&&<span className="text-blue-500 font-bold ml-auto">● En curso</span>}
        </div>
      </div>
      <div className="p-4 max-w-2xl mx-auto pb-36 space-y-3">
        {!total?(
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl" style={{background:Y+"22"}}>📷</div>
            <p className="text-gray-400 text-sm">Toca el botón <b style={{color:Y}}>+</b> para agregar el primer elemento</p>
          </div>
        ):(
          informe.elementos.map((el,i)=>(
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex gap-3 p-3">
                {el.url?<img src={el.url} alt={el.titulo} className="w-20 h-20 object-cover rounded-xl shrink-0"/>:<div className="w-20 h-20 bg-gray-100 rounded-xl shrink-0 flex items-center justify-center text-2xl">📷</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[10px] text-gray-300">({el.num})</span>
                    <Badge v={el.prioridad}/>
                  </div>
                  <div className="font-bold text-sm text-gray-800 leading-snug">{el.titulo}</div>
                  <div className="text-xs text-gray-400 mt-1">{el.hallazgos?.length||0} hallazgos · {el.acciones?.length||0} acciones</div>
                </div>
              </div>
              <div className="flex border-t border-gray-50 divide-x divide-gray-50 text-xs">
                <button onClick={()=>{setEditIdx(i);setModal(true);}} className="flex-1 py-2.5 text-gray-500 hover:bg-gray-50 font-semibold transition-colors">✏️ Editar</button>
                <button onClick={()=>delEl(i)} className="flex-1 py-2.5 text-red-400 hover:bg-red-50 font-semibold transition-colors">🗑️ Eliminar</button>
              </div>
            </div>
          ))
        )}

        {/* Finalizar card */}
        <div className={`rounded-2xl border-2 overflow-hidden ${informe.resultado?"border-green-200 bg-green-50":"border-dashed border-gray-200 bg-white"}`}>
          <div className="p-4">
            {informe.resultado?(
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-green-700 text-sm">✅ Inspección finalizada</p>
                  <p className="text-xs text-green-600 mt-0.5">Resultado: <b>{informe.resultado}</b> · Plazo: {informe.plazo}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>setFinalM(true)} className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-green-200 text-green-700 hover:bg-green-100">Editar</button>
                  <button onClick={onPreview} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white hover:opacity-90" style={{background:"#16a34a"}}>📄 PDF</button>
                </div>
              </div>
            ):(
              <div>
                <p className="font-bold text-gray-500 text-sm mb-1">¿Terminaste de fotografiar?</p>
                <p className="text-xs text-gray-400 mb-4">Al finalizar se asignará el resultado y las fotos se subirán a OneDrive.</p>
                <button onClick={()=>{if(total===0){alert("Agrega al menos un elemento antes de finalizar.");return;}setFinalM(true);}}
                  className="w-full py-3.5 rounded-xl font-extrabold text-white text-sm hover:opacity-90 active:scale-95 transition-all"
                  style={{background:DARK}}>
                  🏁 Finalizar Inspección y Asignar Resultado
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <button onClick={()=>{setEditIdx(null);setModal(true);}}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-2xl text-white text-3xl flex items-center justify-center z-20 active:scale-90 hover:opacity-90 transition-all"
        style={{background:Y}}>+</button>

      {modal&&<ElementoModal el={editIdx!==null?informe.elementos[editIdx]:null} num={editIdx!==null?editIdx+1:(informe.elementos?.length||0)+1} onSave={saveEl} onClose={()=>setModal(false)}/>}
      {finalM&&<FinalizarModal informe={informe} onConfirm={handleFinalize} onClose={()=>setFinalM(false)}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   ELEMENTO MODAL
═══════════════════════════════════════════ */
function ElementoModal({el,num,onSave,onClose}) {
  const [titulo,setT]=useState(el?.titulo||"");
  const [url,setUrl]=useState(el?.url||null);
  const [b64,setB64]=useState(el?.b64||null);
  const [H,setH]=useState(el?.hallazgos||[]);
  const [A,setA]=useState(el?.acciones||[]);
  const [prio,setP]=useState(el?.prioridad||"normal");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState(null);
  const [annot,setAnn]=useState(null);
  const fRef=useRef();

  const onPhoto=async(e)=>{const f=e.target.files[0];if(!f)return;setErr(null);try{const{url:u}=await processPhoto(f);setAnn(u);}catch{setErr("Error al procesar la imagen.");}};
  const onAnnotConfirm=(finalUrl,finalB64)=>{setUrl(finalUrl);setB64(finalB64);setAnn(null);if(titulo.trim())analyze(finalB64);else setErr("Foto guardada. Escribe el título y toca Analizar IA.");};
  const analyze=async(b=b64)=>{
    if(!b){setErr("Primero adjunta una fotografía.");return;}
    if(!titulo.trim()){setErr("Escribe el título antes de analizar.");return;}
    setBusy(true);setErr(null);
    try{const r=await callAI(b,titulo.trim());setH(r.hallazgos||[]);setA(r.acciones||[]);}
    catch(e){setErr("Error IA: "+e.message);}
    finally{setBusy(false);}
  };
  const save=()=>{if(!titulo.trim()){setErr("El título del elemento es requerido.");return;}onSave({titulo:titulo.trim(),url,b64,hallazgos:H,acciones:A,prioridad:prio,num});};

  if(annot)return <AnnotationEditor imageUrl={annot} onConfirm={onAnnotConfirm} onClose={()=>setAnn(null)}/>;

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" style={{maxHeight:"93vh"}}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 font-bold text-lg">✕</button>
          <span className="font-bold text-gray-800">Elemento <span className="font-mono text-gray-400">#{num}</span></span>
          <Btn onClick={save} sm>Guardar ✓</Btn>
        </div>
        <div className="overflow-y-auto p-4 space-y-4 pb-6">
          <FI label="Título del Elemento *" value={titulo} onChange={e=>{setT(e.target.value);setErr(null);}} placeholder="Ej: Centro de carga principal"/>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Fotografía</label>
            {url?(
              <div>
                <img src={url} alt="preview" className="w-full max-h-56 object-cover rounded-2xl border-2 border-gray-100"/>
                <div className="grid grid-cols-3 gap-2 mt-2.5">
                  <button onClick={()=>fRef.current.click()} className="py-2.5 border-2 border-gray-100 rounded-xl text-xs text-gray-500 font-bold hover:bg-gray-50">📷 Nueva</button>
                  <button onClick={()=>setAnn(url)} className="py-2.5 border-2 rounded-xl text-xs font-bold hover:opacity-80" style={{borderColor:Y,color:Y,background:Y+"12"}}>✏️ Anotar</button>
                  <button onClick={()=>analyze()} disabled={busy||!titulo.trim()} className="py-2.5 rounded-xl text-xs text-white font-bold disabled:opacity-50" style={{background:DARK}}>{busy?"⏳…":"🤖 IA NEC"}</button>
                </div>
              </div>
            ):(
              <button onClick={()=>fRef.current.click()} className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-12 text-center hover:border-amber-400 hover:bg-amber-50 transition-all active:scale-95">
                <div className="text-4xl mb-2">📷</div>
                <div className="text-sm font-semibold text-gray-400">Toca para tomar o seleccionar foto</div>
                <div className="text-xs text-gray-300 mt-1">Editor de anotaciones → Análisis IA con NEC 2020</div>
              </button>
            )}
            <input ref={fRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto}/>
          </div>
          {busy&&<div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{background:Y+"15"}}><div className="w-5 h-5 rounded-full border-2 animate-spin" style={{borderColor:Y,borderTopColor:"transparent"}}/><span className="text-sm font-bold" style={{color:Y}}>Analizando con NEC 2020…</span></div>}
          {err&&<div className="bg-red-50 border-2 border-red-100 rounded-2xl p-3 text-xs text-red-600 font-medium">⚠️ {err}</div>}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Prioridad</label>
            <div className="flex gap-2">{PRIOS.map(p=><Pill key={p.v} active={prio===p.v} color={p.c} onClick={()=>setP(p.v)}>{p.L}</Pill>)}</div>
          </div>
          <ListEditor label="Hallazgos" items={H} set={setH} placeholder="Hallazgo con artículo NEC 2020…"/>
          <ListEditor label="Acciones Requeridas" items={A} set={setA} placeholder="Acción correctiva específica…"/>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PREVIEW
═══════════════════════════════════════════ */
const RPage=({children,page,total,nEl})=>(
  <div className="rp bg-white rounded-2xl shadow-md overflow-hidden" style={{minHeight:"21cm"}}>
    <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b-2 border-gray-100">
      <Logo sm/>
      <div className="text-right text-[10px] text-gray-500 space-y-0.5">
        <div><b>Empresa:</b> {CO.nombre} &nbsp;|&nbsp; <b>N.º de elementos:</b> {nEl}</div>
        <div><b>Teléfono:</b> {CO.tel} &nbsp;|&nbsp; <b>Correo:</b> {CO.correo}</div>
        <div><b>Dirección:</b> {CO.dir}</div>
      </div>
    </div>
    <div className="mx-5 border-b border-gray-200 mb-1"/>
    <div className="px-5 py-3">{children}</div>
    <div className="flex items-center justify-between px-5 py-3 border-t-2 border-gray-100 mt-4">
      <Logo sm/><span className="text-xs text-gray-400 font-mono">página {page} de {total}</span>
    </div>
  </div>
);

function PreviewView({informe,onBack}) {
  const nEl=informe.elementos?.length||0;const total=nEl+2;
  return (
    <>
      <style>{`@media print{.no-print{display:none!important}body{background:white!important;margin:0}.rp{page-break-after:always;box-shadow:none!important;border-radius:0!important;margin:0!important;border:none!important;max-width:100%!important}.rp:last-child{page-break-after:avoid}}`}</style>
      <div className="min-h-screen" style={{background:"#e5e7eb"}}>
        <div className="no-print px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm" style={{background:DARK}}>
          <button onClick={onBack} className="text-white/60 hover:text-white text-sm transition-colors">← Volver</button>
          <Logo sm white/>
          <button onClick={()=>window.print()} className="px-4 py-2 rounded-xl font-bold text-sm text-gray-900 hover:opacity-90 active:scale-95" style={{background:Y}}>🖨️ PDF</button>
        </div>
        <div className="py-6 px-3 max-w-3xl mx-auto space-y-4">
          <RPage page={1} total={total} nEl={nEl}>
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-5 text-5xl" style={{background:Y+"22"}}>⚡</div>
              <h1 className="text-xl font-extrabold text-gray-900 mb-3 leading-snug max-w-md">{informe.codigo} — Informe Verificación Eléctrica</h1>
              <p className="text-gray-400 text-sm mb-6 max-w-sm">Informe fotográfico con resumen de hallazgos y acciones requeridas para la Verificación Eléctrica.</p>
              <div className="text-sm text-gray-700 space-y-1.5 text-left w-full max-w-xs">
                <div><b>Propietario:</b> {informe.propietario}</div>
                <div><b>Dirección:</b> {informe.direccion}</div>
                <div><b>Fecha:</b> {fmtFecha(informe.fecha)}</div>
                <div><b>Versión:</b> 0.1V</div>
                {informe.ingeniero&&<div><b>Responsable:</b> {informe.ingeniero}. {informe.matricula}.</div>}
              </div>
            </div>
          </RPage>
          <RPage page={2} total={total} nEl={nEl}>
            <h2 className="font-extrabold text-gray-800 mb-3">Análisis y Limitaciones del presente informe fotográfico:</h2>
            <p className="text-xs text-gray-600 leading-relaxed mb-2">El presente informe fotográfico documenta las no conformidades identificadas durante la verificación visual de las instalaciones eléctricas, conforme al artículo 5.2 del Reglamento de Oficialización del Código Eléctrico de Costa Rica (RTCR 458:2011), Decreto Ejecutivo N.° 36979-MEIC y sus reformas. La evaluación se fundamenta en el Anexo B para condiciones de "Peligro Inminente" o "Alto Riesgo", complementada con las referencias del Código Eléctrico NFPA 70 (NEC), edición 2020.</p>
            <p className="text-xs text-gray-600 leading-relaxed">Los hallazgos se sustentan en la evidencia visible al momento de la inspección. Durante la ejecución de reparaciones, toda condición adicional que represente incumplimiento normativo deberá ser corregida, aun cuando no haya sido señalada individualmente.</p>
          </RPage>
          {(informe.elementos||[]).map((el,i)=>(
            <RPage key={i} page={i+3} total={total} nEl={nEl}>
              <div className="flex gap-5">
                {el.url?<img src={el.url} alt={el.titulo} className="w-52 h-48 object-cover rounded-2xl border border-gray-200 shrink-0"/>:<div className="w-52 h-48 bg-gray-100 rounded-2xl shrink-0 flex items-center justify-center text-4xl">📷</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="font-bold text-gray-900 text-sm">Título: {el.titulo}</span>
                    <Badge v={el.prioridad}/>
                  </div>
                  <p className="font-bold text-xs text-gray-700 mb-1">Hallazgos:</p>
                  {(el.hallazgos||[]).map((h,j)=><p key={j} className="text-xs text-gray-700 leading-relaxed">-{h}</p>)}
                  <p className="font-bold text-xs text-gray-700 mt-3 mb-1">Acciones requeridas:</p>
                  {(el.acciones||[]).map((a,j)=><p key={j} className="text-xs text-gray-700 leading-relaxed">-{a}</p>)}
                </div>
              </div>
              <div className="text-right text-[10px] text-gray-400 mt-2">({el.num})</div>
            </RPage>
          ))}
          <RPage page={total} total={total} nEl={nEl}>
            <h2 className="text-base font-extrabold text-gray-800 mb-5">Final de Reporte</h2>
            <div className="text-sm text-gray-700 space-y-2">
              <div><b>Resultado de verificación:</b> {informe.resultado}.</div>
              <div><b>Plazo para ejecución de mejoras:</b> {informe.plazo}.</div>
              {informe.notas&&<div className="mt-1"><b>Notas adicionales:</b><div className="whitespace-pre-wrap mt-0.5">{informe.notas}</div></div>}
            </div>
            {informe.ingeniero&&(
              <div className="mt-16">
                <div className="w-56 border-b-2 border-gray-300 mb-2"/>
                <div className="text-sm text-gray-700"><div className="font-bold">{informe.ingeniero}</div><div>{informe.matricula}</div></div>
              </div>
            )}
          </RPage>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   ROOT
═══════════════════════════════════════════ */
export default function App() {
  const [view,  setV]     = useState("login");
  const [usuario,setUsr]  = useState(()=>sto.get("e_usr")||null);
  const [informes,setI]   = useState(()=>sto.get("e_infs")||[]);
  const [active, setAct]  = useState(null);

  useEffect(()=>{ if(usuario)setV("home"); },[]);

  const persist=(list)=>{ setI(list); sto.set("e_infs",list); };
  const login=(u)=>{ sto.set("e_usr",u); setUsr(u); setV("home"); };
  const logout=()=>{ sto.set("e_usr",null); setUsr(null); setV("login"); };
  const create=(data)=>{ persist([...informes,data]); setAct(data); setV("insp"); };
  const update=(inf)=>{ const l=informes.map(i=>i.id===inf.id?inf:i); persist(l); setAct(inf); };
  const open=(inf)=>{ setAct(inf); setV("insp"); };
  const finalize=(data)=>{ const inf={...active,...data}; update(inf); setAct(inf); setV("prev"); };

  if(view==="login")  return <LoginView onLogin={login}/>;
  if(view==="home")   return <HomeView informes={informes} onNew={()=>setV("nuevo")} onOpen={open} usuario={usuario} onLogout={logout}/>;
  if(view==="nuevo")  return <NuevoView onCreate={create} onBack={()=>setV("home")} usuario={usuario}/>;
  if(view==="insp")   return <InspeccionView informe={active} onUpdate={update} onBack={()=>setV("home")} onFinalize={finalize} onPreview={()=>setV("prev")}/>;
  if(view==="prev")   return <PreviewView informe={active} onBack={()=>setV("insp")}/>;
}
