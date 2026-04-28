import { useState, useRef, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, PageOrientation,
  BorderStyle, WidthType, ShadingType, VerticalAlign, PageBreak,
} from "docx";
import JSZip from "jszip";
import { LOGO_ICON_B64, LOGO_FULL_B64 } from "./logos";

const LOGO_ICON_URI = `data:image/jpeg;base64,${LOGO_ICON_B64}`;
const LOGO_FULL_URI = `data:image/png;base64,${LOGO_FULL_B64}`;

const firebaseConfig = {
  apiKey: "AIzaSyBpZ_ZK8o6kopoPwp1goAbLXWzja2NuCiA",
  authDomain: "electrizar-inspecciones.firebaseapp.com",
  projectId: "electrizar-inspecciones",
  storageBucket: "electrizar-inspecciones.firebasestorage.app",
  messagingSenderId: "664280211024",
  appId: "1:664280211024:web:41da18e05445ab15af3b55",
};
const fbApp = initializeApp(firebaseConfig);
const db = initializeFirestore(fbApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
const saveInformeFS = (inf: any): void => {
  setDoc(doc(db,"informes",String(inf.id)),{...inf,updatedAt:serverTimestamp()})
    .catch((e)=>console.warn("[FS] sync pendiente:",e));
};
const deleteInformeFS = async (id: any) => { await deleteDoc(doc(db,"informes",String(id))); };

const USUARIOS = [
  { user:"amontiel",   pass:"cubillo26", nombre:"Ing. Alonso Montiel Cubillo", matricula:"IE-24011 / CAPDEE-165", rol:"ingeniero" },
  { user:"jrodriguez", pass:"reyes26",   nombre:"Ing. Josué Rodríguez Reyes",  matricula:"",                      rol:"ingeniero" },
  { user:"tecnicos",   pass:"usuario26", nombre:"Técnico de Campo",             matricula:"",                      rol:"tecnico"   },
];

const Y    = "#F5A800";
const DARK = "#111827";
const CO   = { nombre:"Electrizar Electromecánica SRL", tel:"4001-7246", correo:"amontiel@electrizarcr.com", dir:"Calle Blancos, Goicoechea, San José, Costa Rica." };
const PRIOS = [
  { v:"alta",   L:"Alta",   c:"#dc2626", tw:"bg-red-50 text-red-700 border-red-200" },
  { v:"normal", L:"Normal", c:Y,         tw:"bg-amber-50 text-amber-700 border-amber-200" },
  { v:"baja",   L:"Baja",   c:"#16a34a", tw:"bg-green-50 text-green-700 border-green-200" },
];
const RES_VER  = ["Aprobada","Condicionada","Rechazada"];
const RES_INSP = ["Aprobada","No Aprobada"];
const AC_FOTOS = [
  { key:"evaporadora",  label:"Limpieza de evaporadora",         icon:"❄️", hint:"Foto limpieza unidad evaporadora" },
  { key:"condensadora", label:"Limpieza de condensadora",         icon:"💧", hint:"Foto limpieza unidad condensadora" },
  { key:"tuberia",      label:"Estado de tubería y aislante",     icon:"🔧", hint:"Foto tubería y aislamiento térmico" },
  { key:"presiones",    label:"Nivel de presión de refrigerante", icon:"🔵", hint:"Foto manómetro con presiones del sistema" },
];
const HOY   = new Date().toISOString().split("T")[0];
const NOTA_AGOSTO_2012 = `La instalación eléctrica objeto de la presente verificación data de una época anterior a agosto de 2012, fecha en que entró en vigencia el Reglamento de Oficialización del Código Eléctrico de Costa Rica para la Seguridad de la Vida y de la Propiedad (RTCR 458:2011), Decreto Ejecutivo N.° 36979-MEIC. Por lo tanto, los sistemas existentes no estaban sujetos a dicha normativa al momento de su construcción, y su evaluación se realiza únicamente con base en las condiciones de seguridad observables al momento de la inspección, conforme al Anexo B del citado reglamento.`;

const calcCumplimiento = (elementos: any[]) => {
  if(!elementos?.length) return 100;
  const alta=elementos.filter(e=>e.prioridad==="alta").length;
  return Math.round((1-alta/elementos.length)*100);
};

const suggestCodigo = (informes: any[]) => {
  const yr=new Date().getFullYear().toString().slice(-2);
  const prefix=`INF-${yr}-`;
  const nums=informes.map(i=>i.codigo?.startsWith(prefix)?parseInt(i.codigo.replace(prefix,""),10):0).filter(n=>n>0);
  const next=nums.length?Math.max(...nums)+1:1;
  return `${prefix}${String(next).padStart(3,"0")}`;
};

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const lsto = {
  get: (k: string) => { try { return JSON.parse(localStorage.getItem(k)!); } catch { return null; } },
  set: (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const processPhoto = (file: File): Promise<{url:string,b64:string}> => new Promise((res,rej) => {
  const img = new Image(), u = URL.createObjectURL(file);
  img.onload = () => {
    const max=600; let w=img.width, h=img.height;
    if(w>max){h=Math.round(h*max/w);w=max;} if(h>max){w=Math.round(w*max/h);h=max;}
    const c=document.createElement("canvas"); c.width=w; c.height=h;
    c.getContext("2d")!.drawImage(img,0,0,w,h); URL.revokeObjectURL(u);
    const dUrl=c.toDataURL("image/jpeg",0.55); res({url:dUrl,b64:dUrl.split(",")[1]});
  };
  img.onerror=rej; img.src=u;
});

const savePhotoToDevice = async (dataUrl: string, filename: string) => {
  try {
    const res=await fetch(dataUrl); const blob=await res.blob();
    const file=new File([blob],filename,{type:"image/jpeg"});
    if((navigator as any).canShare?.({files:[file]})){
      await (navigator as any).share({files:[file],title:filename}); return;
    }
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  } catch {}
};

const callAI = async (b64: string, titulo: string) => {
  const r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({b64,titulo})});
  const d=await r.json();
  if(d.error) throw new Error(d.error);
  if(!Array.isArray(d.hallazgos)) throw new Error("Respuesta inesperada de la IA");
  if(!Array.isArray(d.notas)) d.notas=[];
  return d;
};

const fmtFecha=(iso:string)=>{if(!iso)return"";const[y,m,d]=iso.split("-");return`${d} de ${MESES[+m-1]} de ${y}`;};

/* ══ PDF CSS ══ */
const PDF_CSS_BASE=`@page{size:letter landscape;margin:0;}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#222;background:white;}.pg{width:279mm;padding:12mm 16mm 10mm 16mm;page-break-after:always;}.pg:last-child{page-break-after:avoid;}.hdr{display:flex;justify-content:space-between;align-items:center;padding-bottom:7px;border-bottom:2px solid #e5e7eb;margin-bottom:10px;}.hdr-logo{height:34px;width:auto;display:block;}.hdr-info{text-align:right;font-size:7.5pt;color:#555;line-height:1.7;}.ftr{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:7px;border-top:2px solid #e5e7eb;}.ftr-logo{height:38px;width:auto;display:block;}.ftr-pg{font-size:8pt;color:#9ca3af;}.cover{padding:16mm 16mm 10mm 16mm;}.cover-logo{height:52px;width:auto;display:block;margin-bottom:36px;}.cover-title{font-size:24pt;font-weight:900;color:#111;line-height:1.25;margin-bottom:10px;}.cover-sub{font-size:10pt;color:#555;line-height:1.6;margin-bottom:28px;}.cover-table{border-top:3px solid #111;border-bottom:3px solid #111;padding:14px 0;}.cover-row{display:flex;margin-bottom:5px;font-size:10pt;}.cover-lbl{font-weight:700;width:180px;flex-shrink:0;}.cover-val{color:#333;}.badge{font-size:7.5pt;font-weight:700;padding:2px 9px;border-radius:20px;border:1px solid;display:inline-block;}.b-alta{background:#fef2f2;color:#dc2626;border-color:#fecaca;}.b-normal{background:#fffbeb;color:#d97706;border-color:#fde68a;}.b-baja{background:#f0fdf4;color:#16a34a;border-color:#bbf7d0;}.badge-ap{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;padding:2px 10px;border-radius:20px;font-size:7.5pt;font-weight:700;display:inline-block;}.badge-no{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:2px 10px;border-radius:20px;font-size:7.5pt;font-weight:700;display:inline-block;}.sec-lbl{font-weight:700;font-size:8.5pt;color:#374151;margin-top:7px;margin-bottom:3px;}.item-line{font-size:8.5pt;color:#444;line-height:1.6;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}`;

const pdfHdr=(nEl:number,label:string)=>`<div class="hdr"><img class="hdr-logo" src="${LOGO_ICON_URI}" alt="Electrizar"/><div class="hdr-info"><b>Empresa:</b> ${CO.nombre} &nbsp; <b>Dirección:</b> ${CO.dir}<br/><b>Teléfono:</b> ${CO.tel} &nbsp; <b>N.º de ${label}:</b> ${nEl}<br/><b>Correo electrónico:</b> ${CO.correo}</div></div>`;
const pdfFtr=(p:number,t:number)=>`<div class="ftr"><img class="ftr-logo" src="${LOGO_FULL_URI}" alt="Electrizar Electromecánica"/><div class="ftr-pg">página ${p} de ${t}</div></div>`;
const openPDF=(html:string)=>{const w=window.open("","_blank");if(!w){alert("Permite ventanas emergentes.");return;}w.document.write(html);w.document.close();w.onload=()=>{w.focus();setTimeout(()=>w.print(),500);};};

/* ══ PDF ELÉCTRICO ══ */
const generatePDFElectrico=(informe:any)=>{
  const nEl=informe.elementos?.length||0,totalPags=nEl+3,tipoLabel=informe.tipo==="inspeccion"?"Inspección":"Verificación",hdr=pdfHdr(nEl,"elementos");
  const css=PDF_CSS_BASE+`.lim h2{font-size:12pt;font-weight:900;margin-bottom:12px;}.lim p{font-size:8.5pt;line-height:1.65;color:#444;margin-bottom:9px;}.el-row{display:flex;gap:16px;}.el-photo{width:210px;height:210px;object-fit:cover;border-radius:7px;border:1px solid #e5e7eb;flex-shrink:0;display:block;}.el-empty{width:210px;height:210px;background:#f3f4f6;border-radius:7px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:28pt;color:#d1d5db;}.el-num{font-size:7pt;color:#bbb;text-align:right;margin-top:3px;}.el-text{flex:1;min-width:0;}.el-title-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}.el-title{font-weight:900;font-size:10.5pt;color:#111;}.close h2{font-size:13pt;font-weight:900;margin-bottom:12px;}.close-row{font-size:10pt;line-height:2;color:#333;}.sig-line{border-bottom:2px solid #aaa;width:200px;margin-top:40px;margin-bottom:8px;}`;
  const portada=`<div class="pg cover"><img class="cover-logo" src="${LOGO_ICON_URI}" alt="Electrizar"/><div class="cover-title">${informe.codigo} — Informe ${tipoLabel} Eléctrica</div><div class="cover-sub">Informe fotográfico con resumen de hallazgos y acciones requeridas para la ${tipoLabel} Eléctrica.</div><div class="cover-table"><div class="cover-row"><div class="cover-lbl">Propietario:</div><div class="cover-val">${informe.propietario}</div></div><div class="cover-row"><div class="cover-lbl">Dirección:</div><div class="cover-val">${informe.direccion||"—"}</div></div><div class="cover-row"><div class="cover-lbl">Fecha:</div><div class="cover-val">${fmtFecha(informe.fecha)}</div></div><div class="cover-row"><div class="cover-lbl">Versión:</div><div class="cover-val">0.1V</div></div>${informe.ingeniero?`<div class="cover-row"><div class="cover-lbl">Responsable:</div><div class="cover-val">${informe.ingeniero}${informe.matricula?". "+informe.matricula+".":""}</div></div>`:""}<div class="cover-row"><div class="cover-lbl">Cumplimiento:</div><div class="cover-val" style="font-weight:700;color:${calcCumplimiento(informe.elementos||[])>=80?"#16a34a":calcCumplimiento(informe.elementos||[])>=50?"#d97706":"#dc2626"}">${calcCumplimiento(informe.elementos||[])}%</div></div></div>${pdfFtr(1,totalPags)}</div>`;
  const limitaciones=`<div class="pg">${hdr}<div class="lim"><h2>Análisis y Limitaciones del presente informe fotográfico:</h2><p>El presente informe documenta las no conformidades identificadas durante la verificación visual de las instalaciones eléctricas, conforme al artículo 5.2 del RTCR 458:2011, Decreto Ejecutivo N.° 36979-MEIC. La evaluación se realiza con base en el Anexo B para condiciones de "Peligro Inminente" o "Alto Riesgo", complementadas con las referencias del Código Eléctrico NFPA 70 (NEC), edición 2020.</p><p>Los hallazgos se sustentan en la evidencia visible recopilada al momento de la inspección y deben interpretarse como referencia técnica, no como delimitación absoluta del alcance correctivo. Toda condición adicional que represente incumplimiento deberá ser corregida igualmente.</p><p>No se contó con planos eléctricos actualizados inscritos ante el CFIA ni documentación técnica suficiente para validar integralmente el sistema eléctrico existente.</p></div>${pdfFtr(2,totalPags)}</div>`;
  const elPags=(informe.elementos||[]).map((el:any,i:number)=>{
    const bc=el.prioridad==="alta"?"b-alta":el.prioridad==="baja"?"b-baja":"b-normal",bl=el.prioridad==="alta"?"Alta":el.prioridad==="baja"?"Baja":"Normal";
    const img=el.url?`<img class="el-photo" src="${el.url}" alt="${el.titulo}"/>`:`<div class="el-empty">📷</div>`;
    const hh=(el.hallazgos||[]).map((h:string)=>`<div class="item-line">- ${h}</div>`).join("")||`<div class="item-line" style="color:#aaa">Sin hallazgos.</div>`;
    const aa=(el.acciones||[]).map((a:string)=>`<div class="item-line">- ${a}</div>`).join("")||`<div class="item-line" style="color:#aaa">Sin acciones.</div>`;
    const nn=(el.notas||[]).map((n:string)=>`<div class="item-line">📝 ${n}</div>`).join("");
    return `<div class="pg">${hdr}<div class="el-row"><div><div style="flex-shrink:0">${img}</div><div class="el-num">(${el.num})</div></div><div class="el-text"><div class="el-title-row"><span class="el-title">Título: ${el.titulo}</span><span class="badge ${bc}">${bl}</span></div><div class="sec-lbl">Hallazgos:</div>${hh}<div class="sec-lbl">Acciones requeridas:</div>${aa}${nn?`<div class="sec-lbl">Notas técnicas:</div>${nn}`:""}</div></div>${pdfFtr(i+3,totalPags)}</div>`;
  }).join("");
  const plazoH=informe.tipo!=="inspeccion"&&informe.plazo&&informe.plazo!=="N/A"?`<div><b>Plazo para ejecución de mejoras:</b> ${informe.plazo}.</div>`:"";
  const notasH=informe.notas?`<div><b>Notas adicionales:</b><br/>${informe.notas}</div>`:"";
  const cierre=`<div class="pg">${hdr}<div class="close"><h2>Final de Reporte</h2><div class="close-row"><div><b>Resultado de ${tipoLabel.toLowerCase()}:</b> ${informe.resultado}.</div>${plazoH}${notasH}</div>${informe.firmaUrl?`<div style="margin-top:20px"><img src="${informe.firmaUrl}" style="max-height:80px;max-width:240px;object-fit:contain;display:block"/></div>`:""}${informe.ingeniero?`<div class="sig-line"></div><div style="font-size:10pt;font-weight:700">${informe.ingeniero}</div><div style="font-size:9pt;color:#555">${informe.matricula||""}</div>`:""}</div>${pdfFtr(totalPags,totalPags)}</div>`;
  openPDF(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>${informe.codigo}</title><style>${css}</style></head><body>${portada}${limitaciones}${elPags}${cierre}</body></html>`);
};


/* ══ PDF RESUMEN EJECUTIVO ══ */
const generateResumenEjecutivo=(informe:any)=>{
  const nEl=informe.elementos?.length||0,tipoLabel=informe.tipo==="inspeccion"?"Inspección":"Verificación";
  const cumpl=calcCumplimiento(informe.elementos||[]);
  const alta=(informe.elementos||[]).filter((e:any)=>e.prioridad==="alta").length;
  const normal=(informe.elementos||[]).filter((e:any)=>e.prioridad==="normal").length;
  const baja=(informe.elementos||[]).filter((e:any)=>e.prioridad==="baja").length;
  const css=PDF_CSS_BASE+`.tbl{width:100%;border-collapse:collapse;margin-top:12px;font-size:8.5pt;}.tbl th{background:#F5A800;color:white;font-weight:700;padding:7px 10px;text-align:left;}.tbl td{padding:6px 10px;border-bottom:1px solid #f3f4f6;}.tbl tr:nth-child(even) td{background:#fafafa;}.stat-row{display:flex;gap:12px;margin-top:14px;}.stat-box{flex:1;border:2px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;}.stat-num{font-size:18pt;font-weight:900;}.stat-lbl{font-size:7pt;color:#666;margin-top:2px;}.cumpl-bar{height:12px;background:#e5e7eb;border-radius:6px;overflow:hidden;margin-top:6px;}.cumpl-fill{height:100%;border-radius:6px;}.result-box{border-radius:12px;padding:14px 18px;margin-top:14px;}.result-lbl{font-size:8.5pt;font-weight:700;color:#555;margin-bottom:4px;}.result-val{font-size:16pt;font-weight:900;}`;
  const rColor=informe.resultado==="Aprobada"?"#16a34a":informe.resultado==="Condicionada"?"#d97706":"#dc2626";
  const rBg=informe.resultado==="Aprobada"?"#f0fdf4":informe.resultado==="Condicionada"?"#fffbeb":"#fef2f2";
  const filas=(informe.elementos||[]).map((el:any,i:number)=>{
    const bc=el.prioridad==="alta"?"color:#dc2626":el.prioridad==="baja"?"color:#16a34a":"color:#d97706";
    return`<tr><td style="font-weight:700">(${i+1})</td><td>${el.titulo}</td><td style="${bc};font-weight:700">${el.prioridad==="alta"?"Alta":el.prioridad==="baja"?"Baja":"Normal"}</td><td>${(el.hallazgos||[]).length}</td></tr>`;
  }).join("");
  const hdr=pdfHdr(nEl,"elementos");
  const portada=`<div class="pg cover"><img class="cover-logo" src="${LOGO_ICON_URI}" alt="Electrizar"/><div class="cover-title">Resumen Ejecutivo — ${tipoLabel} Eléctrica</div><div class="cover-sub">${informe.codigo} · ${informe.propietario}</div><div class="cover-table"><div class="cover-row"><div class="cover-lbl">Cliente:</div><div class="cover-val">${informe.propietario}</div></div><div class="cover-row"><div class="cover-lbl">Dirección:</div><div class="cover-val">${informe.direccion||"—"}</div></div><div class="cover-row"><div class="cover-lbl">Fecha:</div><div class="cover-val">${fmtFecha(informe.fecha)}</div></div>${informe.ingeniero?`<div class="cover-row"><div class="cover-lbl">Responsable:</div><div class="cover-val">${informe.ingeniero}${informe.matricula?". "+informe.matricula:""}.</div></div>`:""}</div><div class="result-box" style="background:${rBg};margin-top:20px;"><div class="result-lbl">Resultado de ${tipoLabel.toLowerCase()}</div><div class="result-val" style="color:${rColor}">${informe.resultado||"En curso"}</div>${informe.plazo&&informe.plazo!=="N/A"?`<div style="font-size:8pt;color:#555;margin-top:4px">Plazo: ${informe.plazo}</div>`:""}</div><div class="stat-row"><div class="stat-box"><div class="stat-num">${nEl}</div><div class="stat-lbl">Total elementos</div></div><div class="stat-box"><div class="stat-num" style="color:#dc2626">${alta}</div><div class="stat-lbl">Alta prioridad</div></div><div class="stat-box"><div class="stat-num" style="color:#d97706">${normal}</div><div class="stat-lbl">Normal</div></div><div class="stat-box"><div class="stat-num" style="color:#16a34a">${baja}</div><div class="stat-lbl">Baja</div></div><div class="stat-box"><div class="stat-num" style="color:${cumpl>=80?"#16a34a":cumpl>=50?"#d97706":"#dc2626"}">${cumpl}%</div><div class="stat-lbl">Cumplimiento</div></div></div>${pdfFtr(1,2)}</div>`;
  const resumen=`<div class="pg">${hdr}<div style="font-size:12pt;font-weight:900;margin-bottom:10px;">Resumen de Elementos</div><table class="tbl"><thead><tr><th>#</th><th>Elemento</th><th>Prioridad</th><th>Hallazgos</th></tr></thead><tbody>${filas}</tbody></table>${informe.notas?`<div class="sec-lbl" style="margin-top:14px">Notas:</div><div class="item-line">${informe.notas}</div>`:""}<div class="stat-row" style="margin-top:14px"><div class="stat-box"><div style="font-size:10pt;font-weight:700;margin-bottom:4px">Cumplimiento estimado</div><div class="cumpl-bar"><div class="cumpl-fill" style="width:${cumpl}%;background:${cumpl>=80?"#16a34a":cumpl>=50?"#d97706":"#dc2626"}"></div></div><div style="font-size:9pt;text-align:right;margin-top:4px;color:#555">${cumpl}%</div></div></div>${pdfFtr(2,2)}</div>`;
  openPDF(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Resumen ${informe.codigo}</title><style>${css}</style></head><body>${portada}${resumen}</body></html>`);
};

/* ══ PDF AC ══ */
const generatePDFAC=(informe:any)=>{
  const equipos=informe.equipos||[],nEq=equipos.length,totalPags=nEq+2,hdr=pdfHdr(nEq,"equipos");
  const css=PDF_CSS_BASE+`.res-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:8.5pt;}.res-table th{background:#F5A800;color:white;font-weight:700;padding:7px 10px;text-align:left;}.res-table td{padding:6px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;}.res-table tr:nth-child(even) td{background:#fafafa;}.sum-row{display:flex;gap:14px;margin-top:14px;}.sum-box{flex:1;border:2px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center;}.sum-num{font-size:20pt;font-weight:900;}.sum-lbl{font-size:7.5pt;color:#666;margin-top:2px;}.eq-title-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;}.eq-title{font-size:12pt;font-weight:900;color:#111;}.foto-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px;}.foto-cell{display:flex;flex-direction:column;gap:3px;}.foto-lbl{font-size:7pt;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.03em;}.foto-img{width:100%;height:150px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;display:block;}.foto-empty{width:100%;height:150px;background:#f3f4f6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18pt;color:#d1d5db;}`;
  const portada=`<div class="pg cover"><img class="cover-logo" src="${LOGO_ICON_URI}" alt="Electrizar"/><div class="cover-title">Informe de Mantenimiento de Aires Acondicionados</div><div class="cover-sub">Informe del mantenimiento preventivo para los equipos de aire acondicionado en ${informe.propietario}.</div><div class="cover-table"><div class="cover-row"><div class="cover-lbl">Cliente:</div><div class="cover-val">${informe.propietario}</div></div><div class="cover-row"><div class="cover-lbl">Dirección:</div><div class="cover-val">${informe.direccion||"—"}</div></div><div class="cover-row"><div class="cover-lbl">Código:</div><div class="cover-val">${informe.codigo}</div></div><div class="cover-row"><div class="cover-lbl">Fecha:</div><div class="cover-val">${fmtFecha(informe.fecha)}</div></div><div class="cover-row"><div class="cover-lbl">Versión:</div><div class="cover-val">0.1V</div></div>${informe.tecnico?`<div class="cover-row"><div class="cover-lbl">Técnico responsable:</div><div class="cover-val">${informe.tecnico}</div></div>`:""}</div>${pdfFtr(1,totalPags)}</div>`;
  const ap=equipos.filter((e:any)=>e.resultado==="Aprobado").length,noAp=equipos.filter((e:any)=>e.resultado==="No Aprobado").length;
  const filas=equipos.map((eq:any,i:number)=>`<tr><td style="font-weight:700">(${i+1})</td><td>${eq.nombre}</td><td>${eq.ubicacion||"—"}</td><td><span class="${eq.resultado==="Aprobado"?"badge-ap":"badge-no"}">${eq.resultado||"Pendiente"}</span></td></tr>`).join("");
  const resumen=`<div class="pg">${hdr}<div style="font-size:13pt;font-weight:900;margin-bottom:10px;">Resumen General</div><div style="font-size:9pt;color:#555;margin-bottom:8px;">Mantenimiento preventivo realizado el ${fmtFecha(informe.fecha)} por ${informe.tecnico||"técnico de campo"}. Se revisaron <b>${nEq} equipo${nEq!==1?"s":""}</b> de aire acondicionado.</div><table class="res-table"><thead><tr><th>#</th><th>Equipo</th><th>Ubicación</th><th>Resultado</th></tr></thead><tbody>${filas}</tbody></table><div class="sum-row"><div class="sum-box"><div class="sum-num" style="color:#111">${nEq}</div><div class="sum-lbl">Total equipos</div></div><div class="sum-box"><div class="sum-num" style="color:#16a34a">${ap}</div><div class="sum-lbl">Aprobados</div></div><div class="sum-box"><div class="sum-num" style="color:#dc2626">${noAp}</div><div class="sum-lbl">No Aprobados</div></div></div>${pdfFtr(2,totalPags)}</div>`;
  const eqPags=equipos.map((eq:any,i:number)=>{
    const foto=(key:string,label:string,icon:string)=>{const src=eq.fotos?.[key];return`<div class="foto-cell"><div class="foto-lbl">${icon} ${label}</div>${src?`<img class="foto-img" src="${src}" alt="${label}"/>`:`<div class="foto-empty">📷</div>`}</div>`;};
    const acHTML=(eq.acciones||[]).map((a:string)=>`<div class="item-line">- ${a}</div>`).join("")||`<div class="item-line" style="color:#aaa">Sin acciones.</div>`;
    return`<div class="pg">${hdr}<div class="eq-title-row"><div class="eq-title">(${i+1}) ${eq.nombre}</div><span class="${eq.resultado==="Aprobado"?"badge-ap":"badge-no"}">${eq.resultado||"Pendiente"}</span>${eq.ubicacion?`<span style="font-size:8pt;color:#888">📍 ${eq.ubicacion}</span>`:""}</div><div class="foto-grid">${foto("evaporadora","Limpieza de evaporadora","❄️")}${foto("condensadora","Limpieza de condensadora","💧")}${foto("tuberia","Estado de tubería y aislante","🔧")}${foto("presiones","Nivel de presión de refrigerante","🔵")}</div>${eq.resultado==="No Aprobado"?`<div class="sec-lbl">Acciones realizadas / requeridas:</div>${acHTML}`:""}${eq.observaciones?`<div class="sec-lbl">Observaciones:</div><div class="item-line">${eq.observaciones}</div>`:""} ${pdfFtr(i+3,totalPags)}</div>`;
  }).join("");
  openPDF(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>${informe.codigo}</title><style>${css}</style></head><body>${portada}${resumen}${eqPags}</body></html>`);
};

/* ══ WORD helpers ══ */
const CW=13248,MG=1296;
const NONE_B={style:BorderStyle.NONE,size:0,color:"FFFFFF"};
const PP={page:{size:{width:12240,height:15840,orientation:PageOrientation.LANDSCAPE},margin:{top:MG,right:MG,bottom:MG,left:MG}}};
const wCell=(ch:any[],w:number,ex:any={})=>new TableCell({width:{size:w,type:WidthType.DXA},borders:{top:NONE_B,bottom:NONE_B,left:NONE_B,right:NONE_B},margins:{top:60,bottom:60,left:80,right:80},verticalAlign:VerticalAlign.CENTER,...ex,children:ch});
const wTbl=(rows:any[],cols:number[])=>new Table({width:{size:CW,type:WidthType.DXA},columnWidths:cols,borders:{top:NONE_B,bottom:NONE_B,left:NONE_B,right:NONE_B,insideHorizontal:NONE_B,insideVertical:NONE_B},rows});
const wp=(k:any[],o:any={})=>new Paragraph({children:k,...o});
const wt=(text:string,o:any={})=>new TextRun({text,font:"Arial",...o});
const wsp=(pt=8)=>wp([wt("")],{spacing:{before:pt*20,after:0}});
const wpb=()=>wp([new PageBreak()]);
const wImg=(b64:string,type:any,w:number,h:number,title="img")=>new ImageRun({type,data:b64,transformation:{width:w,height:h},altText:{title,description:title,name:title}});
const wBadge=(prio:string)=>{const cfg:Record<string,string>={alta:"DC2626",normal:"D97706",baja:"16A34A"};const lbl:Record<string,string>={alta:"ALTA",normal:"NORMAL",baja:"BAJA"};return wt(`  [${lbl[prio]||"NORMAL"}]`,{color:cfg[prio]||"D97706",bold:true,size:18,font:"Arial"});};
const b64s=(uri:string)=>uri?uri.split(",")[1]:"";
const itype=(uri:string):any=>uri?.startsWith("data:image/png")?"png":"jpeg";
const wHdr=(nEl:number,label:string)=>new Header({children:[wTbl([new TableRow({children:[wCell([wp([wImg(LOGO_ICON_B64,"jpeg",44,44,"logo")])],560),wCell([wp([wt(`Empresa: ${CO.nombre}   Dirección: ${CO.dir}`,{size:15,color:"555555"})],{alignment:AlignmentType.RIGHT}),wp([wt(`Teléfono: ${CO.tel}   N.º de ${label}: ${nEl}   Correo: ${CO.correo}`,{size:15,color:"555555"})],{alignment:AlignmentType.RIGHT,border:{bottom:{style:BorderStyle.SINGLE,size:4,color:"E5E7EB"}}})],CW-560)]})],[560,CW-560])]});
const wFtr=()=>new Footer({children:[wp([wt("")],{border:{top:{style:BorderStyle.SINGLE,size:4,color:"E5E7EB"}},spacing:{before:0,after:80}}),wTbl([new TableRow({children:[wCell([wp([wImg(LOGO_FULL_B64,"png",120,40,"logofull")])],2000),wCell([wp([wt("Electrizar Electromecánica | Informe generado electrónicamente",{size:14,color:"9CA3AF"})],{alignment:AlignmentType.RIGHT})],CW-2000)]})],[2000,CW-2000])]});
const wDownload=async(docx:any,codigo:string)=>{const blob=await Packer.toBlob(docx);const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${codigo}.docx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};
const wCover=(title:string,sub:string,rows:[string,string][])=>[wsp(20),wp([wImg(LOGO_ICON_B64,"jpeg",58,58,"logo")]),wsp(28),wp([wt(title,{bold:true,size:52})],{spacing:{before:0,after:180}}),wp([wt(sub,{size:22,color:"555555"})],{spacing:{before:0,after:480},border:{bottom:{style:BorderStyle.SINGLE,size:8,color:"111111"}}}),wsp(16),...rows.map(([lbl,val])=>wp([wt(`${lbl}: `,{bold:true,size:22}),wt(val,{size:22,color:"333333"})],{spacing:{before:100,after:0}})),wsp(12),wp([wt("")],{border:{bottom:{style:BorderStyle.SINGLE,size:8,color:"111111"}}}),wpb()];

/* ══ WORD ELÉCTRICO ══ */
const generateWordElectrico=async(informe:any)=>{
  const nEl=informe.elementos?.length||0,elementos=informe.elementos||[];
  const tipoLabel=informe.tipo==="inspeccion"?"Inspección":"Verificación";
  const cover=wCover(`${informe.codigo} — Informe ${tipoLabel} Eléctrica`,"Informe fotográfico con resumen de hallazgos y acciones requeridas.",[["Propietario",informe.propietario],["Dirección",informe.direccion||"—"],["Fecha",fmtFecha(informe.fecha)],["Versión","0.1V"],...(informe.ingeniero?[["Responsable",`${informe.ingeniero}${informe.matricula?". "+informe.matricula+".":""}`] as [string,string]]:[])]);
  const lims=[wp([wt("Análisis y Limitaciones del presente informe fotográfico:",{bold:true,size:26})],{spacing:{before:0,after:200}}),wp([wt("El presente informe documenta las no conformidades identificadas durante la verificación visual, conforme al artículo 5.2 del RTCR 458:2011, Decreto N.° 36979-MEIC. La evaluación se realiza con base en el Anexo B y las referencias del Código Eléctrico NFPA 70 (NEC), edición 2020.",{size:18,color:"444444"})],{spacing:{before:0,after:140}}),wp([wt("Los hallazgos se sustentan en la evidencia visible y deben interpretarse como referencia técnica, no como delimitación absoluta. Toda condición adicional que represente incumplimiento deberá ser corregida igualmente.",{size:18,color:"444444"})],{spacing:{before:0,after:0}}),wpb()];
  const elPages:any[]=[];
  for(const el of elementos){
    const pB64=el.url?b64s(el.url):null;
    const hh=(el.hallazgos||[]).map((h:string)=>wp([wt(`• ${h}`,{size:18,color:"444444"})],{spacing:{before:60,after:0}}));
    const aa=(el.acciones||[]).map((a:string)=>wp([wt(`• ${a}`,{size:18,color:"444444"})],{spacing:{before:60,after:0}}));
    elPages.push(wTbl([new TableRow({children:[wCell(pB64?[wp([wImg(pB64,itype(el.url),210,210,el.titulo)]),wp([wt(`(${el.num})`,{size:14,color:"BBBBBB"})])]:[wp([wt("Sin foto",{size:18,color:"CCCCCC"})])],3300),wCell([wp([wt(`Título: ${el.titulo}`,{bold:true,size:22}),wBadge(el.prioridad)],{spacing:{before:0,after:160}}),wp([wt("Hallazgos:",{bold:true,size:20,color:"374151"})],{spacing:{before:0,after:60}}),...(hh.length?hh:[wp([wt("Sin hallazgos.",{size:18,color:"AAAAAA"})])]),wsp(8),wp([wt("Acciones requeridas:",{bold:true,size:20,color:"374151"})],{spacing:{before:0,after:60}}),...(aa.length?aa:[wp([wt("Sin acciones.",{size:18,color:"AAAAAA"})])])],CW-3300)]})],[3300,CW-3300]));
    elPages.push(wpb());
  }
  const rC=informe.resultado==="Aprobada"?"16A34A":informe.resultado==="Condicionada"?"D97706":"DC2626";
  const cierre=[wp([wt("Final de Reporte",{bold:true,size:28})],{spacing:{before:0,after:240}}),wp([wt(`Resultado de ${tipoLabel.toLowerCase()}: `,{bold:true,size:22}),wt(informe.resultado||"—",{bold:true,size:22,color:rC})],{spacing:{before:0,after:160}}),...(informe.tipo!=="inspeccion"&&informe.plazo&&informe.plazo!=="N/A"?[wp([wt(`Plazo para ejecución de mejoras: ${informe.plazo}.`,{size:22,color:"333333"})],{spacing:{before:0,after:160}})]:[]),...(informe.notas?[wp([wt(`Notas: ${informe.notas}`,{size:22,color:"333333"})],{spacing:{before:0,after:160}})]:[]),...(informe.ingeniero?[wp([wt("_".repeat(40),{color:"CCCCCC"})],{spacing:{before:720,after:120}}),wp([wt(informe.ingeniero,{bold:true,size:22})]),wp([wt(informe.matricula||"",{size:18,color:"555555"})])]:[])];
  const docx=new Document({styles:{default:{document:{run:{font:"Arial",size:20}}}},sections:[{properties:{...PP,titlePage:true} as any,headers:{first:new Header({children:[]})},footers:{first:new Footer({children:[]})},children:cover},{properties:PP as any,headers:{default:wHdr(nEl,"elementos")},footers:{default:wFtr()},children:[...lims,...elPages,...cierre]}]});
  await wDownload(docx,informe.codigo);
};

/* ══ WORD AC ══ */
const generateWordAC=async(informe:any)=>{
  const equipos=informe.equipos||[],nEq=equipos.length;
  const cover=wCover("Informe de Mantenimiento de Aires Acondicionados",`Informe del mantenimiento preventivo para ${informe.propietario}.`,[["Cliente",informe.propietario],["Dirección",informe.direccion||"—"],["Código",informe.codigo],["Fecha",fmtFecha(informe.fecha)],["Versión","0.1V"],...(informe.tecnico?[["Técnico responsable",informe.tecnico] as [string,string]]:[])]);
  const ap=equipos.filter((e:any)=>e.resultado==="Aprobado").length,noAp=equipos.filter((e:any)=>e.resultado==="No Aprobado").length;
  const YSDF={fill:"FFF7E6",type:ShadingType.CLEAR,color:"auto"};
  const cw4=[1300,5200,4200,CW-10700];
  const mkHdr=(txt:string)=>new TableCell({width:{size:cw4[["#","Equipo","Ubicación","Resultado"].indexOf(txt)]||cw4[3],type:WidthType.DXA},shading:YSDF,margins:{top:80,bottom:80,left:100,right:100},children:[wp([wt(txt,{bold:true,size:18})])]});
  const summaryTable=new Table({width:{size:CW,type:WidthType.DXA},columnWidths:cw4,borders:{top:{style:BorderStyle.SINGLE,size:4,color:"E5E7EB"},bottom:{style:BorderStyle.SINGLE,size:4,color:"E5E7EB"},left:NONE_B,right:NONE_B,insideHorizontal:{style:BorderStyle.SINGLE,size:2,color:"F3F4F6"},insideVertical:NONE_B},rows:[new TableRow({children:[mkHdr("#"),mkHdr("Equipo"),mkHdr("Ubicación"),mkHdr("Resultado")]}),...equipos.map((eq:any,i:number)=>new TableRow({children:[new TableCell({width:{size:cw4[0],type:WidthType.DXA},margins:{top:80,bottom:80,left:100,right:100},children:[wp([wt(`(${i+1})`,{size:18,color:"555555"})],{alignment:AlignmentType.CENTER})]}),new TableCell({width:{size:cw4[1],type:WidthType.DXA},margins:{top:80,bottom:80,left:100,right:100},children:[wp([wt(eq.nombre,{size:18})])]}),new TableCell({width:{size:cw4[2],type:WidthType.DXA},margins:{top:80,bottom:80,left:100,right:100},children:[wp([wt(eq.ubicacion||"—",{size:18,color:"555555"})])]}),new TableCell({width:{size:cw4[3],type:WidthType.DXA},margins:{top:80,bottom:80,left:100,right:100},children:[wp([wt(eq.resultado||"Pendiente",{size:18,bold:true,color:eq.resultado==="Aprobado"?"16A34A":"DC2626"})])]})]}))]});
  const cw3=Math.floor(CW/3);
  const statsRow=wTbl([new TableRow({children:[wCell([wp([wt(`${nEq}`,{bold:true,size:48})],{alignment:AlignmentType.CENTER}),wp([wt("Total equipos",{size:16,color:"666666"})],{alignment:AlignmentType.CENTER})],cw3),wCell([wp([wt(`${ap}`,{bold:true,size:48,color:"16A34A"})],{alignment:AlignmentType.CENTER}),wp([wt("Aprobados",{size:16,color:"666666"})],{alignment:AlignmentType.CENTER})],cw3),wCell([wp([wt(`${noAp}`,{bold:true,size:48,color:"DC2626"})],{alignment:AlignmentType.CENTER}),wp([wt("No Aprobados",{size:16,color:"666666"})],{alignment:AlignmentType.CENTER})],CW-cw3*2)]})],[cw3,cw3,CW-cw3*2]);
  const resumen=[wp([wt("Resumen General",{bold:true,size:28})],{spacing:{before:0,after:160}}),wp([wt(`Mantenimiento preventivo realizado el ${fmtFecha(informe.fecha)} por ${informe.tecnico||"técnico de campo"}. Se revisaron ${nEq} equipo${nEq!==1?"s":""} de aire acondicionado.`,{size:18,color:"555555"})],{spacing:{before:0,after:200}}),summaryTable,wsp(20),statsRow,wpb()];
  const AC_KEYS=[{key:"evaporadora",label:"Limpieza de evaporadora",icon:"❄"},{key:"condensadora",label:"Limpieza de condensadora",icon:"💧"},{key:"tuberia",label:"Estado de tubería y aislante",icon:"🔧"},{key:"presiones",label:"Nivel de presión de refrigerante",icon:"🔵"}];
  const eqPages:any[]=[];
  for(const[idx,eq] of equipos.entries()){
    const rC=eq.resultado==="Aprobado"?"16A34A":"DC2626";
    eqPages.push(wp([wt(`(${idx+1}) ${eq.nombre}`,{bold:true,size:26}),wt(`  [${eq.resultado||"Pendiente"}]`,{bold:true,size:22,color:rC}),...(eq.ubicacion?[wt(`  📍 ${eq.ubicacion}`,{size:18,color:"888888"})]:[])],{spacing:{before:0,after:180}}));
    const colW=Math.floor(CW/4);
    const photoCols=AC_KEYS.map(f=>{const src=eq.fotos?.[f.key];return wCell([wp([wt(`${f.icon} ${f.label}`,{bold:true,size:16,color:"555555"})],{spacing:{before:0,after:80}}),src?wp([wImg(b64s(src),itype(src),192,155,f.label)]):wp([wt("Sin foto",{size:16,color:"CCCCCC"})])],colW);});
    eqPages.push(wTbl([new TableRow({children:photoCols})],[colW,colW,colW,CW-colW*3]));
    if(eq.resultado==="No Aprobado"&&eq.acciones?.length){eqPages.push(wsp(8));eqPages.push(wp([wt("Acciones realizadas / requeridas:",{bold:true,size:20,color:"374151"})],{spacing:{before:0,after:80}}));for(const a of eq.acciones)eqPages.push(wp([wt(`• ${a}`,{size:18,color:"444444"})],{spacing:{before:40,after:0}}));}
    if(eq.observaciones){eqPages.push(wsp(8));eqPages.push(wp([wt("Observaciones:",{bold:true,size:20,color:"374151"})],{spacing:{before:0,after:80}}));eqPages.push(wp([wt(eq.observaciones,{size:18,color:"444444"})],{spacing:{before:0,after:0}}));}
    if(idx<equipos.length-1)eqPages.push(wpb());
  }
  const docx=new Document({styles:{default:{document:{run:{font:"Arial",size:20}}}},sections:[{properties:{...PP,titlePage:true} as any,headers:{first:new Header({children:[]})},footers:{first:new Footer({children:[]})},children:cover},{properties:PP as any,headers:{default:wHdr(nEq,"equipos")},footers:{default:wFtr()},children:[...resumen,...eqPages]}]});
  await wDownload(docx,informe.codigo);
};

/* ══ ZIP ══ */
const downloadImagesZip=async(informe:any)=>{
  const zip=new JSZip();const dir=zip.folder(informe.codigo) as JSZip;let total=0;
  if(informe.tipo==="ac"){const labels:Record<string,string>={evaporadora:"evaporadora",condensadora:"condensadora",tuberia:"tuberia_aislante",presiones:"presion_refrigerante"};(informe.equipos||[]).forEach((eq:any,i:number)=>{const base=`equipo_${String(i+1).padStart(2,"0")}_${(eq.nombre||"").replace(/[^a-zA-Z0-9]/g,"_").slice(0,30)}`;Object.keys(labels).forEach(k=>{if(eq.fotos?.[k]){dir.file(`${base}_${labels[k]}.jpg`,b64s(eq.fotos[k]),{base64:true});total++;}});});}
  else{(informe.elementos||[]).forEach((el:any,i:number)=>{if(el.url){dir.file(`elemento_${String(i+1).padStart(2,"0")}_${(el.titulo||"").replace(/[^a-zA-Z0-9]/g,"_").slice(0,40)}.jpg`,b64s(el.url),{base64:true});total++;}});}
  if(!total){alert("No hay imágenes en este informe.");return;}
  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${informe.codigo}_${total}_fotos.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
};

/* ══ UI ATOMS ══ */
const Logo=({sm,white}:{sm?:boolean,white?:boolean})=>(<div className="flex items-center gap-2"><div className={`${sm?"w-7 h-7":"w-10 h-10"} flex items-center justify-center rounded-md flex-shrink-0`} style={{background:Y}}><svg viewBox="0 0 22 22" className={sm?"w-4 h-4":"w-6 h-6"} fill="white"><rect x="2" y="2" width="18" height="3"/><rect x="2" y="8.5" width="11" height="3"/><rect x="2" y="15" width="18" height="3"/><polygon points="14,8.5 18,8.5 15,12.5 19,12.5 12,20 13,13.5 9,13.5"/></svg></div><div><div className={`font-bold leading-tight ${sm?"text-xs":"text-sm"} ${white?"text-white":"text-gray-900"}`}>Electrizar</div><div className={`leading-tight ${sm?"text-[9px]":"text-[10px]"}`} style={{color:Y}}>Constructora Electromecánica</div></div></div>);
const Badge=({v}:{v:string})=>{const p=PRIOS.find(x=>x.v===v)||PRIOS[1];return<span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.tw}`}>{p.L}</span>;};
const ResBadge=({v}:{v?:string})=>{if(!v)return null;const cfg=v==="Aprobada"||v==="Aprobado"?"bg-green-100 text-green-700":v==="Condicionada"?"bg-amber-100 text-amber-700":"bg-red-100 text-red-700";return<span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg}`}>{v}</span>;};
const Pill=({children,active,color,onClick}:any)=>(<button onClick={onClick} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${active?"text-white":"border-gray-200 text-gray-400 bg-white hover:bg-gray-50"}`} style={active?{background:color||Y,borderColor:color||Y}:{}}>{children}</button>);
const Btn=({children,onClick,sm,disabled,full,className=""}:any)=>{const base=`font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 ${sm?"px-3 py-2 text-sm":"px-5 py-3"} ${full?"w-full":""} ${className}`;return<button onClick={onClick} disabled={disabled} className={`${base} ${disabled?"opacity-50 cursor-not-allowed":"hover:opacity-90"}`} style={{background:disabled?"#9ca3af":Y,color:"white"}}>{children}</button>;};
const Card=({title,children,accent}:any)=>(<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">{title&&<div className="px-4 pt-4 pb-2 flex items-center gap-2">{accent&&<div className="w-1 h-4 rounded-full" style={{background:Y}}/>}<h3 className="font-bold text-gray-700 text-xs uppercase tracking-widest">{title}</h3></div>}<div className="px-4 pb-4 space-y-3">{children}</div></div>);
const FI=({label,value,onChange,...rest}:any)=>(<div><label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">{label}</label><input value={value} onChange={onChange} className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:border-amber-400 focus:bg-white transition-all" {...rest}/></div>);
const ListEditor=({label,items,set,placeholder,tipo}:any)=>{const[showPl,setShowPl]=useState(false);return(<div><div className="flex items-center justify-between mb-2"><label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</label><div className="flex gap-1.5"><button onClick={()=>setShowPl(true)} className="text-xs font-bold px-2 py-1 rounded-lg hover:opacity-80" style={{color:"#6366f1",background:"#6366f110"}}>📌</button><button onClick={()=>set([...items,""])} className="text-xs font-bold px-2.5 py-1 rounded-lg hover:opacity-80" style={{color:Y,background:Y+"18"}}>+ Agregar</button></div></div>{showPl&&<PlantillasInline tipo={tipo||label} onSelect={(t:string)=>{set([...items,t]);setShowPl(false);}} onClose={()=>setShowPl(false)} current={items}/>}<div className="space-y-2">{!items.length&&<div className="text-xs text-gray-400 text-center py-3 border-2 border-dashed border-gray-100 rounded-xl">Sin {label.toLowerCase()}</div>}{items.map((h:string,i:number)=>(<div key={i} className="flex gap-2 items-start"><textarea value={h} onChange={(e:any)=>{const c=[...items];c[i]=e.target.value;set(c);}} rows={2} placeholder={placeholder} className="flex-1 border-2 border-gray-100 rounded-xl px-3 py-2 text-sm bg-gray-50 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-all"/><button onClick={()=>set(items.filter((_:any,j:number)=>j!==i))} className="mt-1.5 w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all text-base font-bold">×</button></div>))}</div></div>);};

/* PhotoPicker — Galería / Cámara sin capture fijo */
const PhotoPicker=({inputRef,onChange}:{inputRef:React.RefObject<HTMLInputElement>,onChange:(e:any)=>void})=>(
  <div className="flex gap-2">
    <button onClick={()=>{if(inputRef.current){inputRef.current.removeAttribute("capture");inputRef.current.click();}}} className="flex-1 py-2.5 border-2 border-gray-100 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1.5">🖼️ Galería</button>
    <button onClick={()=>{if(inputRef.current){inputRef.current.setAttribute("capture","environment");inputRef.current.click();}}} className="flex-1 py-2.5 border-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-80" style={{borderColor:Y,color:Y,background:Y+"12"}}>📷 Cámara</button>
    <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange}/>
  </div>
);


/* ══ PLANTILLAS INLINE ══ */
function PlantillasInline({tipo,onSelect,onClose,current}:any){
  const key=`plantillas_${tipo}`;
  const[items,setItems]=useState<string[]>(()=>lsto.get(key)||[]);
  const[nueva,setNueva]=useState("");
  const guardar=()=>{if(!nueva.trim())return;const updated=[...items,nueva.trim()];setItems(updated);lsto.set(key,updated);setNueva("");};
  const borrar=(i:number)=>{const updated=items.filter((_:any,j:number)=>j!==i);setItems(updated);lsto.set(key,updated);};
  return(<div className="mb-3 border-2 border-indigo-100 rounded-xl overflow-hidden">
    <div className="flex items-center justify-between px-3 py-2 bg-indigo-50"><span className="text-xs font-bold text-indigo-700">📌 Plantillas — {tipo}</span><button onClick={onClose} className="text-indigo-400 hover:text-indigo-700 font-bold text-base">✕</button></div>
    <div className="p-3 space-y-1.5 max-h-48 overflow-y-auto">
      {!items.length&&<p className="text-xs text-gray-400 text-center py-2">Sin plantillas. Agrega una abajo.</p>}
      {items.map((t:string,i:number)=>(<div key={i} className="flex gap-2 items-start"><button onClick={()=>onSelect(t)} className="flex-1 text-xs text-left text-gray-700 bg-white border border-gray-100 rounded-lg px-2 py-1.5 hover:border-indigo-300 hover:bg-indigo-50 transition-all">{t}</button><button onClick={()=>borrar(i)} className="text-gray-300 hover:text-red-400 text-base font-bold shrink-0">×</button></div>))}
    </div>
    <div className="flex gap-2 px-3 pb-3"><input value={nueva} onChange={(e:any)=>setNueva(e.target.value)} onKeyDown={(e:any)=>e.key==="Enter"&&guardar()} className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400" placeholder="Nueva plantilla…"/><button onClick={guardar} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{background:"#6366f1"}}>Guardar</button></div>
  </div>);
}

/* ══ FIRMA CANVAS ══ */
function FirmaCanvas({onConfirm,onClose}:any){
  const canvasRef=useRef<HTMLCanvasElement>(null);const[drawing,setDraw]=useState(false);const[hasFirma,setHas]=useState(false);
  const getPos=(e:any)=>{const c=canvasRef.current!;const r=c.getBoundingClientRect();const sx=c.width/r.width,sy=c.height/r.height;let cx,cy;if(e.touches?.length){cx=e.touches[0].clientX;cy=e.touches[0].clientY;}else{cx=e.clientX;cy=e.clientY;}return{x:(cx-r.left)*sx,y:(cy-r.top)*sy};};
  const start=(e:any)=>{if(e.cancelable)e.preventDefault();const c=canvasRef.current!;const ctx=c.getContext("2d")!;const pos=getPos(e);ctx.beginPath();ctx.moveTo(pos.x,pos.y);setDraw(true);setHas(true);};
  const move=(e:any)=>{if(!drawing)return;if(e.cancelable)e.preventDefault();const c=canvasRef.current!;const ctx=c.getContext("2d")!;const pos=getPos(e);ctx.lineWidth=2.5;ctx.lineCap="round";ctx.strokeStyle="#111827";ctx.lineTo(pos.x,pos.y);ctx.stroke();};
  const end=()=>setDraw(false);
  const clear=()=>{const c=canvasRef.current!;c.getContext("2d")!.clearRect(0,0,c.width,c.height);setHas(false);};
  const confirm=()=>{if(!hasFirma){alert("Dibuja tu firma primero.");return;}const c=canvasRef.current!;onConfirm(c.toDataURL("image/png"));};
  return(<div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl"><div className="flex items-center justify-between px-4 py-3 border-b border-gray-100"><span className="font-bold text-gray-800 text-sm">✍️ Firma del Responsable</span><button onClick={onClose} className="text-gray-300 hover:text-gray-600 font-bold text-lg">✕</button></div><div className="p-4"><div className="border-2 border-gray-200 rounded-2xl overflow-hidden bg-gray-50"><canvas ref={canvasRef} width={380} height={180} className="w-full touch-none cursor-crosshair" style={{display:"block"}} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end}/></div><div className="flex items-center justify-center mt-2 mb-4"><div className="h-px bg-gray-300 flex-1"/><span className="text-[10px] text-gray-400 mx-3">Firma aquí</span><div className="h-px bg-gray-300 flex-1"/></div><div className="flex gap-3"><button onClick={clear} className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50">Limpiar</button><button onClick={confirm} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90" style={{background:DARK}}>Confirmar ✓</button></div></div></div></div>);
}

/* ══ DELETE MODAL ══ */
function DeleteModal({informe,onConfirm,onClose}:any){const[loading,setLoad]=useState(false);const handle=async()=>{setLoad(true);await deleteInformeFS(informe.id);onConfirm();};return(<div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"><div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center text-2xl mx-auto mb-4">🗑️</div><h3 className="font-extrabold text-gray-900 text-lg text-center mb-1">¿Eliminar informe?</h3><p className="text-sm text-gray-500 text-center mb-2"><span className="font-mono font-bold text-gray-700">{informe.codigo}</span></p><p className="text-xs text-gray-400 text-center mb-6">{informe.propietario} · {informe.fecha}<br/><span className="text-red-400 font-semibold">Esta acción no se puede deshacer.</span></p><div className="flex gap-3"><button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button><button onClick={handle} disabled={loading} className="flex-1 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-60" style={{background:"#dc2626"}}>{loading?"Eliminando…":"Sí, eliminar"}</button></div></div></div>);}

/* ══ LOGIN ══ */
function LoginView({onLogin}:any){const[user,setU]=useState("");const[pass,setP]=useState("");const[err,setE]=useState<string|null>(null);const[show,setSh]=useState(false);const handle=()=>{const f=USUARIOS.find(u=>u.user===user.trim()&&u.pass===pass);if(!f){setE("Usuario o contraseña incorrectos.");return;}onLogin(f);};return(<div className="min-h-screen flex flex-col items-center justify-center p-6" style={{background:DARK}}><div className="w-full max-w-sm"><div className="flex justify-center mb-8"><div className="bg-white rounded-3xl p-6 shadow-2xl"><Logo/></div></div><h1 className="text-white font-extrabold text-2xl text-center mb-1">Electrizar</h1><p className="text-white/40 text-sm text-center mb-8">Sistema de Informes Técnicos</p><div className="space-y-3"><div><label className="block text-white/50 text-xs font-bold mb-1.5 uppercase tracking-wider">Usuario</label><input value={user} onChange={(e:any)=>{setU(e.target.value);setE(null);}} onKeyDown={(e:any)=>e.key==="Enter"&&handle()} className="w-full bg-white/10 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-amber-400 transition-all" placeholder="amontiel"/></div><div><label className="block text-white/50 text-xs font-bold mb-1.5 uppercase tracking-wider">Contraseña</label><div className="relative"><input value={pass} onChange={(e:any)=>{setP(e.target.value);setE(null);}} onKeyDown={(e:any)=>e.key==="Enter"&&handle()} type={show?"text":"password"} className="w-full bg-white/10 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-amber-400 transition-all" placeholder="••••••••"/><button onClick={()=>setSh((p:boolean)=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs">{show?"Ocultar":"Ver"}</button></div></div>{err&&<div className="bg-red-900/40 border border-red-500/40 rounded-xl px-4 py-2.5 text-red-300 text-xs font-medium">⚠️ {err}</div>}<button onClick={handle} className="w-full py-3.5 rounded-2xl font-extrabold text-gray-900 text-sm hover:opacity-90 active:scale-95 transition-all mt-2" style={{background:Y}}>Entrar →</button></div><p className="text-white/20 text-xs text-center mt-8">📵 Funciona sin conexión · 🔄 Sincroniza automáticamente</p></div></div>);}

/* ══ SELECTOR ══ */
function TipoSelectorView({onSelect,usuario,onLogout}:any){return(<div className="min-h-screen flex flex-col" style={{background:DARK}}><header className="px-4 py-4 flex items-center justify-between"><Logo white/><div className="text-right"><div className="text-white text-xs font-bold">{usuario.nombre}</div><button onClick={onLogout} className="text-white/40 hover:text-white/70 text-[10px]">Cerrar sesión</button></div></header><div className="flex-1 flex flex-col items-center justify-center p-6"><h2 className="text-white font-extrabold text-xl text-center mb-2">¿Qué vas a realizar?</h2><p className="text-white/40 text-sm text-center mb-8">Selecciona el tipo de trabajo</p><div className="w-full max-w-sm space-y-3"><button onClick={()=>onSelect("verificacion")} className="w-full bg-white rounded-2xl p-5 text-left hover:bg-gray-50 active:scale-95 transition-all shadow-xl"><div className="flex items-start gap-4"><div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{background:Y+"22"}}>🔍</div><div><div className="font-extrabold text-gray-900 text-base mb-0.5">Verificación Eléctrica</div><div className="text-xs text-gray-500 leading-relaxed">Resultado: <b>Aprobada</b>, <b>Condicionada</b> o <b>Rechazada</b>. Incluye plazo de mejoras.</div><div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:Y}}>RTCR 458:2011 · NEC 2020</div></div></div></button><button onClick={()=>onSelect("inspeccion")} className="w-full rounded-2xl p-5 text-left hover:opacity-90 active:scale-95 transition-all shadow-xl border-2" style={{background:DARK,borderColor:Y+"60"}}><div className="flex items-start gap-4"><div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{background:Y+"30"}}>⚡</div><div><div className="font-extrabold text-white text-base mb-0.5">Inspección Eléctrica</div><div className="text-xs text-white/60 leading-relaxed">Resultado: <b className="text-white/80">Aprobada</b> o <b className="text-white/80">No Aprobada</b>. Sin plazo de mejoras.</div><div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:Y}}>NEC 2020</div></div></div></button><button onClick={()=>onSelect("ac")} className="w-full rounded-2xl p-5 text-left hover:opacity-90 active:scale-95 transition-all shadow-xl border-2" style={{background:"#0c4a6e",borderColor:"#38bdf8aa"}}><div className="flex items-start gap-4"><div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{background:"#38bdf822"}}>🌡️</div><div><div className="font-extrabold text-white text-base mb-0.5">Mantenimiento de Aires</div><div className="text-xs text-white/60 leading-relaxed">Mantenimiento preventivo de equipos de aire acondicionado. 4 fotos por equipo.</div><div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:"#38bdf8"}}>PREVENTIVO · CORRECTIVO</div></div></div></button><button onClick={()=>onSelect("home")} className="w-full py-3 rounded-xl font-bold text-sm text-white/50 hover:text-white/80 transition-colors">📋 Ver informes existentes</button></div></div></div>);}

