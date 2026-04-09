import { useState, useRef, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc, setDoc,
  onSnapshot, query, orderBy, deleteDoc, serverTimestamp,
} from "firebase/firestore";

/* ═══════════════════════════════════════════
   FIREBASE
═══════════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyBpZ_ZK8o6kopoPwp1goAbLXWzja2NuCiA",
  authDomain: "electrizar-inspecciones.firebaseapp.com",
  projectId: "electrizar-inspecciones",
  storageBucket: "electrizar-inspecciones.firebasestorage.app",
  messagingSenderId: "664280211024",
  appId: "1:664280211024:web:41da18e05445ab15af3b55",
};
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

const saveInformeFS  = async (inf) => { await setDoc(doc(db,"informes",String(inf.id)),{...inf,updatedAt:serverTimestamp()}); };
const deleteInformeFS = async (id)  => { await deleteDoc(doc(db,"informes",String(id))); };

/* ═══════════════════════════════════════════
   USUARIOS
═══════════════════════════════════════════ */
const USUARIOS = [
  { user:"amontiel",   pass:"cubillo26", nombre:"Ing. Alonso Montiel Cubillo", matricula:"IE-24011 / CAPDEE-165", rol:"ingeniero" },
  { user:"jrodriguez", pass:"reyes26",   nombre:"Ing. Josué Rodríguez Reyes",  matricula:"",                      rol:"ingeniero" },
  { user:"tecnicos",   pass:"usuario26", nombre:"Técnico de Campo",             matricula:"",                      rol:"tecnico"   },
];

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */
const Y    = "#F5A800";
const DARK = "#111827";
const CO   = { nombre:"Electrizar Electromecánica SRL", tel:"4001-7246", correo:"amontiel@electrizarcr.com", dir:"Calle Blancos, Goicoechea, San José, Costa Rica." };
const PRIOS = [
  { v:"alta",   L:"Alta",   c:"#dc2626", tw:"bg-red-50 text-red-700 border-red-200" },
  { v:"normal", L:"Normal", c:Y,         tw:"bg-amber-50 text-amber-700 border-amber-200" },
  { v:"baja",   L:"Baja",   c:"#16a34a", tw:"bg-green-50 text-green-700 border-green-200" },
];
const RESULTADOS_VERIFICACION = ["Aprobada","Condicionada","Rechazada"];
const RESULTADOS_INSPECCION   = ["Aprobada","No Aprobada"];

/* 4 fotos fijas por equipo AC */
const AC_FOTOS = [
  { key:"evaporadora",    label:"Unidad Evaporadora",                  icon:"❄️",  hint:"Foto de la unidad evaporadora" },
  { key:"condensadora",   label:"Condensadora siendo lavada",           icon:"💧",  hint:"Foto durante el lavado de la condensadora" },
  { key:"presiones",      label:"Presiones de la condensadora",         icon:"🔵",  hint:"Foto del manómetro con las presiones" },
  { key:"placa",          label:"Placa y amperaje de la condensadora",  icon:"⚡",  hint:"Foto de la placa de datos y medición de amperaje" },
];

const HOY   = new Date().toISOString().split("T")[0];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */
const lsto = {
  get: (k)    => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const processPhoto = (file) =>
  new Promise((res, rej) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => {
      const max = 900; let w = img.width, h = img.height;
      if (w > max) { h = Math.round(h*max/w); w = max; }
      if (h > max) { w = Math.round(w*max/h); h = max; }
      const c = document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h); URL.revokeObjectURL(u);
      const dUrl = c.toDataURL("image/jpeg", 0.72);
      res({ url: dUrl, b64: dUrl.split(",")[1] });
    };
    img.onerror = rej; img.src = u;
  });

const callAI = async (b64, titulo) => {
  const r = await fetch("/api/analyze", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ b64, titulo }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  if (!Array.isArray(d.hallazgos)) throw new Error("Respuesta inesperada de la IA");
  return d;
};