/* ══ ANNOTATION EDITOR ══ */
function AnnotationEditor({imageUrl,onConfirm,onClose}:any){
  const canvasRef=useRef<HTMLCanvasElement>(null);const imgRef=useRef(new Image());
  const[tool,setTool]=useState("arrow");const[color,setColor]=useState("#ef4444");
  const[shapes,setShapes]=useState<any[]>([]);const[drawing,setDraw]=useState(false);
  const[startPt,setStart]=useState<any>(null);const[curPt,setCur]=useState<any>(null);
  const[loaded,setLoaded]=useState(false);const[textDlg,setTDlg]=useState<any>(null);const[textVal,setTVal]=useState("");
  useEffect(()=>{const img=imgRef.current;img.onload=()=>{const c=canvasRef.current;if(!c)return;c.width=img.naturalWidth;c.height=img.naturalHeight;setLoaded(true);};img.src=imageUrl;},[imageUrl]);
  const getPos=useCallback((e:any)=>{const c=canvasRef.current;if(!c)return{x:0,y:0};const r=c.getBoundingClientRect();const sx=c.width/r.width,sy=c.height/r.height;let cx,cy;if(e.touches?.length){cx=e.touches[0].clientX;cy=e.touches[0].clientY;}else if(e.changedTouches?.length){cx=e.changedTouches[0].clientX;cy=e.changedTouches[0].clientY;}else{cx=e.clientX;cy=e.clientY;}return{x:(cx-r.left)*sx,y:(cy-r.top)*sy};},[]);
  const drawOne=useCallback((ctx:CanvasRenderingContext2D,s:any)=>{ctx.save();ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineWidth=4;ctx.lineCap="round";ctx.lineJoin="round";if(s.tool==="arrow"){const dx=s.x2-s.x1,dy=s.y2-s.y1,len=Math.sqrt(dx*dx+dy*dy);if(len<6){ctx.restore();return;}const ang=Math.atan2(dy,dx),hl=Math.min(26,len*0.36);ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();ctx.beginPath();ctx.moveTo(s.x2,s.y2);ctx.lineTo(s.x2-hl*Math.cos(ang-Math.PI/6),s.y2-hl*Math.sin(ang-Math.PI/6));ctx.lineTo(s.x2-hl*Math.cos(ang+Math.PI/6),s.y2-hl*Math.sin(ang+Math.PI/6));ctx.closePath();ctx.fill();}else if(s.tool==="circle"){const rx=Math.abs(s.x2-s.x1)/2,ry=Math.abs(s.y2-s.y1)/2;ctx.beginPath();ctx.ellipse((s.x1+s.x2)/2,(s.y1+s.y2)/2,Math.max(rx,4),Math.max(ry,4),0,0,2*Math.PI);ctx.stroke();}else if(s.tool==="rect"){ctx.beginPath();ctx.rect(s.x1,s.y1,s.x2-s.x1,s.y2-s.y1);ctx.stroke();}else if(s.tool==="cross"){const sz=24;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(s.x1-sz,s.y1-sz);ctx.lineTo(s.x1+sz,s.y1+sz);ctx.moveTo(s.x1+sz,s.y1-sz);ctx.lineTo(s.x1-sz,s.y1+sz);ctx.stroke();}else if(s.tool==="text"){const fs=Math.max(18,Math.round((canvasRef.current?.width||900)/20));ctx.font=`bold ${fs}px sans-serif`;ctx.strokeStyle="rgba(0,0,0,0.6)";ctx.lineWidth=3;ctx.strokeText(s.text,s.x1,s.y1);ctx.fillStyle=s.color;ctx.fillText(s.text,s.x1,s.y1);}ctx.restore();},[]);
  const redraw=useCallback(()=>{const c=canvasRef.current;if(!c||!loaded)return;const ctx=c.getContext("2d")!;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(imgRef.current,0,0,c.width,c.height);shapes.forEach(s=>drawOne(ctx,s));if(drawing&&startPt&&curPt&&tool!=="text"&&tool!=="cross")drawOne(ctx,{tool,color,x1:startPt.x,y1:startPt.y,x2:curPt.x,y2:curPt.y});},[loaded,shapes,drawing,startPt,curPt,tool,color,drawOne]);
  useEffect(()=>{redraw();},[redraw]);
  const onDown=useCallback((e:any)=>{if(e.cancelable)e.preventDefault();const pos=getPos(e);if(tool==="cross"){setShapes(p=>[...p,{tool:"cross",color,x1:pos.x,y1:pos.y}]);return;}if(tool==="text"){setTDlg(pos);setTVal("");return;}setDraw(true);setStart(pos);setCur(pos);},[tool,color,getPos]);
  const onMove=useCallback((e:any)=>{if(!drawing)return;if(e.cancelable)e.preventDefault();setCur(getPos(e));},[drawing,getPos]);
  const onUp=useCallback((e:any)=>{if(!drawing||!startPt)return;if(e.cancelable)e.preventDefault();const end=curPt||getPos(e);setShapes(p=>[...p,{tool,color,x1:startPt.x,y1:startPt.y,x2:end.x,y2:end.y}]);setDraw(false);setStart(null);setCur(null);},[drawing,startPt,curPt,tool,color,getPos]);
  const addText=()=>{if(textVal.trim()&&textDlg)setShapes(p=>[...p,{tool:"text",color,x1:textDlg.x,y1:textDlg.y,text:textVal.trim()}]);setTDlg(null);setTVal("");};
  const doConfirm=()=>{const c=canvasRef.current;if(!c)return;const dUrl=c.toDataURL("image/jpeg",0.88);onConfirm(dUrl,dUrl.split(",")[1]);};
  const TOOLS=[{id:"arrow",icon:"↗",L:"Flecha"},{id:"circle",icon:"○",L:"Círculo"},{id:"rect",icon:"□",L:"Rect."},{id:"cross",icon:"✕",L:"Cruz"},{id:"text",icon:"T",L:"Texto"}];
  const COLS=["#ef4444","#F5A800","#ffffff","#22c55e","#3b82f6","#000000"];
  return(<div className="fixed inset-0 z-50 bg-black flex flex-col select-none">
    <div className="flex items-center justify-between px-3 py-2.5 shrink-0" style={{background:DARK}}>
      <button onClick={onClose} className="text-white/50 hover:text-white text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-white/10">✕ Cancelar</button>
      <span className="font-bold text-white text-sm">✏️ Anotaciones</span>
      <button onClick={doConfirm} className="px-4 py-1.5 rounded-xl font-bold text-sm text-gray-900" style={{background:Y}}>✓ Confirmar</button>
    </div>
    <div className="flex-1 overflow-hidden flex items-center justify-center bg-black relative">
      {!loaded&&<div className="flex flex-col items-center gap-3 text-white/50"><div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"/><span className="text-sm">Cargando…</span></div>}
      <canvas ref={canvasRef} className="max-w-full max-h-full touch-none" style={{display:loaded?"block":"none",cursor:"crosshair"}} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}/>
      {textDlg&&(<div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 p-4"><div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl"><p className="text-sm font-bold text-gray-800 mb-3">✏️ Texto</p><input autoFocus value={textVal} onChange={(e:any)=>setTVal(e.target.value)} onKeyDown={(e:any)=>e.key==="Enter"&&addText()} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 mb-4" placeholder="Texto de anotación…"/><div className="flex gap-2"><button onClick={()=>{setTDlg(null);setTVal("");}} className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-500">Cancelar</button><button onClick={addText} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{background:Y}}>Agregar →</button></div></div></div>)}
    </div>
    <div className="shrink-0 px-3 pt-2.5 pb-3 space-y-2.5" style={{background:DARK}}>
      <div className="flex items-center gap-1.5">
        {TOOLS.map(t=>(<button key={t.id} onClick={()=>setTool(t.id)} className={`flex-1 py-2 rounded-xl flex flex-col items-center gap-0.5 text-xs font-bold border-2 transition-all ${tool===t.id?"border-transparent text-gray-900":"border-white/10 text-white/50 hover:text-white"}`} style={tool===t.id?{background:Y}:{}}><span className="text-sm leading-none">{t.icon}</span><span className="text-[9px]">{t.L}</span></button>))}
        <div className="w-px h-10 bg-white/10 mx-0.5"/>
        <button onClick={()=>setShapes((p:any[])=>p.slice(0,-1))} className="px-2.5 py-2 rounded-xl border-2 border-white/10 text-white/50 hover:text-white flex flex-col items-center"><span className="text-sm">↩</span><span className="text-[9px] text-white/40">Undo</span></button>
        <button onClick={()=>{if(confirm("¿Borrar todo?"))setShapes([]);}} className="px-2.5 py-2 rounded-xl border-2 border-white/10 text-white/50 hover:text-red-400 flex flex-col items-center"><span className="text-sm">🗑️</span><span className="text-[9px] text-white/40">Clear</span></button>
      </div>
      <div className="flex items-center justify-center gap-3 pb-1">
        <span className="text-white/30 text-[11px] mr-1">Color:</span>
        {COLS.map(c=><button key={c} onClick={()=>setColor(c)} className="transition-all active:scale-90" style={{width:26,height:26,borderRadius:"50%",background:c,outline:color===c?`3px solid ${Y}`:"3px solid transparent",outlineOffset:2,border:c==="#ffffff"?"2px solid rgba(255,255,255,0.25)":"none"}}/>)}
      </div>
    </div>
  </div>);
}