const fmtFecha = (iso) => {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d} de ${MESES[+m-1]} de ${y}`;
};

/* ═══════════════════════════════════════════
   PDF — VERIFICACIÓN / INSPECCIÓN ELÉCTRICA
═══════════════════════════════════════════ */
const generatePDFElectrico = (informe) => {
  const nEl = informe.elementos?.length || 0;
  const totalPags = nEl + 3;
  const tipoLabel = informe.tipo === "inspeccion" ? "Inspección" : "Verificación";

  const css = `
    @page { size: letter landscape; margin: 0; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:Arial,Helvetica,sans-serif; font-size:9pt; color:#222; background:white; }
    .pg { width:216mm; min-height:279mm; padding:14mm 16mm 12mm 16mm; page-break-after:always; display:flex; flex-direction:column; }
    .pg:last-child { page-break-after:avoid; }
    .hdr { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:8px; border-bottom:2px solid #e5e7eb; margin-bottom:4px; }
    .logo-wrap { display:flex; align-items:center; gap:7px; }
    .logo-box { width:30px; height:30px; background:#F5A800; border-radius:5px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .logo-name { font-weight:900; font-size:11.5pt; line-height:1.2; color:#111; }
    .logo-sub  { font-size:7.5pt; color:#F5A800; font-weight:600; }
    .hdr-info  { text-align:right; font-size:7.5pt; color:#555; line-height:1.7; }
    .hdr-div   { border-top:1px solid #d1d5db; margin-bottom:10px; }
    .ftr { margin-top:auto; padding-top:8px; border-top:2px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; }
    .ftr-pg { font-size:7.5pt; color:#9ca3af; }
    .cover-body { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:20px 0; }
    .cover-icon { font-size:48pt; margin-bottom:20px; }
    .cover-title { font-size:18pt; font-weight:900; color:#111; margin-bottom:10px; line-height:1.3; max-width:420px; }
    .cover-sub { font-size:9pt; color:#555; margin-bottom:20px; max-width:380px; line-height:1.6; }
    .cover-info { text-align:left; font-size:9.5pt; line-height:1.9; color:#333; }
    .lim-body { flex:1; }
    .lim-body h2 { font-size:12pt; font-weight:900; margin-bottom:12px; }
    .lim-body p  { font-size:8.5pt; line-height:1.65; color:#444; margin-bottom:10px; }
    .el-body { flex:1; display:flex; gap:18px; }
    .el-photo { width:210px; height:210px; object-fit:cover; border-radius:8px; border:1px solid #e5e7eb; display:block; }
    .el-photo-empty { width:210px; height:210px; background:#f3f4f6; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:36pt; color:#d1d5db; }
    .el-num { font-size:7.5pt; color:#9ca3af; margin-top:6px; text-align:right; }
    .el-text { flex:1; min-width:0; }
    .el-title-row { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
    .el-title { font-weight:900; font-size:10.5pt; color:#111; }
    .badge { font-size:7.5pt; font-weight:700; padding:2px 9px; border-radius:20px; border:1px solid; display:inline-block; }
    .b-alta   { background:#fef2f2; color:#dc2626; border-color:#fecaca; }
    .b-normal { background:#fffbeb; color:#d97706; border-color:#fde68a; }
    .b-baja   { background:#f0fdf4; color:#16a34a; border-color:#bbf7d0; }
    .sec-lbl { font-weight:700; font-size:8.5pt; color:#374151; margin-top:8px; margin-bottom:3px; }
    .item-line { font-size:8.5pt; color:#444; line-height:1.6; }
    .close-body { flex:1; }
    .close-body h2 { font-size:13pt; font-weight:900; margin-bottom:14px; }
    .close-row { font-size:10pt; line-height:2.1; color:#333; }
    .sig-line { border-bottom:2px solid #aaa; width:220px; margin-top:50px; margin-bottom:8px; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  `;

  const svgLogo = `<svg viewBox="0 0 22 22" width="18" height="18" fill="white"><rect x="2" y="2" width="18" height="3"/><rect x="2" y="8.5" width="11" height="3"/><rect x="2" y="15" width="18" height="3"/><polygon points="14,8.5 18,8.5 15,12.5 19,12.5 12,20 13,13.5 9,13.5"/></svg>`;
  const logoW = `<div class="logo-wrap"><div class="logo-box">${svgLogo}</div><div><div class="logo-name">Electrizar</div><div class="logo-sub">Constructora Electromecánica</div></div></div>`;
  const hdr = `<div class="hdr">${logoW}<div class="hdr-info"><b>Empresa:</b> ${CO.nombre} &nbsp;&nbsp; <b>Dirección:</b> ${CO.dir}<br/><b>Teléfono:</b> ${CO.tel} &nbsp;&nbsp; <b>N.º de elementos:</b> ${nEl}<br/><b>Correo electrónico:</b> ${CO.correo}</div></div><div class="hdr-div"></div>`;
  const ftr  = (p,t) => `<div class="ftr">${logoW}<div class="ftr-pg">página ${p} de ${t}</div></div>`;

  const portada = `<div class="pg">${hdr}<div class="cover-body"><div class="cover-icon">⚡</div><div class="cover-title">${informe.codigo} — Informe ${tipoLabel} Eléctrica</div><div class="cover-sub">Informe fotográfico con resumen de hallazgos y acciones requeridas para la ${tipoLabel} Eléctrica.</div><div class="cover-info"><div><b>Propietario:</b> ${informe.propietario}</div><div><b>Dirección:</b> ${informe.direccion||"—"}</div><div><b>Fecha:</b> ${fmtFecha(informe.fecha)}</div><div><b>Versión:</b> 0.1V</div>${informe.ingeniero?`<div><b>Responsable:</b> ${informe.ingeniero}${informe.matricula?". "+informe.matricula+".":""}</div>`:""}</div></div>${ftr(1,totalPags)}</div>`;

  const limitaciones = `<div class="pg">${hdr}<div class="lim-body"><h2>Análisis y Limitaciones del presente informe fotográfico:</h2><p>El presente informe fotográfico documenta las no conformidades identificadas durante la verificación visual de las instalaciones eléctricas, conforme a los criterios establecidos en el artículo 5.2 del Reglamento de Oficialización del Código Eléctrico de Costa Rica para la Seguridad de la Vida y de la Propiedad (RTCR 458:2011), Decreto Ejecutivo N.° 36979-MEIC y sus reformas. La evaluación se realiza con base en las disposiciones aplicables del Anexo B para condiciones de "Peligro Inminente" o "Alto Riesgo", complementadas con las referencias técnicas correspondientes del Código Eléctrico NFPA 70 (NEC), edición 2020.</p><p>Los hallazgos consignados en este documento se sustentan en la evidencia visible recopilada al momento de la inspección y deben interpretarse como una referencia técnica de las condiciones observadas, no como una delimitación absoluta del alcance correctivo.</p><p>Para efectos de la presente verificación, no se contó con planos eléctricos actualizados y debidamente inscritos ante el CFIA. En razón de ello, el presente informe se fundamenta principalmente en la inspección visual y en la evidencia fotográfica disponible.</p></div>${ftr(2,totalPags)}</div>`;

  const elementos = (informe.elementos||[]).map((el,i)=>{
    const bc=el.prioridad==="alta"?"b-alta":el.prioridad==="baja"?"b-baja":"b-normal";
    const bl=el.prioridad==="alta"?"Alta":el.prioridad==="baja"?"Baja":"Normal";
    const img=el.url?`<img class="el-photo" src="${el.url}" alt="${el.titulo}"/>`:`<div class="el-photo-empty">📷</div>`;
    const hh=(el.hallazgos||[]).map(h=>`<div class="item-line">-${h}</div>`).join("")||`<div class="item-line" style="color:#aaa">Sin hallazgos.</div>`;
    const aa=(el.acciones||[]).map(a=>`<div class="item-line">-${a}</div>`).join("")||`<div class="item-line" style="color:#aaa">Sin acciones.</div>`;
    return `<div class="pg">${hdr}<div class="el-body"><div style="flex-shrink:0">${img}<div class="el-num">(${el.num})</div></div><div class="el-text"><div class="el-title-row"><span class="el-title">Título: ${el.titulo}</span><span class="badge ${bc}">${bl}</span></div><div class="sec-lbl">Hallazgos:</div>${hh}<div class="sec-lbl">Acciones requeridas:</div>${aa}</div></div>${ftr(i+3,totalPags)}</div>`;
  }).join("");

  const plazoH = informe.tipo!=="inspeccion"&&informe.plazo&&informe.plazo!=="N/A" ? `<div><b>Plazo para ejecución de mejoras:</b> ${informe.plazo}.</div>`:"";
  const notasH = informe.notas ? `<div><b>Notas adicionales:</b><br/>${informe.notas}</div>`:"";
  const cierre = `<div class="pg">${hdr}<div class="close-body"><h2>Final de Reporte</h2><div class="close-row"><div><b>Resultado de ${tipoLabel.toLowerCase()}:</b> ${informe.resultado}.</div>${plazoH}${notasH}</div>${informe.ingeniero?`<div class="sig-line"></div><div style="font-size:10pt;font-weight:700;">${informe.ingeniero}</div><div style="font-size:9pt;color:#555;">${informe.matricula||""}</div>`:""}</div>${ftr(totalPags,totalPags)}</div>`;

  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>${informe.codigo}</title><style>${css}</style></head><body>${portada}${limitaciones}${elementos}${cierre}</body></html>`;
  const w=window.open("","_blank");
  if(!w){alert("Permite ventanas emergentes para generar el PDF.");return;}
  w.document.write(html); w.document.close();
  w.onload=()=>{w.focus();setTimeout(()=>w.print(),500);};
};

/* ═══════════════════════════════════════════
   PDF — MANTENIMIENTO AIRES ACONDICIONADOS
═══════════════════════════════════════════ */
const generatePDFAC = (informe) => {
  const equipos = informe.equipos || [];
  const nEq = equipos.length;
  const totalPags = nEq + 2; // portada + resumen general + equipos

  const css = `
    @page { size: letter landscape; margin: 0; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:Arial,Helvetica,sans-serif; font-size:9pt; color:#222; background:white; }
    .pg { width:216mm; min-height:279mm; padding:14mm 16mm 12mm 16mm; page-break-after:always; display:flex; flex-direction:column; }
    .pg:last-child { page-break-after:avoid; }
    .hdr { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:8px; border-bottom:2px solid #e5e7eb; margin-bottom:4px; }
    .logo-wrap { display:flex; align-items:center; gap:7px; }
    .logo-box { width:30px; height:30px; background:#F5A800; border-radius:5px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .logo-name { font-weight:900; font-size:11.5pt; line-height:1.2; color:#111; }
    .logo-sub  { font-size:7.5pt; color:#F5A800; font-weight:600; }
    .hdr-info  { text-align:right; font-size:7.5pt; color:#555; line-height:1.7; }
    .hdr-div   { border-top:1px solid #d1d5db; margin-bottom:10px; }
    .ftr { margin-top:auto; padding-top:8px; border-top:2px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; }
    .ftr-pg { font-size:7.5pt; color:#9ca3af; }
    /* PORTADA */
    .cover-body { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:20px 0; }
    .cover-icon { font-size:48pt; margin-bottom:20px; }
    .cover-title { font-size:18pt; font-weight:900; color:#111; margin-bottom:10px; line-height:1.3; max-width:420px; }
    .cover-sub { font-size:9pt; color:#555; margin-bottom:20px; max-width:380px; line-height:1.6; }
    .cover-info { text-align:left; font-size:9.5pt; line-height:1.9; color:#333; }
    /* RESUMEN */
    .res-table { width:100%; border-collapse:collapse; margin-top:12px; }
    .res-table th { background:#F5A800; color:white; font-size:8.5pt; font-weight:700; padding:7px 10px; text-align:left; }
    .res-table td { font-size:8.5pt; padding:6px 10px; border-bottom:1px solid #f3f4f6; vertical-align:middle; }
    .res-table tr:nth-child(even) td { background:#fafafa; }
    .badge-ap { background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:2px 10px; border-radius:20px; font-size:7.5pt; font-weight:700; display:inline-block; }
    .badge-no { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:2px 10px; border-radius:20px; font-size:7.5pt; font-weight:700; display:inline-block; }
    /* EQUIPO PAGE */
    .eq-title { font-size:12pt; font-weight:900; color:#111; margin-bottom:4px; }
    .eq-result-row { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
    .eq-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
    .eq-foto-box { display:flex; flex-direction:column; gap:4px; }
    .eq-foto-lbl { font-size:7.5pt; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:0.04em; }
    .eq-foto { width:100%; height:140px; object-fit:cover; border-radius:6px; border:1px solid #e5e7eb; display:block; }
    .eq-foto-empty { width:100%; height:140px; background:#f3f4f6; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:24pt; color:#d1d5db; }
    .sec-lbl { font-weight:700; font-size:8.5pt; color:#374151; margin-bottom:3px; margin-top:8px; }
    .item-line { font-size:8.5pt; color:#444; line-height:1.6; }
    /* RESUMEN FINAL */
    .summary-row { display:flex; gap:20px; margin-top:16px; }
    .sum-box { flex:1; border:2px solid #e5e7eb; border-radius:8px; padding:12px; text-align:center; }
    .sum-num { font-size:22pt; font-weight:900; }
    .sum-lbl { font-size:8pt; color:#666; margin-top:2px; }
    .sig-line { border-bottom:2px solid #aaa; width:220px; margin-top:40px; margin-bottom:8px; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  `;

  const svgLogo = `<svg viewBox="0 0 22 22" width="18" height="18" fill="white"><rect x="2" y="2" width="18" height="3"/><rect x="2" y="8.5" width="11" height="3"/><rect x="2" y="15" width="18" height="3"/><polygon points="14,8.5 18,8.5 15,12.5 19,12.5 12,20 13,13.5 9,13.5"/></svg>`;
  const logoW = `<div class="logo-wrap"><div class="logo-box">${svgLogo}</div><div><div class="logo-name">Electrizar</div><div class="logo-sub">Constructora Electromecánica</div></div></div>`;
  const hdr = `<div class="hdr">${logoW}<div class="hdr-info"><b>Empresa:</b> ${CO.nombre} &nbsp;&nbsp; <b>Dirección:</b> ${CO.dir}<br/><b>Teléfono:</b> ${CO.tel} &nbsp;&nbsp; <b>N.º de elementos:</b> ${nEq}<br/><b>Correo electrónico:</b> ${CO.correo}</div></div><div class="hdr-div"></div>`;
  const ftr  = (p,t) => `<div class="ftr">${logoW}<div class="ftr-pg">página ${p} de ${t}</div></div>`;

  // Portada
  const portada = `<div class="pg">${hdr}
    <div class="cover-body">
      <div class="cover-icon">🌡️</div>
      <div class="cover-title">${informe.codigo} — Mantenimiento de Aires Acondicionados</div>
      <div class="cover-sub">Informe trimestral de mantenimiento preventivo para los equipos de aire acondicionado.</div>
      <div class="cover-info">
        <div><b>Cliente:</b> ${informe.propietario}</div>
        <div><b>Dirección:</b> ${informe.direccion||"—"}</div>
        <div><b>Fecha:</b> ${fmtFecha(informe.fecha)}</div>
        <div><b>Versión:</b> 0.1V</div>
        ${informe.tecnico?`<div><b>Técnico responsable:</b> ${informe.tecnico}</div>`:""}
      </div>
    </div>
    ${ftr(1,totalPags)}</div>`;

  // Resumen general
  const aprobados = equipos.filter(e=>e.resultado==="Aprobado").length;
  const noAprobados = equipos.filter(e=>e.resultado==="No Aprobado").length;
  const filas = equipos.map((eq,i)=>`
    <tr>
      <td style="font-weight:700">(${i+1})</td>
      <td>${eq.nombre}</td>
      <td>${eq.ubicacion||"—"}</td>
      <td><span class="${eq.resultado==="Aprobado"?"badge-ap":"badge-no"}">${eq.resultado||"Pendiente"}</span></td>
    </tr>`).join("");

  const resumen = `<div class="pg">${hdr}
    <div style="flex:1">
      <div style="font-size:13pt;font-weight:900;margin-bottom:16px;">Resumen General</div>
      <div style="font-size:9pt;color:#555;margin-bottom:12px;">
        Mantenimiento preventivo realizado el ${fmtFecha(informe.fecha)} por ${informe.tecnico||"técnico de campo"}.
        Se revisaron <b>${nEq} equipos</b> de aire acondicionado.
      </div>
      <table class="res-table">
        <thead><tr><th>#</th><th>Equipo</th><th>Ubicación</th><th>Resultado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="summary-row">
        <div class="sum-box"><div class="sum-num" style="color:#111">${nEq}</div><div class="sum-lbl">Total equipos</div></div>
        <div class="sum-box"><div class="sum-num" style="color:#16a34a">${aprobados}</div><div class="sum-lbl">Aprobados</div></div>
        <div class="sum-box"><div class="sum-num" style="color:#dc2626">${noAprobados}</div><div class="sum-lbl">No Aprobados</div></div>
      </div>
    </div>
    ${ftr(2,totalPags)}</div>`;

  // Una página por equipo
  const equiposPags = equipos.map((eq,i)=>{
    const fotoHTML = (key) => {
      const f = eq.fotos?.[key];
      return f
        ? `<img class="eq-foto" src="${f}" alt="${key}"/>`
        : `<div class="eq-foto-empty">📷</div>`;
    };
    const acHTML = (eq.acciones||[]).map(a=>`<div class="item-line">-${a}</div>`).join("")||
      `<div class="item-line" style="color:#aaa">Sin acciones reportadas.</div>`;
    const obsHTML = eq.observaciones
      ? `<div class="sec-lbl">Observaciones:</div><div class="item-line">${eq.observaciones}</div>` : "";

    return `<div class="pg">${hdr}
      <div style="flex:1;display:flex;flex-direction:column;gap:10px;">
        <div class="eq-result-row">
          <div class="eq-title">(${i+1}) ${eq.nombre}</div>
          <span class="${eq.resultado==="Aprobado"?"badge-ap":"badge-no"}">${eq.resultado||"Pendiente"}</span>
          ${eq.ubicacion?`<span style="font-size:8pt;color:#888">📍 ${eq.ubicacion}</span>`:""}
        </div>
        <div class="eq-grid">
          ${AC_FOTOS.map(f=>`
            <div class="eq-foto-box">
              <div class="eq-foto-lbl">${f.icon} ${f.label}</div>
              ${fotoHTML(f.key)}
            </div>`).join("")}
        </div>
        ${eq.resultado==="No Aprobado"?`<div class="sec-lbl">Acciones realizadas / requeridas:</div>${acHTML}`:""}
        ${obsHTML}
      </div>
      ${ftr(i+3,totalPags)}</div>`;
  }).join("");

  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>${informe.codigo}</title><style>${css}</style></head><body>${portada}${resumen}${equiposPags}</body></html>`;
  const w=window.open("","_blank");
  if(!w){alert("Permite ventanas emergentes para generar el PDF.");return;}
  w.document.write(html); w.document.close();
  w.onload=()=>{w.focus();setTimeout(()=>w.print(),500);};
};

/* ═══════════════════════════════════════════
   ATOMS
═══════════════════════════════════════════ */
const Logo = ({sm,white}) => (
  <div className="flex items-center gap-2">
    <div className={`${sm?"w-7 h-7":"w-10 h-10"} flex items-center justify-center rounded-md flex-shrink-0`} style={{background:Y}}>
      <svg viewBox="0 0 22 22" className={sm?"w-4 h-4":"w-6 h-6"} fill="white">
        <rect x="2" y="2" width="18" height="3"/><rect x="2" y="8.5" width="11" height="3"/>
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
  const cfg=v==="Aprobada"||v==="Aprobado"?"bg-green-100 text-green-700":v==="Condicionada"?"bg-amber-100 text-amber-700":"bg-red-100 text-red-700";
  return <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg}`}>{v}</span>;
};
const Pill = ({children,active,color,onClick}) => (
  <button onClick={onClick} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${active?"text-white":"border-gray-200 text-gray-400 bg-white hover:bg-gray-50"}`}
    style={active?{background:color||Y,borderColor:color||Y}:{}}>{children}</button>
);
const Btn = ({children,onClick,variant="pri",sm,disabled,full,className=""}) => {
  const base=`font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 ${sm?"px-3 py-2 text-sm":"px-5 py-3"} ${full?"w-full":""} ${className}`;
  if(variant==="pri") return <button onClick={onClick} disabled={disabled} className={`${base} ${disabled?"opacity-50 cursor-not-allowed":"hover:opacity-90"}`} style={{background:disabled?"#9ca3af":Y,color:"white"}}>{children}</button>;
  return <button onClick={onClick} disabled={disabled} className={`${base} border-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50 ${disabled?"opacity-50":""}`}>{children}</button>;
};
const Card = ({title,children,accent}) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    {title&&<div className="px-4 pt-4 pb-2 flex items-center gap-2">{accent&&<div className="w-1 h-4 rounded-full" style={{background:Y}}/>}<h3 className="font-bold text-gray-700 text-xs uppercase tracking-widest">{title}</h3></div>}
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
      {!items.length&&<div className="text-xs text-gray-400 text-center py-3 border-2 border-dashed border-gray-100 rounded-xl">Sin {label.toLowerCase()} — toca Agregar</div>}
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
   DELETE MODAL
═══════════════════════════════════════════ */
function DeleteModal({informe,onConfirm,onClose}) {
  const [loading,setLoad]=useState(false);
  const handle=async()=>{setLoad(true);await deleteInformeFS(informe.id);onConfirm();};
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center text-2xl mx-auto mb-4">🗑️</div>
        <h3 className="font-extrabold text-gray-900 text-lg text-center mb-1">¿Eliminar informe?</h3>
        <p className="text-sm text-gray-500 text-center mb-2"><span className="font-mono font-bold text-gray-700">{informe.codigo}</span></p>
        <p className="text-xs text-gray-400 text-center mb-6">{informe.propietario} · {informe.fecha}<br/><span className="text-red-400 font-semibold">Esta acción no se puede deshacer.</span></p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handle} disabled={loading} className="flex-1 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-60" style={{background:"#dc2626"}}>{loading?"Eliminando…":"Sí, eliminar"}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   LOGIN
═══════════════════════════════════════════ */
function LoginView({onLogin}) {
  const [user,setU]=useState(""); const [pass,setP]=useState(""); const [err,setE]=useState(null); const [show,setSh]=useState(false);
  const handle=()=>{const f=USUARIOS.find(u=>u.user===user.trim()&&u.pass===pass);if(!f){setE("Usuario o contraseña incorrectos.");return;}onLogin(f);};
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{background:DARK}}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><div className="bg-white rounded-3xl p-6 shadow-2xl"><Logo/></div></div>
        <h1 className="text-white font-extrabold text-2xl text-center mb-1">Electrizar</h1>
        <p className="text-white/40 text-sm text-center mb-8">Sistema de Informes Técnicos</p>
        <div className="space-y-3">
          <div><label className="block text-white/50 text-xs font-bold mb-1.5 uppercase tracking-wider">Usuario</label>
            <input value={user} onChange={e=>{setU(e.target.value);setE(null);}} onKeyDown={e=>e.key==="Enter"&&handle()}
              className="w-full bg-white/10 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-amber-400 transition-all" placeholder="amontiel"/></div>
          <div><label className="block text-white/50 text-xs font-bold mb-1.5 uppercase tracking-wider">Contraseña</label>
            <div className="relative">
              <input value={pass} onChange={e=>{setP(e.target.value);setE(null);}} onKeyDown={e=>e.key==="Enter"&&handle()} type={show?"text":"password"}
                className="w-full bg-white/10 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-amber-400 transition-all" placeholder="••••••••"/>
              <button onClick={()=>setSh(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs">{show?"Ocultar":"Ver"}</button>
            </div></div>
          {err&&<div className="bg-red-900/40 border border-red-500/40 rounded-xl px-4 py-2.5 text-red-300 text-xs font-medium">⚠️ {err}</div>}
          <button onClick={handle} className="w-full py-3.5 rounded-2xl font-extrabold text-gray-900 text-sm hover:opacity-90 active:scale-95 transition-all mt-2" style={{background:Y}}>Entrar →</button>
        </div>
        <p className="text-white/20 text-xs text-center mt-8">☁️ Sincronizado en todos los dispositivos</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SELECTOR DE TIPO
═══════════════════════════════════════════ */
function TipoSelectorView({onSelect,usuario,onLogout}) {
  return (
    <div className="min-h-screen flex flex-col" style={{background:DARK}}>
      <header className="px-4 py-4 flex items-center justify-between">
        <Logo white/>
        <div className="text-right">
          <div className="text-white text-xs font-bold">{usuario.nombre}</div>
          <button onClick={onLogout} className="text-white/40 hover:text-white/70 text-[10px]">Cerrar sesión</button>
        </div>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <h2 className="text-white font-extrabold text-xl text-center mb-2">¿Qué vas a realizar?</h2>
        <p className="text-white/40 text-sm text-center mb-8">Selecciona el tipo de trabajo</p>
        <div className="w-full max-w-sm space-y-3">
          {/* Verificación */}
          <button onClick={()=>onSelect("verificacion")} className="w-full bg-white rounded-2xl p-5 text-left hover:bg-gray-50 active:scale-95 transition-all shadow-xl">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{background:Y+"22"}}>🔍</div>
              <div>
                <div className="font-extrabold text-gray-900 text-base mb-0.5">Verificación Eléctrica</div>
                <div className="text-xs text-gray-500 leading-relaxed">Resultado: <b>Aprobada</b>, <b>Condicionada</b> o <b>Rechazada</b>. Incluye plazo de mejoras.</div>
                <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:Y}}>RTCR 458:2011 · NEC 2020</div>
              </div>
            </div>
          </button>
          {/* Inspección */}
          <button onClick={()=>onSelect("inspeccion")} className="w-full rounded-2xl p-5 text-left hover:opacity-90 active:scale-95 transition-all shadow-xl border-2" style={{background:DARK,borderColor:Y+"60"}}>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{background:Y+"30"}}>⚡</div>
              <div>
                <div className="font-extrabold text-white text-base mb-0.5">Inspección Eléctrica</div>
                <div className="text-xs text-white/60 leading-relaxed">Resultado: <b className="text-white/80">Aprobada</b> o <b className="text-white/80">No Aprobada</b>. Sin plazo de mejoras.</div>
                <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:Y}}>NEC 2020</div>
              </div>
            </div>
          </button>
          {/* Aires Acondicionados */}
          <button onClick={()=>onSelect("ac")} className="w-full rounded-2xl p-5 text-left hover:opacity-90 active:scale-95 transition-all shadow-xl border-2" style={{background:"#0c4a6e",borderColor:"#38bdf8aa"}}>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{background:"#38bdf822"}}>🌡️</div>
              <div>
                <div className="font-extrabold text-white text-base mb-0.5">Mantenimiento de Aires</div>
                <div className="text-xs text-white/60 leading-relaxed">Mantenimiento preventivo de equipos de aire acondicionado. 4 fotos por equipo. Resultado por unidad.</div>
                <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:"#38bdf8"}}>PREVENTIVO · CORRECTIVO</div>
              </div>
            </div>
          </button>
          {/* Ver informes */}
          <button onClick={()=>onSelect("home")} className="w-full py-3 rounded-xl font-bold text-sm text-white/50 hover:text-white/80 transition-colors">
            📋 Ver informes existentes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ANNOTATION EDITOR
═══════════════════════════════════════════ */
function AnnotationEditor({imageUrl,onConfirm,onClose}) {
  const canvasRef=useRef(null);const imgRef=useRef(new Image());
  const [tool,setTool]=useState("arrow");const [color,setColor]=useState("#ef4444");
  const [shapes,setShapes]=useState([]);const [drawing,setDraw]=useState(false);
  const [startPt,setStart]=useState(null);const [curPt,setCur]=useState(null);
  const [loaded,setLoaded]=useState(false);const [textDlg,setTDlg]=useState(null);const [textVal,setTVal]=useState("");
  useEffect(()=>{const img=imgRef.current;img.onload=()=>{const c=canvasRef.current;if(!c)return;c.width=img.naturalWidth;c.height=img.naturalHeight;setLoaded(true);};img.src=imageUrl;},[imageUrl]);
  const getPos=useCallback((e)=>{const c=canvasRef.current;if(!c)return{x:0,y:0};const r=c.getBoundingClientRect();const sx=c.width/r.width,sy=c.height/r.height;let cx,cy;if(e.touches?.length){cx=e.touches[0].clientX;cy=e.touches[0].clientY;}else if(e.changedTouches?.length){cx=e.changedTouches[0].clientX;cy=e.changedTouches[0].clientY;}else{cx=e.clientX;cy=e.clientY;}return{x:(cx-r.left)*sx,y:(cy-r.top)*sy};},[]);
  const drawOne=useCallback((ctx,s)=>{ctx.save();ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineWidth=4;ctx.lineCap="round";ctx.lineJoin="round";if(s.tool==="arrow"){const dx=s.x2-s.x1,dy=s.y2-s.y1,len=Math.sqrt(dx*dx+dy*dy);if(len<6){ctx.restore();return;}const ang=Math.atan2(dy,dx),hl=Math.min(26,len*0.36);ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();ctx.beginPath();ctx.moveTo(s.x2,s.y2);ctx.lineTo(s.x2-hl*Math.cos(ang-Math.PI/6),s.y2-hl*Math.sin(ang-Math.PI/6));ctx.lineTo(s.x2-hl*Math.cos(ang+Math.PI/6),s.y2-hl*Math.sin(ang+Math.PI/6));ctx.closePath();ctx.fill();}else if(s.tool==="circle"){const rx=Math.abs(s.x2-s.x1)/2,ry=Math.abs(s.y2-s.y1)/2;ctx.beginPath();ctx.ellipse((s.x1+s.x2)/2,(s.y1+s.y2)/2,Math.max(rx,4),Math.max(ry,4),0,0,2*Math.PI);ctx.stroke();}else if(s.tool==="rect"){ctx.beginPath();ctx.rect(s.x1,s.y1,s.x2-s.x1,s.y2-s.y1);ctx.stroke();}else if(s.tool==="cross"){const sz=24;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(s.x1-sz,s.y1-sz);ctx.lineTo(s.x1+sz,s.y1+sz);ctx.moveTo(s.x1+sz,s.y1-sz);ctx.lineTo(s.x1-sz,s.y1+sz);ctx.stroke();}else if(s.tool==="text"){const fs=Math.max(18,Math.round((canvasRef.current?.width||900)/20));ctx.font=`bold ${fs}px sans-serif`;ctx.strokeStyle="rgba(0,0,0,0.6)";ctx.lineWidth=3;ctx.strokeText(s.text,s.x1,s.y1);ctx.fillStyle=s.color;ctx.fillText(s.text,s.x1,s.y1);}ctx.restore();},[]);
  const redraw=useCallback(()=>{const c=canvasRef.current;if(!c||!loaded)return;const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(imgRef.current,0,0,c.width,c.height);shapes.forEach(s=>drawOne(ctx,s));if(drawing&&startPt&&curPt&&tool!=="text"&&tool!=="cross")drawOne(ctx,{tool,color,x1:startPt.x,y1:startPt.y,x2:curPt.x,y2:curPt.y});},[loaded,shapes,drawing,startPt,curPt,tool,color,drawOne]);
  useEffect(()=>{redraw();},[redraw]);
  const onDown=useCallback((e)=>{if(e.cancelable)e.preventDefault();const pos=getPos(e);if(tool==="cross"){setShapes(p=>[...p,{tool:"cross",color,x1:pos.x,y1:pos.y}]);return;}if(tool==="text"){setTDlg(pos);setTVal("");return;}setDraw(true);setStart(pos);setCur(pos);},[tool,color,getPos]);
  const onMove=useCallback((e)=>{if(!drawing)return;if(e.cancelable)e.preventDefault();setCur(getPos(e));},[drawing,getPos]);
  const onUp=useCallback((e)=>{if(!drawing||!startPt)return;if(e.cancelable)e.preventDefault();const end=curPt||getPos(e);setShapes(p=>[...p,{tool,color,x1:startPt.x,y1:startPt.y,x2:end.x,y2:end.y}]);setDraw(false);setStart(null);setCur(null);},[drawing,startPt,curPt,tool,color,getPos]);
  const addText=()=>{if(textVal.trim()&&textDlg)setShapes(p=>[...p,{tool:"text",color,x1:textDlg.x,y1:textDlg.y,text:textVal.trim()}]);setTDlg(null);setTVal("");};
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
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}/>
        {textDlg&&(<div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 p-4"><div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
          <p className="text-sm font-bold text-gray-800 mb-3">✏️ Texto</p>
          <input autoFocus value={textVal} onChange={e=>setTVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addText()} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 mb-4" placeholder="Texto de anotación…"/>
          <div className="flex gap-2"><button onClick={()=>{setTDlg(null);setTVal("");}} className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-500">Cancelar</button><button onClick={addText} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{background:Y}}>Agregar →</button></div>
        </div></div>)}
      </div>
      <div className="shrink-0 px-3 pt-2.5 pb-3 space-y-2.5" style={{background:DARK}}>
        <div className="flex items-center gap-1.5">
          {TOOLS.map(t=>(<button key={t.id} onClick={()=>setTool(t.id)} className={`flex-1 py-2 rounded-xl flex flex-col items-center gap-0.5 text-xs font-bold border-2 transition-all ${tool===t.id?"border-transparent text-gray-900":"border-white/10 text-white/50 hover:text-white"}`} style={tool===t.id?{background:Y}:{}}><span className="text-sm leading-none">{t.icon}</span><span className="text-[9px]">{t.L}</span></button>))}
          <div className="w-px h-10 bg-white/10 mx-0.5"/>
          <button onClick={()=>setShapes(p=>p.slice(0,-1))} className="px-2.5 py-2 rounded-xl border-2 border-white/10 text-white/50 hover:text-white flex flex-col items-center"><span className="text-sm">↩</span><span className="text-[9px] text-white/40">Undo</span></button>
          <button onClick={()=>{if(confirm("¿Borrar?"))setShapes([]);}} className="px-2.5 py-2 rounded-xl border-2 border-white/10 text-white/50 hover:text-red-400 flex flex-col items-center"><span className="text-sm">🗑️</span><span className="text-[9px] text-white/40">Clear</span></button>
        </div>
        <div className="flex items-center justify-center gap-3 pb-1">
          <span className="text-white/30 text-[11px] mr-1">Color:</span>
          {COLS.map(c=><button key={c} onClick={()=>setColor(c)} className="transition-all active:scale-90" style={{width:26,height:26,borderRadius:"50%",background:c,outline:color===c?`3px solid ${Y}`:"3px solid transparent",outlineOffset:2,border:c==="#ffffff"?"2px solid rgba(255,255,255,0.25)":"none"}}/>)}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FINALIZAR MODAL — ELÉCTRICO
═══════════════════════════════════════════ */
function FinalizarModal({informe,onConfirm,onClose}) {
  const tipo=informe.tipo||"verificacion";
  const ress=tipo==="inspeccion"?RESULTADOS_INSPECCION:RESULTADOS_VERIFICACION;
  const alta=(informe.elementos||[]).filter(e=>e.prioridad==="alta").length;
  const normal=(informe.elementos||[]).filter(e=>e.prioridad==="normal").length;
  const baja=(informe.elementos||[]).filter(e=>e.prioridad==="baja").length;
  const total=informe.elementos?.length||0;
  const suggested=tipo==="inspeccion"?(alta>0?"No Aprobada":"Aprobada"):(alta>0?"Rechazada":normal>0?"Condicionada":"Aprobada");
  const [resultado,setRes]=useState(informe.resultado||suggested);
  const [plazo,setPlazo]=useState(informe.plazo||"12 meses");
  const [notas,setNotas]=useState(informe.notas||"");
  const [saving,setSaving]=useState(false);
  const RC={"Aprobada":{color:"#16a34a",bg:"#f0fdf4",desc:"Instalación cumple con los requisitos normativos."},"Condicionada":{color:Y,bg:"#fffbeb",desc:"Requiere correcciones en el plazo establecido."},"Rechazada":{color:"#dc2626",bg:"#fef2f2",desc:"No conformidades críticas que impiden la aprobación."},"No Aprobada":{color:"#dc2626",bg:"#fef2f2",desc:"La instalación no cumple con los requisitos normativos."}};
  const cfg=RC[resultado]||RC["Aprobada"];
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" style={{maxHeight:"95vh"}}>
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-lg font-extrabold text-gray-900">🏁 Finalizar {tipo==="inspeccion"?"Inspección":"Verificación"}</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-gray-600 hover:bg-gray-100 font-bold text-lg">✕</button>
          </div>
          <p className="text-xs text-gray-400">{informe.codigo} · {informe.propietario}</p>
        </div>
        <div className="overflow-y-auto p-5 space-y-5 pb-6">
          <div className="rounded-2xl border-2 border-gray-100 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100"><p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Resumen</p></div>
            <div className="grid grid-cols-4 divide-x divide-gray-100">
              {[["Total",total,"text-gray-800"],["Alta",alta,"text-red-500"],["Normal",normal,"text-amber-500"],["Baja",baja,"text-green-500"]].map(([l,n,cl])=>(
                <div key={l} className="px-3 py-3 text-center"><div className={`text-xl font-extrabold ${cl}`}>{n}</div><div className="text-[10px] text-gray-400 mt-0.5">{l}</div></div>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border-2" style={{borderColor:cfg.color+"40",background:cfg.bg}}>
            <span className="text-lg mt-0.5">💡</span>
            <div><p className="text-xs font-bold" style={{color:cfg.color}}>Resultado sugerido: {suggested}</p><p className="text-xs mt-0.5" style={{color:cfg.color+"cc"}}>{cfg.desc}</p></div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Resultado *</label>
            <div className="space-y-2.5">
              {ress.map(r=>{const c=RC[r]||RC["Aprobada"];const active=resultado===r;return(
                <button key={r} onClick={()=>setRes(r)} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all" style={{borderColor:active?c.color:"#e5e7eb",background:active?c.bg:"white"}}>
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{borderColor:active?c.color:"#d1d5db",background:active?c.color:"white"}}>{active&&<div className="w-2 h-2 rounded-full bg-white"/>}</div>
                  <div className="flex-1"><p className="font-bold text-sm" style={{color:active?c.color:"#374151"}}>{r}</p><p className="text-xs mt-0.5" style={{color:active?c.color+"aa":"#9ca3af"}}>{c.desc}</p></div>
                </button>
              );})}
            </div>
          </div>
          {tipo!=="inspeccion"&&resultado!=="Aprobada"&&(
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Plazo para mejoras</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {["3 meses","6 meses","12 meses","18 meses","24 meses"].map(p=>(
                  <button key={p} onClick={()=>setPlazo(p)} className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all" style={{borderColor:plazo===p?Y:"#e5e7eb",background:plazo===p?Y+"15":"white",color:plazo===p?Y:"#6b7280"}}>{p}</button>
                ))}
              </div>
              <FI label="" value={plazo} onChange={e=>setPlazo(e.target.value)} placeholder="Ej: 12 meses"/>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Notas adicionales</label>
            <textarea value={notas} onChange={e=>setNotas(e.target.value)} rows={3} placeholder="Notas adicionales del informe…"
              className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm bg-gray-50 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-all"/>
          </div>
          <button onClick={()=>{setSaving(true);onConfirm({resultado,plazo:tipo==="inspeccion"?"N/A":plazo,notas});}} disabled={saving}
            className="w-full py-4 rounded-2xl font-extrabold text-white text-base hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
            style={{background:resultado==="Aprobada"?"#16a34a":resultado==="Condicionada"?Y:"#dc2626"}}>
            {saving?"⏳ Guardando…":"Generar Reporte →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HOME
═══════════════════════════════════════════ */
function HomeView({informes,loading,onNew,onOpen,usuario,onLogout}) {
  const [delTarget,setDel] = useState(null);
  const [tabActiva,setTab] = useState("todos");

  const TABS = [
    { id:"todos",        label:"Todos",        icon:"📋" },
    { id:"verificacion", label:"Verificación", icon:"🔍" },
    { id:"inspeccion",   label:"Inspección",   icon:"⚡" },
    { id:"ac",           label:"Aires AC",     icon:"🌡️" },
  ];

  const filtrados = [...informes]
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))
    .filter(inf => tabActiva === "todos" || inf.tipo === tabActiva);

  const conteo = (tipo) => informes.filter(i => tipo === "todos" ? true : i.tipo === tipo).length;

  const tipoBadge = (t) =>
    t==="ac"          ? {label:"Aires AC",      bg:"#0c4a6e22", color:"#0369a1"} :
    t==="inspeccion"  ? {label:"Inspección",    bg:DARK+"18",   color:DARK      } :
                        {label:"Verificación",  bg:Y+"22",      color:Y         };

  return (
    <div className="min-h-screen" style={{background:"#f8f9fb"}}>
      <header style={{background:DARK}} className="px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <Logo white/>
          <div className="flex items-center gap-2">
            <div className="text-right mr-1 hidden sm:block">
              <div className="text-white text-xs font-bold leading-tight">{usuario.nombre}</div>
              <button onClick={onLogout} className="text-white/40 hover:text-white/70 text-[10px]">Cerrar sesión</button>
            </div>
            <button onClick={onLogout} className="sm:hidden text-white/40 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10">↩</button>
            <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm text-gray-900 hover:opacity-90 active:scale-95" style={{background:Y}}>
              <span className="text-base leading-none">+</span> Nuevo
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto mt-3 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${tabActiva===t.id?"text-gray-900":"text-white/50 hover:text-white/80"}`}
              style={tabActiva===t.id?{background:Y}:{background:"rgba(255,255,255,0.08)"}}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${tabActiva===t.id?"bg-black/20 text-gray-900":"bg-white/10 text-white/60"}`}>
                {conteo(t.id)}
              </span>
            </button>
          ))}
        </div>
      </header>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4 mt-1">
          <h2 className="font-bold text-gray-400 text-xs uppercase tracking-widest">
            {TABS.find(t=>t.id===tabActiva)?.label} ({filtrados.length})
          </h2>
          <span className="text-xs text-green-500 font-medium">🔄 En línea</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-amber-400 rounded-full animate-spin"/>
            <span className="text-gray-400 text-sm">Cargando informes…</span>
          </div>
        ) : !filtrados.length ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl"
              style={{background:Y+"22"}}>
              {TABS.find(t=>t.id===tabActiva)?.icon}
            </div>
            <p className="text-gray-400 text-sm mb-6">
              {tabActiva==="todos"
                ? "No hay informes. Toca + Nuevo para comenzar."
                : `No hay informes de ${TABS.find(t=>t.id===tabActiva)?.label}.`}
            </p>
            {tabActiva==="todos" && <Btn onClick={onNew}>Crear primer informe</Btn>}
          </div>
        ) : (
          <div className="space-y-3">
            {filtrados.map(inf=>{
              const tb = tipoBadge(inf.tipo);
              const nEl = inf.tipo==="ac" ? inf.equipos?.length||0 : inf.elementos?.length||0;
              const aprobadosAC = inf.tipo==="ac" ? (inf.equipos||[]).filter(e=>e.resultado==="Aprobado").length : null;
              const altaCount = inf.tipo!=="ac" ? (inf.elementos||[]).filter(e=>e.prioridad==="alta").length : 0;

              return (
                <div key={inf.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Franja de color por tipo */}
                  <div className="h-1 w-full" style={{
                    background: inf.tipo==="ac" ? "#38bdf8" : inf.tipo==="inspeccion" ? DARK : Y
                  }}/>
                  <div onClick={()=>onOpen(inf)} className="p-4 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <div className="font-mono text-[11px] text-gray-300 tracking-wider">{inf.codigo}</div>
                          {tabActiva==="todos" && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{background:tb.bg, color:tb.color}}>{tb.label}</span>
                          )}
                          {!inf.resultado && inf.tipo!=="ac" &&
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 border border-blue-100">En curso</span>}
                        </div>
                        <div className="font-bold text-gray-800 truncate text-sm">{inf.propietario||"Sin nombre"}</div>
                        <div className="text-xs text-gray-400 truncate">{inf.direccion}</div>
                      </div>
                      <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                        <ResBadge v={inf.resultado}/>
                        <div className="text-[11px] text-gray-300">{inf.fecha}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400">
                      {inf.tipo==="ac" ? (
                        <>
                          <span>🌡️ <b className="text-gray-600">{nEl}</b> equipos</span>
                          {aprobadosAC!==null && <span className="text-green-500 font-bold">✅ {aprobadosAC}/{nEl}</span>}
                        </>
                      ) : (
                        <>
                          <span>📷 <b className="text-gray-600">{nEl}</b> elementos</span>
                          {altaCount>0 && <span className="font-bold text-red-400">🔴 {altaCount} alta prioridad</span>}
                        </>
                      )}
                      <span className="text-[10px] text-gray-300 ml-auto">{inf.tipo==="ac"?inf.tecnico:inf.ingeniero}</span>
                    </div>
                  </div>
                  <div className="flex border-t border-gray-50 divide-x divide-gray-50 text-xs">
                    {inf.resultado && (
                      <button
                        onClick={()=>inf.tipo==="ac" ? generatePDFAC(inf) : generatePDFElectrico(inf)}
                        className="flex-1 py-2.5 text-gray-500 hover:bg-gray-50 font-semibold transition-colors flex items-center justify-center gap-1">
                        🖨️ PDF
                      </button>
                    )}
                    <button onClick={()=>setDel(inf)}
                      className="flex-1 py-2.5 text-red-400 hover:bg-red-50 font-semibold transition-colors flex items-center justify-center gap-1">
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {delTarget && <DeleteModal informe={delTarget} onConfirm={()=>setDel(null)} onClose={()=>setDel(null)}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   NUEVO INFORME — DATOS GENERALES
═══════════════════════════════════════════ */
function NuevoView({onCreate,onBack,usuario,tipo}) {
  const [f,setF]=useState({
    codigo:"", propietario:"", direccion:"", fecha:HOY,
    ingeniero: tipo==="ac" ? "" : usuario.nombre,
    matricula: tipo==="ac" ? "" : usuario.matricula,
    tecnico:   tipo==="ac" ? usuario.nombre : "",
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const tipoLabel=tipo==="ac"?"Mantenimiento de Aires":tipo==="inspeccion"?"Inspección Eléctrica":"Verificación Eléctrica";

  const go=()=>{
    if(!f.codigo.trim()) return alert("El código de informe es requerido.\nEjemplo: INF-26-055");
    if(!f.propietario.trim()) return alert("El nombre del cliente es requerido.");
    const base={...f,tipo,id:Date.now(),createdAt:Date.now()};
    if(tipo==="ac") onCreate({...base,equipos:[],resultado:null,notas:""});
    else            onCreate({...base,elementos:[],resultado:null,plazo:"12 meses",notas:""});
  };

  return (
    <div className="min-h-screen" style={{background:"#f8f9fb"}}>
      <header style={{background:DARK}} className="px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={onBack} className="text-white/60 hover:text-white text-xl transition-colors">←</button>
          <Logo sm white/>
          <span className="font-bold text-white text-sm ml-1">{tipoLabel}</span>
        </div>
      </header>
      <div className="p-4 max-w-lg mx-auto space-y-3 pb-24">
        <Card title="Identificación" accent>
          <FI label="Código del informe *" value={f.codigo} onChange={e=>s("codigo",e.target.value)} placeholder="INF-26-055"/>
          <FI label="Fecha *" value={f.fecha} onChange={e=>s("fecha",e.target.value)} type="date"/>
        </Card>
        <Card title="Datos del Cliente" accent>
          <FI label="Cliente / Propietario *" value={f.propietario} onChange={e=>s("propietario",e.target.value)} placeholder="Nombre completo…"/>
          <FI label="Dirección / Ubicación" value={f.direccion} onChange={e=>s("direccion",e.target.value)} placeholder="San José, Montes de Oca…"/>
        </Card>
        {tipo==="ac"?(
          <Card title="Responsable del Mantenimiento" accent>
            <FI label="Técnico responsable" value={f.tecnico} onChange={e=>s("tecnico",e.target.value)} placeholder="Nombre del técnico o responsable"/>
          </Card>
        ):(
          <Card title="Responsable de Verificación" accent>
            <FI label="Nombre del Ingeniero" value={f.ingeniero} onChange={e=>s("ingeniero",e.target.value)} placeholder="Ing. Nombre Apellido"/>
            <FI label="Matrícula" value={f.matricula} onChange={e=>s("matricula",e.target.value)} placeholder="IE-XXXXX / CAPDEE-XXX"/>
          </Card>
        )}
        <Btn onClick={go} full>
          {tipo==="ac"?"Continuar → Agregar equipos":"Iniciar →"}
        </Btn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   EQUIPO AC MODAL — 4 fotos fijas + resultado
═══════════════════════════════════════════ */
function EquipoACModal({equipo,num,onSave,onClose}) {
  const [nombre,  setNombre  ] = useState(equipo?.nombre||"");
  const [ubicacion,setUbic   ] = useState(equipo?.ubicacion||"");
  const [fotos,   setFotos   ] = useState(equipo?.fotos||{});
  const [resultado,setRes    ] = useState(equipo?.resultado||"");
  const [acciones, setAcc    ] = useState(equipo?.acciones||[]);
  const [obs,      setObs    ] = useState(equipo?.observaciones||"");
  const [annot,    setAnn    ] = useState(null); // {url, key}
  const [err,      setErr    ] = useState(null);
  const fileRefs = useRef({});

  const onPhoto = async (e, key) => {
    const f = e.target.files[0]; if(!f) return;
    try { const {url} = await processPhoto(f); setAnn({url, key}); }
    catch { setErr("Error al procesar la imagen."); }
  };

  const onAnnotConfirm = (finalUrl) => {
    setFotos(p=>({...p,[annot.key]:finalUrl}));
    setAnn(null);
  };

  const save = () => {
    if(!nombre.trim()) { setErr("El nombre del equipo es requerido."); return; }
    if(!resultado)     { setErr("Indica si el equipo está Aprobado o No Aprobado."); return; }
    onSave({nombre:nombre.trim(), ubicacion, fotos, resultado, acciones, observaciones:obs, num});
  };

  if(annot) return <AnnotationEditor imageUrl={annot.url} onConfirm={(u)=>onAnnotConfirm(u)} onClose={()=>setAnn(null)}/>;

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" style={{maxHeight:"93vh"}}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 font-bold text-lg">✕</button>
          <span className="font-bold text-gray-800">Equipo <span className="font-mono text-gray-400">#{num}</span></span>
          <Btn onClick={save} sm>Guardar ✓</Btn>
        </div>
        <div className="overflow-y-auto p-4 space-y-4 pb-6">
          {/* Datos del equipo */}
          <FI label="Nombre del equipo *" value={nombre} onChange={e=>{setNombre(e.target.value);setErr(null);}} placeholder="Ej: Apartamento #7 / Oficina Naranja"/>
          <FI label="Ubicación" value={ubicacion} onChange={e=>setUbic(e.target.value)} placeholder="Ej: Segundo piso, habitación principal"/>

          {/* 4 fotos fijas */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">📷 Fotografías del equipo</label>
            <div className="space-y-3">
              {AC_FOTOS.map(f=>(
                <div key={f.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-600">{f.icon} {f.label}</span>
                    {fotos[f.key]&&<button onClick={()=>setAnn({url:fotos[f.key],key:f.key})} className="text-[10px] font-bold px-2 py-1 rounded-lg border" style={{color:Y,borderColor:Y,background:Y+"10"}}>✏️ Anotar</button>}
                  </div>
                  {fotos[f.key]?(
                    <div className="relative">
                      <img src={fotos[f.key]} alt={f.label} className="w-full h-36 object-cover rounded-xl border border-gray-200"/>
                      <button onClick={()=>fileRefs.current[f.key].click()} className="absolute bottom-2 right-2 px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-[10px] font-bold hover:bg-black/80">📷 Cambiar</button>
                    </div>
                  ):(
                    <button onClick={()=>fileRefs.current[f.key].click()}
                      className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 text-center hover:border-amber-400 hover:bg-amber-50 transition-all active:scale-95">
                      <div className="text-2xl mb-1">{f.icon}</div>
                      <div className="text-xs font-semibold text-gray-400">{f.hint}</div>
                    </button>
                  )}
                  <input ref={el=>fileRefs.current[f.key]=el} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>onPhoto(e,f.key)}/>
                </div>
              ))}
            </div>
          </div>

          {/* Resultado del equipo */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Resultado del equipo *</label>
            <div className="flex gap-3">
              <button onClick={()=>{setRes("Aprobado");setErr(null);}}
                className={`flex-1 py-3.5 rounded-2xl font-extrabold text-sm border-2 transition-all ${resultado==="Aprobado"?"text-white border-green-500":"border-gray-200 text-gray-400 hover:border-green-300"}`}
                style={resultado==="Aprobado"?{background:"#16a34a"}:{}}>
                ✅ Aprobado
              </button>
              <button onClick={()=>{setRes("No Aprobado");setErr(null);}}
                className={`flex-1 py-3.5 rounded-2xl font-extrabold text-sm border-2 transition-all ${resultado==="No Aprobado"?"text-white border-red-500":"border-gray-200 text-gray-400 hover:border-red-300"}`}
                style={resultado==="No Aprobado"?{background:"#dc2626"}:{}}>
                ❌ No Aprobado
              </button>
            </div>
          </div>

          {/* Acciones solo si No Aprobado */}
          {resultado==="No Aprobado"&&(
            <ListEditor label="Acciones realizadas / requeridas" items={acciones} set={setAcc} placeholder="Ej: Se recargó refrigerante, revisar condensadora en próximo mantenimiento…"/>
          )}

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Observaciones generales</label>
            <textarea value={obs} onChange={e=>setObs(e.target.value)} rows={2} placeholder="Presiones, amperaje, estado general del equipo…"
              className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm bg-gray-50 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-all"/>
          </div>

          {err&&<div className="bg-red-50 border-2 border-red-100 rounded-2xl p-3 text-xs text-red-600 font-medium">⚠️ {err}</div>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MANTENIMIENTO AC VIEW
═══════════════════════════════════════════ */
function MantenimientoACView({informe,onUpdate,onBack,onFinalize}) {
  const [modal,    setModal   ] = useState(false);
  const [editIdx,  setEditIdx ] = useState(null);
  const [syncing,  setSyncing ] = useState(false);
  const [finalDlg, setFinalDlg] = useState(false);

  const equipos = informe.equipos || [];
  const aprobados   = equipos.filter(e=>e.resultado==="Aprobado").length;
  const noAprobados = equipos.filter(e=>e.resultado==="No Aprobado").length;

  const saveEquipo = async (eq) => {
    const list = [...equipos];
    if(editIdx!==null) list[editIdx]={...eq,num:editIdx+1};
    else list.push({...eq,num:list.length+1});
    const updated={...informe,equipos:list};
    setSyncing(true); await saveInformeFS(updated); setSyncing(false);
    onUpdate(updated); setModal(false);
  };

  const delEquipo = async (i) => {
    if(!confirm("¿Eliminar este equipo?")) return;
    const list=equipos.filter((_,j)=>j!==i).map((e,j)=>({...e,num:j+1}));
    const updated={...informe,equipos:list};
    await saveInformeFS(updated); onUpdate(updated);
  };

  const handleFinalizar = async () => {
    if(equipos.length===0){alert("Agrega al menos un equipo antes de finalizar.");return;}
    const updated={...informe,resultado:"Completado",finalizadoAt:Date.now()};
    setSyncing(true); await saveInformeFS(updated); setSyncing(false);
    onFinalize(updated);
  };

  return (
    <div className="min-h-screen" style={{background:"#f8f9fb"}}>
      <header style={{background:"#0c4a6e"}} className="px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={onBack} className="text-white/60 hover:text-white text-xl transition-colors">←</button>
            <Logo sm white/>
            {syncing&&<div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin ml-1"/>}
            <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg" style={{background:"#38bdf822",color:"#38bdf8"}}>AIRES AC</span>
          </div>
          <div className="flex items-start justify-between ml-1">
            <div>
              <div className="font-mono text-[11px] text-white/40 tracking-wider">{informe.codigo}</div>
              <div className="font-bold text-white text-sm">{informe.propietario}</div>
              <div className="text-white/50 text-xs">{informe.tecnico}</div>
            </div>
            {informe.resultado&&(
              <button onClick={()=>generatePDFAC(informe)} className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-white/20 text-white hover:bg-white/10 transition-colors">🖨️ PDF</button>
            )}
          </div>
        </div>
      </header>

      {/* Estadísticas */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-2xl mx-auto grid grid-cols-3 gap-3 text-center">
          <div><div className="text-xl font-extrabold text-gray-800">{equipos.length}</div><div className="text-[10px] text-gray-400">Total equipos</div></div>
          <div><div className="text-xl font-extrabold text-green-500">{aprobados}</div><div className="text-[10px] text-gray-400">Aprobados</div></div>
          <div><div className="text-xl font-extrabold text-red-500">{noAprobados}</div><div className="text-[10px] text-gray-400">No aprobados</div></div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto pb-36 space-y-3">
        {!equipos.length?(
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl" style={{background:"#38bdf822"}}>🌡️</div>
            <p className="text-gray-400 text-sm">Toca <b style={{color:Y}}>+</b> para agregar el primer equipo de aire acondicionado</p>
          </div>
        ):(
          equipos.map((eq,i)=>(
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-mono text-[10px] text-gray-300">({eq.num})</div>
                    <div className="font-bold text-gray-800 text-sm">{eq.nombre}</div>
                    {eq.ubicacion&&<div className="text-xs text-gray-400">📍 {eq.ubicacion}</div>}
                  </div>
                  <ResBadge v={eq.resultado}/>
                </div>
                {/* Miniaturas de fotos */}
                <div className="flex gap-1.5 mt-2">
                  {AC_FOTOS.map(f=>(
                    <div key={f.key} className="flex-1 aspect-square rounded-lg overflow-hidden border border-gray-100" style={{maxWidth:60}}>
                      {eq.fotos?.[f.key]
                        ? <img src={eq.fotos[f.key]} alt={f.label} className="w-full h-full object-cover"/>
                        : <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-300 text-sm">{f.icon}</div>}
                    </div>
                  ))}
                </div>
                {eq.resultado==="No Aprobado"&&eq.acciones?.length>0&&(
                  <div className="mt-2 text-xs text-red-600 font-medium">⚠️ {eq.acciones.length} acción{eq.acciones.length>1?"es":""} reportada{eq.acciones.length>1?"s":""}</div>
                )}
              </div>
              <div className="flex border-t border-gray-50 divide-x divide-gray-50 text-xs">
                <button onClick={()=>{setEditIdx(i);setModal(true);}} className="flex-1 py-2.5 text-gray-500 hover:bg-gray-50 font-semibold transition-colors">✏️ Editar</button>
                <button onClick={()=>delEquipo(i)} className="flex-1 py-2.5 text-red-400 hover:bg-red-50 font-semibold transition-colors">🗑️ Eliminar</button>
              </div>
            </div>
          ))
        )}

        {/* Card finalizar */}
        <div className={`rounded-2xl border-2 overflow-hidden ${informe.resultado?"border-green-200 bg-green-50":"border-dashed border-gray-200 bg-white"}`}>
          <div className="p-4">
            {informe.resultado?(
              <div>
                <p className="font-bold text-green-700 text-sm mb-1">✅ Mantenimiento completado</p>
                <p className="text-xs text-green-600 mb-3">{aprobados} aprobados · {noAprobados} no aprobados de {equipos.length} equipos</p>
                <button onClick={()=>generatePDFAC(informe)} className="w-full py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90" style={{background:DARK}}>🖨️ Generar PDF del informe</button>
              </div>
            ):(
              <div>
                <p className="font-bold text-gray-500 text-sm mb-1">¿Terminaste el mantenimiento?</p>
                <p className="text-xs text-gray-400 mb-4">Al finalizar se guardará el informe y podrás generar el PDF.</p>
                <button onClick={handleFinalizar}
                  className="w-full py-3.5 rounded-xl font-extrabold text-white text-sm hover:opacity-90 active:scale-95 transition-all"
                  style={{background:"#0c4a6e"}}>
                  🏁 Finalizar Mantenimiento
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <button onClick={()=>{setEditIdx(null);setModal(true);}}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-2xl text-white text-3xl flex items-center justify-center z-20 active:scale-90 hover:opacity-90 transition-all"
        style={{background:"#38bdf8"}}>+</button>

      {modal&&<EquipoACModal equipo={editIdx!==null?equipos[editIdx]:null} num={editIdx!==null?editIdx+1:equipos.length+1} onSave={saveEquipo} onClose={()=>setModal(false)}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   INSPECCIÓN / VERIFICACIÓN ELÉCTRICA
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
  const onPhoto=async(e)=>{const f=e.target.files[0];if(!f)return;setErr(null);try{const{url:u,b64:b}=await processPhoto(f);setUrl(u);setB64(b);setAnn(u);}catch{setErr("Error al procesar la imagen.");}};
  const onAnnotConfirm=(fu,fb)=>{setUrl(fu);setB64(fb);setAnn(null);if(titulo.trim())analyze(fb);else setErr("Foto guardada. Escribe el título y toca IA NEC.");};
  const analyze=async(b=b64)=>{if(!b){setErr("Primero adjunta foto.");return;}if(!titulo.trim()){setErr("Escribe el título.");return;}setBusy(true);setErr(null);try{const r=await callAI(b,titulo.trim());setH(r.hallazgos||[]);setA(r.acciones||[]);}catch(e){setErr("Error IA: "+e.message);}finally{setBusy(false);}};
  const save=()=>{if(!titulo.trim()){setErr("El título es requerido.");return;}onSave({titulo:titulo.trim(),url,b64,hallazgos:H,acciones:A,prioridad:prio,num});};
  if(annot)return <AnnotationEditor imageUrl={annot} onConfirm={onAnnotConfirm} onClose={()=>{setAnn(null);setB64(null);setUrl(null);}}/>;
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

function InspeccionView({informe,onUpdate,onBack,onFinalize}) {
  const [modal,setModal]=useState(false);const [editIdx,setEditIdx]=useState(null);const [finalM,setFinalM]=useState(false);const [syncing,setSyncing]=useState(false);
  const tipo=informe.tipo||"verificacion";const tipoLabel=tipo==="inspeccion"?"Inspección":"Verificación";
  const saveEl=async(el)=>{const els=[...(informe.elementos||[])];if(editIdx!==null)els[editIdx]={...el,num:editIdx+1};else els.push({...el,num:els.length+1});const updated={...informe,elementos:els};setSyncing(true);await saveInformeFS(updated);setSyncing(false);onUpdate(updated);setModal(false);};
  const delEl=async(i)=>{if(!confirm("¿Eliminar?"))return;const els=informe.elementos.filter((_,j)=>j!==i).map((e,j)=>({...e,num:j+1}));const updated={...informe,elementos:els};await saveInformeFS(updated);onUpdate(updated);};
  const handleFinalize=async(data)=>{const updated={...informe,...data};setSyncing(true);await saveInformeFS(updated);setSyncing(false);onFinalize(updated);setFinalM(false);};
  const alta=(informe.elementos||[]).filter(e=>e.prioridad==="alta").length;
  const total=informe.elementos?.length||0;
  return (
    <div className="min-h-screen" style={{background:"#f8f9fb"}}>
      <header style={{background:DARK}} className="px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={onBack} className="text-white/60 hover:text-white text-xl transition-colors">←</button>
            <Logo sm white/>
            {syncing&&<div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin ml-1"/>}
            <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg" style={{background:Y+"30",color:Y}}>{tipoLabel.toUpperCase()}</span>
          </div>
          <div className="flex items-start justify-between ml-1">
            <div><div className="font-mono text-[11px] text-white/40">{informe.codigo}</div><div className="font-bold text-white text-sm">{informe.propietario}</div></div>
            <div className="flex items-center gap-2">
              {informe.resultado&&<ResBadge v={informe.resultado}/>}
              {informe.resultado&&<button onClick={()=>generatePDFElectrico(informe)} className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-white/20 text-white hover:bg-white/10">🖨️ PDF</button>}
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
        {!total?(<div className="text-center py-20"><div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl" style={{background:Y+"22"}}>📷</div><p className="text-gray-400 text-sm">Toca <b style={{color:Y}}>+</b> para agregar el primer elemento</p></div>):(
          informe.elementos.map((el,i)=>(
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex gap-3 p-3">
                {el.url?<img src={el.url} alt={el.titulo} className="w-20 h-20 object-cover rounded-xl shrink-0"/>:<div className="w-20 h-20 bg-gray-100 rounded-xl shrink-0 flex items-center justify-center text-2xl">📷</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1"><span className="font-mono text-[10px] text-gray-300">({el.num})</span><Badge v={el.prioridad}/></div>
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
        <div className={`rounded-2xl border-2 overflow-hidden ${informe.resultado?"border-green-200 bg-green-50":"border-dashed border-gray-200 bg-white"}`}>
          <div className="p-4">
            {informe.resultado?(
              <div>
                <div className="flex items-center justify-between mb-2"><p className="font-bold text-green-700 text-sm">✅ {tipoLabel} finalizada</p><ResBadge v={informe.resultado}/></div>
                {tipo!=="inspeccion"&&<p className="text-xs text-green-600 mb-3">Plazo: {informe.plazo}</p>}
                <div className="flex gap-2">
                  <button onClick={()=>setFinalM(true)} className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 border-green-200 text-green-700 hover:bg-green-100">✏️ Editar resultado</button>
                  <button onClick={()=>generatePDFElectrico(informe)} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90" style={{background:DARK}}>🖨️ Generar PDF</button>
                </div>
              </div>
            ):(
              <div>
                <p className="font-bold text-gray-500 text-sm mb-1">¿Terminaste de fotografiar?</p>
                <p className="text-xs text-gray-400 mb-4">Al finalizar se asignará el resultado y quedará disponible en todos los dispositivos.</p>
                <button onClick={()=>{if(total===0){alert("Agrega al menos un elemento.");return;}setFinalM(true);}}
                  className="w-full py-3.5 rounded-xl font-extrabold text-white text-sm hover:opacity-90 active:scale-95 transition-all" style={{background:DARK}}>
                  🏁 Finalizar {tipoLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <button onClick={()=>{setEditIdx(null);setModal(true);}} className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-2xl text-white text-3xl flex items-center justify-center z-20 active:scale-90 hover:opacity-90 transition-all" style={{background:Y}}>+</button>
      {modal&&<ElementoModal el={editIdx!==null?informe.elementos[editIdx]:null} num={editIdx!==null?editIdx+1:(informe.elementos?.length||0)+1} onSave={saveEl} onClose={()=>setModal(false)}/>}
      {finalM&&<FinalizarModal informe={informe} onConfirm={handleFinalize} onClose={()=>setFinalM(false)}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   ROOT
═══════════════════════════════════════════ */
export default function App() {
  const [view,     setV]   = useState("login");
  const [usuario,  setUsr] = useState(()=>lsto.get("e_usr")||null);
  const [tipoNuevo,setTipo]= useState(null);
  const [informes, setI]   = useState([]);
  const [loading,  setLoad]= useState(true);
  const [active,   setAct] = useState(null);

  useEffect(()=>{
    if(!usuario){setLoad(false);return;}
    const q=query(collection(db,"informes"),orderBy("createdAt","desc"));
    const unsub=onSnapshot(q,(snap)=>{setI(snap.docs.map(d=>({...d.data(),id:d.id})));setLoad(false);},(err)=>{console.error(err);setLoad(false);});
    return()=>unsub();
  },[usuario]);

  useEffect(()=>{ if(usuario) setV("selector"); },[usuario]);

  const login=(u)=>{lsto.set("e_usr",u);setUsr(u);setV("selector");};
  const logout=()=>{lsto.set("e_usr",null);setUsr(null);setV("login");};
  const create=async(data)=>{await saveInformeFS(data);setAct(data);setV(data.tipo==="ac"?"ac":"insp");};
  const update=(inf)=>{setI(prev=>prev.map(i=>String(i.id)===String(inf.id)?inf:i));setAct(inf);};
  const open=(inf)=>{setAct(inf);setV(inf.tipo==="ac"?"ac":"insp");};
  const finalize=(inf)=>{setI(prev=>prev.map(i=>String(i.id)===String(inf.id)?inf:i));setAct(inf);setV("home");};
  const handleTipo=(t)=>{if(t==="home"){setV("home");return;}setTipo(t);setV("nuevo");};

  if(view==="login")    return <LoginView onLogin={login}/>;
  if(view==="selector") return <TipoSelectorView onSelect={handleTipo} usuario={usuario} onLogout={logout}/>;
  if(view==="home")     return <HomeView informes={informes} loading={loading} onNew={()=>setV("selector")} onOpen={open} usuario={usuario} onLogout={logout}/>;
  if(view==="nuevo")    return <NuevoView onCreate={create} onBack={()=>setV("selector")} usuario={usuario} tipo={tipoNuevo}/>;
  if(view==="insp")     return <InspeccionView informe={active} onUpdate={update} onBack={()=>setV("home")} onFinalize={finalize}/>;
  if(view==="ac")       return <MantenimientoACView informe={active} onUpdate={update} onBack={()=>setV("home")} onFinalize={finalize}/>;
}