/* ══ FINALIZAR MODAL ══ */
function FinalizarModal({informe,onConfirm,onClose}:any){
  const tipo=informe.tipo||"verificacion",ress=tipo==="inspeccion"?RES_INSP:RES_VER;
  const cumpl=calcCumplimiento(informe.elementos||[]);
  const[firmaUrl,setFirmaUrl]=useState<string|null>(informe.firmaUrl||null);
  const[showFirma,setShowFirma]=useState(false);
  const alta=(informe.elementos||[]).filter((e:any)=>e.prioridad==="alta").length,normal=(informe.elementos||[]).filter((e:any)=>e.prioridad==="normal").length,baja=(informe.elementos||[]).filter((e:any)=>e.prioridad==="baja").length,total=informe.elementos?.length||0;
  const suggested=tipo==="inspeccion"?(alta>0?"No Aprobada":"Aprobada"):(alta>0?"Rechazada":normal>0?"Condicionada":"Aprobada");
  const[resultado,setRes]=useState(informe.resultado||suggested);const[plazo,setPlazo]=useState(informe.plazo||"12 meses");const[notas,setNotas]=useState(informe.notas||"");const[saving,setSaving]=useState(false);
  const RC:Record<string,any>={"Aprobada":{color:"#16a34a",bg:"#f0fdf4",desc:"Instalación cumple con los requisitos normativos."},"Condicionada":{color:Y,bg:"#fffbeb",desc:"Requiere correcciones en el plazo establecido."},"Rechazada":{color:"#dc2626",bg:"#fef2f2",desc:"No conformidades críticas que impiden la aprobación."},"No Aprobada":{color:"#dc2626",bg:"#fef2f2",desc:"La instalación no cumple con los requisitos normativos."}};
  const cfg=RC[resultado]||RC["Aprobada"];
  return(<div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4"><div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" style={{maxHeight:"95vh"}}>
    <div className="px-5 pt-5 pb-4 border-b border-gray-100"><div className="flex items-center justify-between mb-1"><span className="text-lg font-extrabold text-gray-900">🏁 Finalizar {tipo==="inspeccion"?"Inspección":"Verificación"}</span><button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-gray-600 hover:bg-gray-100 font-bold text-lg">✕</button></div><p className="text-xs text-gray-400">{informe.codigo} · {informe.propietario}</p></div>
    <div className="overflow-y-auto p-5 space-y-5 pb-6">
      <div className="rounded-2xl border-2 border-gray-100 overflow-hidden"><div className="px-4 py-2 bg-gray-50 border-b border-gray-100"><p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Resumen</p></div><div className="grid grid-cols-4 divide-x divide-gray-100">{[["Total",total,"text-gray-800"],["Alta",alta,"text-red-500"],["Normal",normal,"text-amber-500"],["Baja",baja,"text-green-500"]].map(([l,n,cl])=>(<div key={String(l)} className="px-3 py-3 text-center"><div className={`text-xl font-extrabold ${cl}`}>{n}</div><div className="text-[10px] text-gray-400 mt-0.5">{l}</div></div>))}</div></div>
      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border-2" style={{borderColor:cfg.color+"40",background:cfg.bg}}><span className="text-lg mt-0.5">💡</span><div><p className="text-xs font-bold" style={{color:cfg.color}}>Resultado sugerido: {suggested}</p><p className="text-xs mt-0.5" style={{color:cfg.color+"cc"}}>{cfg.desc}</p></div></div>
      <div><label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Resultado *</label><div className="space-y-2.5">{ress.map((r:string)=>{const c=RC[r]||RC["Aprobada"];const active=resultado===r;return(<button key={r} onClick={()=>setRes(r)} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all" style={{borderColor:active?c.color:"#e5e7eb",background:active?c.bg:"white"}}><div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{borderColor:active?c.color:"#d1d5db",background:active?c.color:"white"}}>{active&&<div className="w-2 h-2 rounded-full bg-white"/>}</div><div className="flex-1"><p className="font-bold text-sm" style={{color:active?c.color:"#374151"}}>{r}</p><p className="text-xs mt-0.5" style={{color:active?c.color+"aa":"#9ca3af"}}>{c.desc}</p></div></button>);})}</div></div>
      {tipo!=="inspeccion"&&resultado!=="Aprobada"&&(<div><label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Plazo para mejoras</label><div className="flex gap-2 flex-wrap mb-2">{["3 meses","6 meses","12 meses","18 meses","24 meses"].map(p=>(<button key={p} onClick={()=>setPlazo(p)} className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all" style={{borderColor:plazo===p?Y:"#e5e7eb",background:plazo===p?Y+"15":"white",color:plazo===p?Y:"#6b7280"}}>{p}</button>))}</div><FI label="" value={plazo} onChange={(e:any)=>setPlazo(e.target.value)} placeholder="Ej: 12 meses"/></div>)}
      <div><label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Notas adicionales</label><textarea value={notas} onChange={(e:any)=>setNotas(e.target.value)} rows={3} placeholder="Notas adicionales del informe…" className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm bg-gray-50 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-all"/></div>
      <div><label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">✍️ Firma del responsable</label>{firmaUrl?(<div className="relative"><img src={firmaUrl} alt="firma" className="w-full max-h-24 object-contain border-2 border-gray-100 rounded-xl bg-gray-50"/><button onClick={()=>setFirmaUrl(null)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 font-bold text-sm bg-white rounded-full w-6 h-6 flex items-center justify-center shadow">✕</button></div>):(<button onClick={()=>setShowFirma(true)} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:border-amber-400 hover:text-amber-500 transition-all">+ Agregar firma</button>)}{showFirma&&<FirmaCanvas onConfirm={(url:string)=>{setFirmaUrl(url);setShowFirma(false);}} onClose={()=>setShowFirma(false)}/>}</div>
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{background:"#f8f9fb"}}><span className="text-xs font-bold text-gray-500">Cumplimiento estimado</span><span className="text-sm font-extrabold" style={{color:cumpl>=80?"#16a34a":cumpl>=50?"#d97706":"#dc2626"}}>{cumpl}%</span></div>
      <button onClick={()=>{setSaving(true);onConfirm({resultado,plazo:tipo==="inspeccion"?"N/A":plazo,notas,firmaUrl});}} disabled={saving} className="w-full py-4 rounded-2xl font-extrabold text-white text-base hover:opacity-90 active:scale-95 transition-all disabled:opacity-60" style={{background:resultado==="Aprobada"?"#16a34a":resultado==="Condicionada"?Y:"#dc2626"}}>{saving?"⏳ Guardando…":"Generar Reporte →"}</button>
    </div>
  </div></div>);
}

/* ══ HOME VIEW ══ */
function HomeView({informes,loading,onNew,onOpen,usuario,onLogout}:any){
  const[delTarget,setDel]=useState<any>(null);const[tabActiva,setTab]=useState("todos");const[busqueda,setBusq]=useState("");
  const[online,setOnline]=useState(navigator.onLine);const[exporting,setExp]=useState<string|null>(null);
  useEffect(()=>{const on=()=>setOnline(true);const off=()=>setOnline(false);window.addEventListener("online",on);window.addEventListener("offline",off);return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};},[]);
  const TABS=[{id:"todos",label:"Todos",icon:"📋"},{id:"verificacion",label:"Verificación",icon:"🔍"},{id:"inspeccion",label:"Inspección",icon:"⚡"},{id:"ac",label:"Aires AC",icon:"🌡️"}];
  const filtrados=[...informes].sort((a:any,b:any)=>(b.createdAt||0)-(a.createdAt||0)).filter((inf:any)=>(tabActiva==="todos"||inf.tipo===tabActiva)&&(!busqueda||inf.propietario?.toLowerCase().includes(busqueda.toLowerCase())||inf.codigo?.toLowerCase().includes(busqueda.toLowerCase())));
  const conteo=(tipo:string)=>informes.filter((i:any)=>tipo==="todos"?true:i.tipo===tipo).length;
  const tipoBadge=(t:string)=>t==="ac"?{label:"Aires AC",bg:"#0c4a6e22",color:"#0369a1"}:t==="inspeccion"?{label:"Inspección",bg:DARK+"18",color:DARK}:{label:"Verificación",bg:Y+"22",color:Y};
  const handleWord=async(inf:any)=>{setExp(inf.id);try{if(inf.tipo==="ac")await generateWordAC(inf);else await generateWordElectrico(inf);}catch(e:any){alert("Error al generar Word: "+e.message);}finally{setExp(null);}};
  const handleZip=async(inf:any)=>{setExp(inf.id+"zip");try{await downloadImagesZip(inf);}catch(e:any){alert("Error al generar ZIP: "+e.message);}finally{setExp(null);};};
  const handleShare=(inf:any)=>{if(inf.tipo==="ac")generatePDFAC(inf);else generatePDFElectrico(inf);setTimeout(()=>alert("El PDF se generó. Usa el botón Compartir del visor de impresión para enviarlo por WhatsApp, correo u otra app."),800);};
  return(<div className="min-h-screen" style={{background:"#f8f9fb"}}>
    <header style={{background:DARK}} className="px-4 py-4 sticky top-0 z-10 shadow-lg">
      <div className="flex items-center justify-between max-w-2xl mx-auto">
        <Logo white/>
        <div className="flex items-center gap-2">
          <div className="text-right mr-1 hidden sm:block"><div className="text-white text-xs font-bold leading-tight">{usuario.nombre}</div><button onClick={onLogout} className="text-white/40 hover:text-white/70 text-[10px]">Cerrar sesión</button></div>
          <button onClick={onLogout} className="sm:hidden text-white/40 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10">↩</button>
          <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm text-gray-900 hover:opacity-90 active:scale-95" style={{background:Y}}><span className="text-base leading-none">+</span> Nuevo</button>
        </div>
      </div>
      <div className="max-w-2xl mx-auto mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
        {TABS.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${tabActiva===t.id?"text-gray-900":"text-white/50 hover:text-white/80"}`} style={tabActiva===t.id?{background:Y}:{background:"rgba(255,255,255,0.08)"}}><span>{t.icon}</span><span>{t.label}</span><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${tabActiva===t.id?"bg-black/20 text-gray-900":"bg-white/10 text-white/60"}`}>{conteo(t.id)}</span></button>))}
      </div>
    </header>
    <div className="p-4 max-w-2xl mx-auto">
      <div className="relative mb-3"><input value={busqueda} onChange={(e:any)=>setBusq(e.target.value)} placeholder="🔍 Buscar por cliente o código…" className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-amber-400 transition-all pr-8"/>{busqueda&&<button onClick={()=>setBusq("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 font-bold">✕</button>}</div>
      <div className="flex items-center justify-between mb-4 mt-1">
        <h2 className="font-bold text-gray-400 text-xs uppercase tracking-widest">{TABS.find(t=>t.id===tabActiva)?.label} ({filtrados.length})</h2>
        <span className={`text-xs font-medium ${online?"text-green-500":"text-amber-400"}`}>{online?"🔄 En línea":"📵 Sin conexión"}</span>
      </div>
      {loading?(<div className="flex items-center justify-center py-24 gap-3"><div className="w-6 h-6 border-2 border-gray-200 border-t-amber-400 rounded-full animate-spin"/><span className="text-gray-400 text-sm">Cargando informes…</span></div>):!filtrados.length?(<div className="text-center py-20"><div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl" style={{background:Y+"22"}}>{TABS.find(t=>t.id===tabActiva)?.icon}</div><p className="text-gray-400 text-sm">{tabActiva==="todos"?"No hay informes. Toca + Nuevo para comenzar.":`No hay informes de ${TABS.find(t=>t.id===tabActiva)?.label}.`}</p></div>):(
      <div className="space-y-3">{filtrados.map((inf:any)=>{
        const tb=tipoBadge(inf.tipo);const nEl=inf.tipo==="ac"?inf.equipos?.length||0:inf.elementos?.length||0;
        const apAC=inf.tipo==="ac"?(inf.equipos||[]).filter((e:any)=>e.resultado==="Aprobado").length:null;
        const altaCount=inf.tipo!=="ac"?(inf.elementos||[]).filter((e:any)=>e.prioridad==="alta").length:0;
        const isExp=exporting===inf.id,isExpZip=exporting===inf.id+"zip";
        return(<div key={inf.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-1 w-full" style={{background:inf.tipo==="ac"?"#38bdf8":inf.tipo==="inspeccion"?DARK:Y}}/>
          <div onClick={()=>onOpen(inf)} className="p-4 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors">
            <div className="flex justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5"><div className="font-mono text-[11px] text-gray-300 tracking-wider">{inf.codigo}</div>{tabActiva==="todos"&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:tb.bg,color:tb.color}}>{tb.label}</span>}{!inf.resultado&&inf.tipo!=="ac"&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 border border-blue-100">En curso</span>}</div>
                <div className="font-bold text-gray-800 truncate text-sm">{inf.propietario||"Sin nombre"}</div>
                <div className="text-xs text-gray-400 truncate">{inf.direccion}</div>
              </div>
              <div className="shrink-0 text-right flex flex-col items-end gap-1.5"><ResBadge v={inf.resultado}/><div className="text-[11px] text-gray-300">{inf.fecha}</div></div>
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400">
              {inf.tipo==="ac"?(<><span>🌡️ <b className="text-gray-600">{nEl}</b> equipos</span>{apAC!==null&&<span className="text-green-500 font-bold">✅ {apAC}/{nEl}</span>}</>):(<><span>📷 <b className="text-gray-600">{nEl}</b> elementos</span>{altaCount>0&&<span className="font-bold text-red-400">🔴 {altaCount} alta prioridad</span>}</>)}
              <span className="text-[10px] text-gray-300 ml-auto">{inf.tipo==="ac"?inf.tecnico:inf.ingeniero}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 border-t border-gray-50 divide-x divide-gray-50 text-xs">
            {inf.resultado&&(<button onClick={()=>inf.tipo==="ac"?generatePDFAC(inf):generatePDFElectrico(inf)} className="py-2.5 text-gray-500 hover:bg-gray-50 font-semibold transition-colors flex items-center justify-center gap-1">🖨️ PDF</button>)}
            {inf.resultado&&(<button onClick={()=>handleWord(inf)} disabled={!!isExp} className="py-2.5 text-blue-500 hover:bg-blue-50 font-semibold transition-colors flex items-center justify-center gap-1 disabled:opacity-50">{isExp?"⏳":"📄"} Word</button>)}
            <button onClick={()=>handleZip(inf)} disabled={!!isExpZip} className="py-2.5 text-purple-500 hover:bg-purple-50 font-semibold transition-colors flex items-center justify-center gap-1 disabled:opacity-50">{isExpZip?"⏳":"🗜️"} Fotos</button>
          </div>
          <div className="grid grid-cols-3 border-t border-gray-50 divide-x divide-gray-50 text-xs">
            {inf.resultado&&inf.tipo!=="ac"&&(<button onClick={()=>generateResumenEjecutivo(inf)} className="py-2.5 text-emerald-600 hover:bg-emerald-50 font-semibold transition-colors flex items-center justify-center gap-1">📋 Resumen</button>)}
            {inf.resultado&&(<button onClick={()=>handleShare(inf)} className="py-2.5 text-amber-500 hover:bg-amber-50 font-semibold transition-colors flex items-center justify-center gap-1">📤 Compartir</button>)}
            <button onClick={()=>setDel(inf)} className="py-2.5 text-red-400 hover:bg-red-50 font-semibold transition-colors flex items-center justify-center gap-1">🗑️ Eliminar</button>
          </div>
        </div>);
      })}</div>)}
    </div>
    {delTarget&&<DeleteModal informe={delTarget} onConfirm={()=>setDel(null)} onClose={()=>setDel(null)}/>}
  </div>);
}

/* ══ NUEVO ══ */
function NuevoView({onCreate,onBack,usuario,tipo,informes}:any){
  const[f,setF]=useState({codigo:"",propietario:"",direccion:"",fecha:HOY,ingeniero:tipo==="ac"?"":usuario.nombre,matricula:tipo==="ac"?"":usuario.matricula,tecnico:tipo==="ac"?usuario.nombre:""});
  const[anterior2012,setAnt]=useState<boolean|null>(null);
  const[notaExtra,setNotaExtra]=useState("");
  const[creating,setCreating]=useState(false);
  const s=(k:string,v:string)=>setF((p:any)=>({...p,[k]:v}));
  const tipoLabel=tipo==="ac"?"Mantenimiento de Aires":tipo==="inspeccion"?"Inspección Eléctrica":"Verificación Eléctrica";
  useEffect(()=>{if(f.codigo==="")setF(p=>({...p,codigo:suggestCodigo(informes||[])}));},[]);
  const go=()=>{
    if(creating)return;
    if(!f.codigo.trim())return alert("El código de informe es requerido.");
    if(!f.propietario.trim())return alert("El nombre del cliente es requerido.");
    if(tipo==="verificacion"&&anterior2012===null)return alert("Indica si la instalación es anterior a agosto de 2012.");
    setCreating(true);
    const notaFinal=anterior2012===true?NOTA_AGOSTO_2012:notaExtra.trim();
    const base={...f,tipo,id:Date.now(),createdAt:Date.now(),notaInstalacion:notaFinal};
    if(tipo==="ac")onCreate({...base,equipos:[],resultado:null,notas:""});
    else onCreate({...base,elementos:[],resultado:null,plazo:"12 meses",notas:notaFinal});
  };
  return(<div className="min-h-screen" style={{background:"#f8f9fb"}}>
    <header style={{background:DARK}} className="px-4 py-4 sticky top-0 z-10"><div className="flex items-center gap-3 max-w-lg mx-auto"><button onClick={onBack} className="text-white/60 hover:text-white text-xl transition-colors">←</button><Logo sm white/><span className="font-bold text-white text-sm ml-1">{tipoLabel}</span></div></header>
    <div className="p-4 max-w-lg mx-auto space-y-3 pb-24">
      <Card title="Identificación" accent>
        <div><label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Código del informe *</label><div className="flex gap-2"><input value={f.codigo} onChange={(e:any)=>s("codigo",e.target.value)} className="flex-1 border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:border-amber-400 focus:bg-white transition-all" placeholder="INF-26-055"/><button onClick={()=>setF(p=>({...p,codigo:suggestCodigo(informes||[])}))} className="px-3 py-2 rounded-xl text-xs font-bold border-2 border-gray-100 text-gray-400 hover:border-amber-400 hover:text-amber-500 transition-all" title="Sugerir siguiente código">🔄</button></div></div>
        <FI label="Fecha *" value={f.fecha} onChange={(e:any)=>s("fecha",e.target.value)} type="date"/>
      </Card>
      <Card title="Datos del Cliente" accent>
        <FI label="Cliente / Propietario *" value={f.propietario} onChange={(e:any)=>s("propietario",e.target.value)} placeholder="Nombre completo…"/>
        <FI label="Dirección / Ubicación" value={f.direccion} onChange={(e:any)=>s("direccion",e.target.value)} placeholder="San José, Montes de Oca…"/>
      </Card>
      {tipo==="ac"?(
        <Card title="Responsable del Mantenimiento" accent>
          <FI label="Técnico responsable" value={f.tecnico} onChange={(e:any)=>s("tecnico",e.target.value)} placeholder="Nombre del técnico o responsable"/>
        </Card>
      ):(
        <Card title="Responsable de Verificación" accent>
          <FI label="Nombre del Ingeniero" value={f.ingeniero} onChange={(e:any)=>s("ingeniero",e.target.value)} placeholder="Ing. Nombre Apellido"/>
          <FI label="Matrícula" value={f.matricula} onChange={(e:any)=>s("matricula",e.target.value)} placeholder="IE-XXXXX / CAPDEE-XXX"/>
        </Card>
      )}
      {tipo==="verificacion"&&(
        <Card title="Antigüedad de la Instalación" accent>
          <p className="text-xs text-gray-500 mb-3">¿La instalación eléctrica es <b>anterior a agosto de 2012</b>?</p>
          <div className="flex gap-3">
            <button onClick={()=>setAnt(true)} className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${anterior2012===true?"text-white border-amber-500":"border-gray-200 text-gray-400 hover:border-amber-300"}`} style={anterior2012===true?{background:Y}:{}}>Sí, es anterior</button>
            <button onClick={()=>setAnt(false)} className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${anterior2012===false?"text-white border-gray-700 bg-gray-700":"border-gray-200 text-gray-400 hover:border-gray-400"}`}>No</button>
          </div>
          {anterior2012===true&&(<div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200"><p className="text-[10px] text-amber-700 leading-relaxed">Se incluirá automáticamente la nota sobre instalaciones anteriores al RTCR 458:2011.</p></div>)}
          {anterior2012===false&&(<div className="mt-3"><label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Nota adicional (opcional)</label><textarea value={notaExtra} onChange={(e:any)=>setNotaExtra(e.target.value)} rows={3} placeholder="Nota adicional sobre la instalación…" className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm bg-gray-50 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-all"/></div>)}
        </Card>
      )}
      <Btn onClick={go} disabled={creating} full>{creating?"Creando…":tipo==="ac"?"Continuar → Agregar equipos":"Iniciar →"}</Btn>
    </div>
  </div>);
}

/* ══ EQUIPO AC MODAL ══ */
function EquipoACModal({equipo,num,onSave,onClose}:any){
  const[nombre,setNombre]=useState(equipo?.nombre||"");const[ubicacion,setUbic]=useState(equipo?.ubicacion||"");
  const[fotos,setFotos]=useState<any>(equipo?.fotos||{});const[resultado,setRes]=useState(equipo?.resultado||"");
  const[acciones,setAcc]=useState<string[]>(equipo?.acciones||[]);const[obs,setObs]=useState(equipo?.observaciones||"");
  const[annot,setAnn]=useState<any>(null);const[err,setErr]=useState<string|null>(null);
  const fileRefs=useRef<Record<string,HTMLInputElement|null>>({});

  const onPhoto=async(e:any,key:string)=>{
    const f=e.target.files[0];if(!f)return;
    try{
      const{url}=await processPhoto(f);
      setAnn({url,key});
      const ts=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
      await savePhotoToDevice(url,`electrizar_ac_${key}_${ts}.jpg`);
    }catch{setErr("Error al procesar la imagen.");}
  };
  const onAnnotConfirm=(finalUrl:string)=>{setFotos((p:any)=>({...p,[annot.key]:finalUrl}));setAnn(null);};
  const save=()=>{
    if(!nombre.trim()){setErr("El nombre del equipo es requerido.");return;}
    if(!resultado){setErr("Indica si el equipo está Aprobado o No Aprobado.");return;}
    onSave({nombre:nombre.trim(),ubicacion,fotos,resultado,acciones,observaciones:obs,num});
  };
  if(annot)return<AnnotationEditor imageUrl={annot.url} onConfirm={(u:string)=>onAnnotConfirm(u)} onClose={()=>setAnn(null)}/>;
  return(<div className="fixed inset-0 bg-black/70 z-40 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" style={{maxHeight:"93vh"}}>
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0"><button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 font-bold text-lg">✕</button><span className="font-bold text-gray-800">Equipo <span className="font-mono text-gray-400">#{num}</span></span><Btn onClick={save} sm>Guardar ✓</Btn></div>
      <div className="overflow-y-auto p-4 space-y-4 pb-6">
        <FI label="Nombre del equipo *" value={nombre} onChange={(e:any)=>{setNombre(e.target.value);setErr(null);}} placeholder="Ej: Apartamento #7 / Oficina Naranja"/>
        <FI label="Ubicación" value={ubicacion} onChange={(e:any)=>setUbic(e.target.value)} placeholder="Ej: Segundo piso, habitación principal"/>
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">📷 Fotografías del equipo</label>
          <div className="space-y-4">
            {AC_FOTOS.map((f:any)=>(
              <div key={f.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600">{f.icon} {f.label}</span>
                  {fotos[f.key]&&<button onClick={()=>setAnn({url:fotos[f.key],key:f.key})} className="text-[10px] font-bold px-2 py-1 rounded-lg border" style={{color:Y,borderColor:Y,background:Y+"10"}}>✏️ Anotar</button>}
                </div>
                {fotos[f.key]?(
                  <div className="relative">
                    <img src={fotos[f.key]} alt={f.label} className="w-full h-36 object-cover rounded-xl border border-gray-200"/>
                    <div className="absolute bottom-2 right-2 flex gap-1.5">
                      <button onClick={()=>{const i=fileRefs.current[f.key];if(i){i.removeAttribute("capture");i.click();}}} className="px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-[10px] font-bold">🖼️</button>
                      <button onClick={()=>{const i=fileRefs.current[f.key];if(i){i.setAttribute("capture","environment");i.click();}}} className="px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-[10px] font-bold">📷</button>
                    </div>
                  </div>
                ):(
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <button onClick={()=>{const i=fileRefs.current[f.key];if(i){i.removeAttribute("capture");i.click();}}} className="flex-1 py-3 border-2 border-gray-100 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 flex flex-col items-center gap-1"><span className="text-lg">🖼️</span>Galería</button>
                      <button onClick={()=>{const i=fileRefs.current[f.key];if(i){i.setAttribute("capture","environment");i.click();}}} className="flex-1 py-3 border-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 hover:opacity-80" style={{borderColor:Y,color:Y,background:Y+"12"}}><span className="text-lg">{f.icon}</span>Cámara</button>
                    </div>
                    <p className="text-[10px] text-center text-gray-400">{f.hint}</p>
                  </div>
                )}
                <input ref={(el)=>{fileRefs.current[f.key]=el;}} type="file" accept="image/*" className="hidden" onChange={(e:any)=>onPhoto(e,f.key)}/>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Resultado del equipo *</label>
          <div className="flex gap-3">
            <button onClick={()=>{setRes("Aprobado");setErr(null);}} className={`flex-1 py-3.5 rounded-2xl font-extrabold text-sm border-2 transition-all ${resultado==="Aprobado"?"text-white border-green-500":"border-gray-200 text-gray-400 hover:border-green-300"}`} style={resultado==="Aprobado"?{background:"#16a34a"}:{}}>✅ Aprobado</button>
            <button onClick={()=>{setRes("No Aprobado");setErr(null);}} className={`flex-1 py-3.5 rounded-2xl font-extrabold text-sm border-2 transition-all ${resultado==="No Aprobado"?"text-white border-red-500":"border-gray-200 text-gray-400 hover:border-red-300"}`} style={resultado==="No Aprobado"?{background:"#dc2626"}:{}}>❌ No Aprobado</button>
          </div>
        </div>
        {resultado==="No Aprobado"&&<ListEditor label="Acciones realizadas / requeridas" items={acciones} set={setAcc} placeholder="Ej: Se recargó refrigerante…"/>}
        <div><label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Observaciones generales</label><textarea value={obs} onChange={(e:any)=>setObs(e.target.value)} rows={2} placeholder="Presiones, amperaje, estado general del equipo…" className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm bg-gray-50 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-all"/></div>
        {err&&<div className="bg-red-50 border-2 border-red-100 rounded-2xl p-3 text-xs text-red-600 font-medium">⚠️ {err}</div>}
      </div>
    </div>
  </div>);
}

/* ══ MANTENIMIENTO AC VIEW ══ */
function MantenimientoACView({informe,onUpdate,onBack,onFinalize}:any){
  const[modal,setModal]=useState(false);const[editIdx,setEditIdx]=useState<number|null>(null);const[syncing,setSyncing]=useState(false);
  const equipos=informe.equipos||[];const aprobados=equipos.filter((e:any)=>e.resultado==="Aprobado").length;const noAprobados=equipos.filter((e:any)=>e.resultado==="No Aprobado").length;
  const saveEquipo=(eq:any)=>{const list=[...equipos];if(editIdx!==null)list[editIdx]={...eq,num:editIdx+1};else list.push({...eq,num:list.length+1});const updated={...informe,equipos:list};setModal(false);onUpdate(updated);saveInformeFS(updated);};
  const delEquipo=(i:number)=>{if(!confirm("¿Eliminar este equipo?"))return;const list=equipos.filter((_:any,j:number)=>j!==i).map((e:any,j:number)=>({...e,num:j+1}));const updated={...informe,equipos:list};onUpdate(updated);saveInformeFS(updated);};
  const handleFinalizar=()=>{if(equipos.length===0){alert("Agrega al menos un equipo antes de finalizar.");return;}const updated={...informe,resultado:"Completado",finalizadoAt:Date.now()};saveInformeFS(updated);onFinalize(updated);};
  return(<div className="min-h-screen" style={{background:"#f8f9fb"}}>
    <header style={{background:"#0c4a6e"}} className="px-4 py-4 sticky top-0 z-10 shadow-lg">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2"><button onClick={onBack} className="text-white/60 hover:text-white text-xl transition-colors">←</button><Logo sm white/>{syncing&&<div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin ml-1"/>}<span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg" style={{background:"#38bdf822",color:"#38bdf8"}}>AIRES AC</span></div>
        <div className="flex items-start justify-between ml-1"><div><div className="font-mono text-[11px] text-white/40 tracking-wider">{informe.codigo}</div><div className="font-bold text-white text-sm">{informe.propietario}</div><div className="text-white/50 text-xs">{informe.tecnico}</div></div>{informe.resultado&&<button onClick={()=>generatePDFAC(informe)} className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-white/20 text-white hover:bg-white/10 transition-colors">🖨️ PDF</button>}</div>
      </div>
    </header>
    <div className="bg-white border-b border-gray-100 px-4 py-3"><div className="max-w-2xl mx-auto grid grid-cols-3 gap-3 text-center"><div><div className="text-xl font-extrabold text-gray-800">{equipos.length}</div><div className="text-[10px] text-gray-400">Total equipos</div></div><div><div className="text-xl font-extrabold text-green-500">{aprobados}</div><div className="text-[10px] text-gray-400">Aprobados</div></div><div><div className="text-xl font-extrabold text-red-500">{noAprobados}</div><div className="text-[10px] text-gray-400">No aprobados</div></div></div></div>
    <div className="p-4 max-w-2xl mx-auto pb-36 space-y-3">
      {!equipos.length?(<div className="text-center py-20"><div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl" style={{background:"#38bdf822"}}>🌡️</div><p className="text-gray-400 text-sm">Toca <b style={{color:Y}}>+</b> para agregar el primer equipo</p></div>):(
        equipos.map((eq:any,i:number)=>(<div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-3"><div className="flex items-start justify-between gap-2 mb-2"><div><div className="font-mono text-[10px] text-gray-300">({eq.num})</div><div className="font-bold text-gray-800 text-sm">{eq.nombre}</div>{eq.ubicacion&&<div className="text-xs text-gray-400">📍 {eq.ubicacion}</div>}</div><ResBadge v={eq.resultado}/></div><div className="flex gap-1.5 mt-2">{AC_FOTOS.map((f:any)=>(<div key={f.key} className="flex-1 aspect-square rounded-lg overflow-hidden border border-gray-100" style={{maxWidth:60}}>{eq.fotos?.[f.key]?<img src={eq.fotos[f.key]} alt={f.label} className="w-full h-full object-cover"/>:<div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-300 text-sm">{f.icon}</div>}</div>))}</div>{eq.resultado==="No Aprobado"&&eq.acciones?.length>0&&<div className="mt-2 text-xs text-red-600 font-medium">⚠️ {eq.acciones.length} acción{eq.acciones.length>1?"es":""} reportada{eq.acciones.length>1?"s":""}</div>}</div>
          <div className="flex border-t border-gray-50 divide-x divide-gray-50 text-xs"><button onClick={()=>{setEditIdx(i);setModal(true);}} className="flex-1 py-2.5 text-gray-500 hover:bg-gray-50 font-semibold transition-colors">✏️ Editar</button><button onClick={()=>delEquipo(i)} className="flex-1 py-2.5 text-red-400 hover:bg-red-50 font-semibold transition-colors">🗑️ Eliminar</button></div>
        </div>))
      )}
      <div className={`rounded-2xl border-2 overflow-hidden ${informe.resultado?"border-green-200 bg-green-50":"border-dashed border-gray-200 bg-white"}`}>
        <div className="p-4">{informe.resultado?(<div><p className="font-bold text-green-700 text-sm mb-1">✅ Mantenimiento completado</p><p className="text-xs text-green-600 mb-3">{aprobados} aprobados · {noAprobados} no aprobados de {equipos.length} equipos</p><button onClick={()=>generatePDFAC(informe)} className="w-full py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90" style={{background:DARK}}>🖨️ Generar PDF del informe</button></div>):(<div><p className="font-bold text-gray-500 text-sm mb-1">¿Terminaste el mantenimiento?</p><p className="text-xs text-gray-400 mb-4">Al finalizar se guardará el informe y podrás generar el PDF.</p><button onClick={handleFinalizar} className="w-full py-3.5 rounded-xl font-extrabold text-white text-sm hover:opacity-90 active:scale-95 transition-all" style={{background:"#0c4a6e"}}>🏁 Finalizar Mantenimiento</button></div>)}</div>
      </div>
    </div>
    <button onClick={()=>{setEditIdx(null);setModal(true);}} className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-2xl text-white text-3xl flex items-center justify-center z-20 active:scale-90 hover:opacity-90 transition-all" style={{background:"#38bdf8"}}>+</button>
    {modal&&<EquipoACModal equipo={editIdx!==null?equipos[editIdx]:null} num={editIdx!==null?editIdx+1:equipos.length+1} onSave={saveEquipo} onClose={()=>setModal(false)}/>}
  </div>);
}

/* ══ ELEMENTO MODAL ══ */
function ElementoModal({el,num,onSave,onClose}:any){
  const[titulo,setT]=useState(el?.titulo||"");const[url,setUrl]=useState<string|null>(el?.url||null);
  const[b64x,setB64]=useState<string|null>(el?.b64||null);const[H,setH]=useState<string[]>(el?.hallazgos||[]);const[N,setN]=useState<string[]>(el?.notas||[]);
  const[A,setA]=useState<string[]>(el?.acciones||[]);const[prio,setP]=useState(el?.prioridad||"normal");
  const[busy,setBusy]=useState(false);const[err,setErr]=useState<string|null>(null);const[annot,setAnn]=useState<string|null>(null);
  const fRef=useRef<HTMLInputElement>(null);

  const onPhoto=async(e:any)=>{
    const f=e.target.files[0];if(!f)return;setErr(null);
    try{
      const{url:u,b64:b}=await processPhoto(f);
      setUrl(u);setB64(b);setAnn(u);
      const ts=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
      await savePhotoToDevice(u,`electrizar_${ts}.jpg`);
    }catch{setErr("Error al procesar la imagen.");}
  };
  const onAnnotConfirm=(fu:string,fb:string)=>{setUrl(fu);setB64(fb);setAnn(null);if(titulo.trim())analyze(fb);else setErr("Foto guardada. Escribe el título y toca IA NEC.");};
  const analyze=async(b=b64x)=>{if(!b){setErr("Primero adjunta foto.");return;}if(!titulo.trim()){setErr("Escribe el título.");return;}setBusy(true);setErr(null);try{const r=await callAI(b,titulo.trim());setH(r.hallazgos||[]);setA(r.acciones||[]);setN(r.notas||[]);}catch(e:any){setErr("Error IA: "+e.message);}finally{setBusy(false);};};
  const save=()=>{if(!titulo.trim()){setErr("El título es requerido.");return;}onSave({titulo:titulo.trim(),url,b64:b64x,hallazgos:H,acciones:A,notas:N,prioridad:prio,num});};
  if(annot)return<AnnotationEditor imageUrl={annot} onConfirm={onAnnotConfirm} onClose={()=>{setAnn(null);setB64(null);setUrl(null);}}/>;
  return(<div className="fixed inset-0 bg-black/70 z-40 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col" style={{maxHeight:"93vh"}}>
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0"><button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 font-bold text-lg">✕</button><span className="font-bold text-gray-800">Elemento <span className="font-mono text-gray-400">#{num}</span></span><Btn onClick={save} sm>Guardar ✓</Btn></div>
      <div className="overflow-y-auto p-4 space-y-4 pb-6">
        <FI label="Título del Elemento *" value={titulo} onChange={(e:any)=>{setT(e.target.value);setErr(null);}} placeholder="Ej: Centro de carga principal"/>
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Fotografía</label>
          {url?(
            <div>
              <img src={url} alt="preview" className="w-full max-h-56 object-cover rounded-2xl border-2 border-gray-100 mb-2"/>
              <div className="grid grid-cols-3 gap-2">
                <PhotoPicker inputRef={fRef} onChange={onPhoto}/>
                <button onClick={()=>setAnn(url)} className="py-2.5 border-2 rounded-xl text-xs font-bold hover:opacity-80" style={{borderColor:Y,color:Y,background:Y+"12"}}>✏️ Anotar</button>
                <button onClick={()=>analyze()} disabled={busy||!titulo.trim()} className="py-2.5 rounded-xl text-xs text-white font-bold disabled:opacity-50" style={{background:DARK}}>{busy?"⏳…":"🤖 IA NEC"}</button>
              </div>
            </div>
          ):(
            <div className="space-y-2">
              <PhotoPicker inputRef={fRef} onChange={onPhoto}/>
              <p className="text-xs text-center text-gray-400">Selecciona desde galería o toma una foto · Editor de anotaciones · Análisis IA NEC 2020</p>
            </div>
          )}
        </div>
        {busy&&<div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{background:Y+"15"}}><div className="w-5 h-5 rounded-full border-2 animate-spin" style={{borderColor:Y,borderTopColor:"transparent"}}/><span className="text-sm font-bold" style={{color:Y}}>Analizando con NEC 2020…</span></div>}
        {err&&<div className="bg-red-50 border-2 border-red-100 rounded-2xl p-3 text-xs text-red-600 font-medium">⚠️ {err}</div>}
        <div><label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Prioridad</label><div className="flex gap-2">{PRIOS.map(p=><Pill key={p.v} active={prio===p.v} color={p.c} onClick={()=>setP(p.v)}>{p.L}</Pill>)}</div></div>
        <ListEditor label="Acciones Requeridas" items={A} set={setA} placeholder="Acción correctiva específica…" tipo="acciones"/>
        <ListEditor label="Hallazgos" items={H} set={setH} placeholder="Hallazgo con artículo NEC 2020…" tipo="hallazgos"/>
      </div>
    </div>
  </div>);
}

/* ══ INSPECCIÓN / VERIFICACIÓN ══ */
function InspeccionView({informe,onUpdate,onBack,onFinalize}:any){
  const[modal,setModal]=useState(false);const[editIdx,setEditIdx]=useState<number|null>(null);const[finalM,setFinalM]=useState(false);const[syncing,setSyncing]=useState(false);
  const tipo=informe.tipo||"verificacion";const tipoLabel=tipo==="inspeccion"?"Inspección":"Verificación";
  const saveEl=(el:any)=>{const els=[...(informe.elementos||[])];if(editIdx!==null)els[editIdx]={...el,num:editIdx+1};else els.push({...el,num:els.length+1});const updated={...informe,elementos:els};setModal(false);onUpdate(updated);saveInformeFS(updated);};
  const delEl=(i:number)=>{if(!confirm("¿Eliminar?"))return;const els=informe.elementos.filter((_:any,j:number)=>j!==i).map((e:any,j:number)=>({...e,num:j+1}));const updated={...informe,elementos:els};onUpdate(updated);saveInformeFS(updated);};
  const dupEl=(i:number)=>{const src={...informe.elementos[i]};const els=[...informe.elementos,{...src,num:informe.elementos.length+1,titulo:src.titulo+" (copia)"}];const updated={...informe,elementos:els};onUpdate(updated);saveInformeFS(updated);};
  const moveEl=(i:number,dir:number)=>{const els=[...informe.elementos];const j=i+dir;if(j<0||j>=els.length)return;[els[i],els[j]]=[els[j],els[i]];const renumbered=els.map((e,k)=>({...e,num:k+1}));const updated={...informe,elementos:renumbered};onUpdate(updated);saveInformeFS(updated);};
  const handleFinalize=(data:any)=>{const updated={...informe,...data};saveInformeFS(updated);onFinalize(updated);setFinalM(false);};
  const alta=(informe.elementos||[]).filter((e:any)=>e.prioridad==="alta").length,total=informe.elementos?.length||0;
  return(<div className="min-h-screen" style={{background:"#f8f9fb"}}>
    <header style={{background:DARK}} className="px-4 py-4 sticky top-0 z-10 shadow-lg">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2"><button onClick={onBack} className="text-white/60 hover:text-white text-xl transition-colors">←</button><Logo sm white/>{syncing&&<div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin ml-1"/>}<span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg" style={{background:Y+"30",color:Y}}>{tipoLabel.toUpperCase()}</span></div>
        <div className="flex items-start justify-between ml-1"><div><div className="font-mono text-[11px] text-white/40">{informe.codigo}</div><div className="font-bold text-white text-sm">{informe.propietario}</div></div><div className="flex items-center gap-2">{informe.resultado&&<ResBadge v={informe.resultado}/>}{informe.resultado&&<button onClick={()=>generatePDFElectrico(informe)} className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-white/20 text-white hover:bg-white/10">🖨️ PDF</button>}</div></div>
      </div>
    </header>
    <div className="bg-white border-b border-gray-100 px-4 py-2"><div className="max-w-2xl mx-auto flex gap-5 text-xs"><span className="text-gray-500">📷 <b className="text-gray-700">{total}</b> elementos</span><span className="text-gray-500">📅 {informe.fecha}</span>{alta>0&&<span className="font-bold text-red-500">🔴 {alta} alta prioridad</span>}{!informe.resultado&&<span className="text-blue-500 font-bold ml-auto">● En curso</span>}</div></div>
    <div className="p-4 max-w-2xl mx-auto pb-36 space-y-3">
      {!total?(<div className="text-center py-20"><div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl" style={{background:Y+"22"}}>📷</div><p className="text-gray-400 text-sm">Toca <b style={{color:Y}}>+</b> para agregar el primer elemento</p></div>):(
        informe.elementos.map((el:any,i:number)=>(<div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex gap-3 p-3">{el.url?<img src={el.url} alt={el.titulo} className="w-20 h-20 object-cover rounded-xl shrink-0"/>:<div className="w-20 h-20 bg-gray-100 rounded-xl shrink-0 flex items-center justify-center text-2xl">📷</div>}<div className="flex-1 min-w-0"><div className="flex items-center justify-between gap-1 mb-1"><span className="font-mono text-[10px] text-gray-300">({el.num})</span><Badge v={el.prioridad}/></div><div className="font-bold text-sm text-gray-800 leading-snug">{el.titulo}</div><div className="text-xs text-gray-400 mt-1">{el.hallazgos?.length||0} hallazgos · {el.acciones?.length||0} acciones</div></div></div>
          <div className="flex border-t border-gray-50 divide-x divide-gray-50 text-xs"><button onClick={()=>moveEl(i,-1)} disabled={i===0} className="py-2.5 px-3 text-gray-400 hover:bg-gray-50 disabled:opacity-30 transition-colors">↑</button><button onClick={()=>moveEl(i,1)} disabled={i===(informe.elementos?.length||0)-1} className="py-2.5 px-3 text-gray-400 hover:bg-gray-50 disabled:opacity-30 transition-colors">↓</button><button onClick={()=>{setEditIdx(i);setModal(true);}} className="flex-1 py-2.5 text-gray-500 hover:bg-gray-50 font-semibold transition-colors">✏️ Editar</button><button onClick={()=>dupEl(i)} className="py-2.5 px-3 text-blue-400 hover:bg-blue-50 font-semibold transition-colors">📋</button><button onClick={()=>delEl(i)} className="flex-1 py-2.5 text-red-400 hover:bg-red-50 font-semibold transition-colors">🗑️</button></div>
        </div>))
      )}
      <div className={`rounded-2xl border-2 overflow-hidden ${informe.resultado?"border-green-200 bg-green-50":"border-dashed border-gray-200 bg-white"}`}>
        <div className="p-4">{informe.resultado?(<div><div className="flex items-center justify-between mb-2"><p className="font-bold text-green-700 text-sm">✅ {tipoLabel} finalizada</p><ResBadge v={informe.resultado}/></div>{tipo!=="inspeccion"&&<p className="text-xs text-green-600 mb-3">Plazo: {informe.plazo}</p>}<div className="flex gap-2"><button onClick={()=>setFinalM(true)} className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 border-green-200 text-green-700 hover:bg-green-100">✏️ Editar resultado</button><button onClick={()=>generatePDFElectrico(informe)} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90" style={{background:DARK}}>🖨️ Generar PDF</button></div></div>):(<div><p className="font-bold text-gray-500 text-sm mb-1">¿Terminaste de fotografiar?</p><p className="text-xs text-gray-400 mb-4">Al finalizar se asignará el resultado y quedará disponible en todos los dispositivos.</p><button onClick={()=>{if(total===0){alert("Agrega al menos un elemento.");return;}setFinalM(true);}} className="w-full py-3.5 rounded-xl font-extrabold text-white text-sm hover:opacity-90 active:scale-95 transition-all" style={{background:DARK}}>🏁 Finalizar {tipoLabel}</button></div>)}</div>
      </div>
    </div>
    <button onClick={()=>{setEditIdx(null);setModal(true);}} className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-2xl text-white text-3xl flex items-center justify-center z-20 active:scale-90 hover:opacity-90 transition-all" style={{background:Y}}>+</button>
    {modal&&<ElementoModal el={editIdx!==null?informe.elementos[editIdx]:null} num={editIdx!==null?editIdx+1:(informe.elementos?.length||0)+1} onSave={saveEl} onClose={()=>setModal(false)}/>}
    {finalM&&<FinalizarModal informe={informe} onConfirm={handleFinalize} onClose={()=>setFinalM(false)}/>}
  </div>);
}

/* ══ ROOT ══ */
export default function App(){
  const[view,setV]=useState("login");const[usuario,setUsr]=useState<any>(()=>lsto.get("e_usr")||null);
  const[tipoNuevo,setTipo]=useState<string|null>(null);const[informes,setI]=useState<any[]>([]);
  const[loading,setLoad]=useState(true);const[active,setAct]=useState<any>(null);
  useEffect(()=>{if(!usuario){setLoad(false);return;}const q=query(collection(db,"informes"),orderBy("createdAt","desc"));const unsub=onSnapshot(q,(snap)=>{setI(snap.docs.map(d=>({...d.data(),id:d.id})));setLoad(false);},(err)=>{console.error("Firestore:",err);setLoad(false);});return()=>unsub();},[usuario]);
  useEffect(()=>{if(usuario)setV("selector");},[usuario]);
  const login=(u:any)=>{lsto.set("e_usr",u);setUsr(u);setV("selector");};
  const logout=()=>{lsto.set("e_usr",null);setUsr(null);setV("login");};
  const create=(data:any)=>{saveInformeFS(data);setAct(data);setV(data.tipo==="ac"?"ac":"insp");};
  const update=(inf:any)=>{setI(prev=>prev.map(i=>String(i.id)===String(inf.id)?inf:i));setAct(inf);};
  const open=(inf:any)=>{setAct(inf);setV(inf.tipo==="ac"?"ac":"insp");};
  const finalize=(inf:any)=>{setI(prev=>prev.map(i=>String(i.id)===String(inf.id)?inf:i));setAct(inf);setV("home");};
  const handleTipo=(t:string)=>{if(t==="home"){setV("home");return;}setTipo(t);setV("nuevo");};
  if(view==="login")    return<LoginView onLogin={login}/>;
  if(view==="selector") return<TipoSelectorView onSelect={handleTipo} usuario={usuario} onLogout={logout}/>;
  if(view==="home")     return<HomeView informes={informes} loading={loading} onNew={()=>setV("selector")} onOpen={open} usuario={usuario} onLogout={logout}/>;
  if(view==="nuevo")    return<NuevoView onCreate={create} onBack={()=>setV("selector")} usuario={usuario} tipo={tipoNuevo} informes={informes}/>;
  if(view==="insp")     return<InspeccionView informe={active} onUpdate={update} onBack={()=>setV("home")} onFinalize={finalize}/>;
  if(view==="ac")       return<MantenimientoACView informe={active} onUpdate={update} onBack={()=>setV("home")} onFinalize={finalize}/>;
}
