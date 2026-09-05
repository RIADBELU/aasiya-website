/* Aasiya Musalla — shared site logic
   Reads the SAME Google Sheet as prayerdisplay.html (Iqamah / Announcements / Settings)
   and the same AlAdhan source for adhan times, so the website and the TV never disagree. */
(function(){
"use strict";

/* ---- 1. Configuration (identical to prayerdisplay.html) ---- */
const SHEET_ID="12xXahqFCckMn7HKj1waRX1K793I192xOlzBUEEkp4Qk";
const API_KEY ="AIzaSyCab1DAeTCapEMj0ZoYGdKY6jEX2DRFtPk";
const LAT=50.4452, LNG=-104.6189, TZ="America/Regina";
const ALADHAN="https://api.aladhan.com/v1/calendar/{Y}/{M}?latitude="+LAT+"&longitude="+LNG+"&method=2&school=0&timezonestring="+TZ;

const CFG={ maghribIqamahMinutes:5, highlightHoldMinutes:10, hijriOffset:0, location:"Regina, Saskatchewan", mosqueName:"Aasiya Musalla" };
const PRAYERS=[
  {key:"fajr",   label:"Fajr",   ar:"الفجر"},
  {key:"dhuhr",  label:"Dhuhr",  ar:"الظهر"},
  {key:"asr",    label:"Asr",    ar:"العصر"},
  {key:"maghrib",label:"Maghrib",ar:"المغرب"},
  {key:"isha",   label:"Isha",   ar:"العشاء"}];

const SHEET_CACHE="aasiya.site.sheet.v1", ADHAN_CACHE="aasiya.aladhan.cache.v1";
let SHEET={iqamah:[],announcements:[],settings:[],fetchedAt:0,live:false};
let ADHAN={};   // "YYYY-M" -> array of day objects from AlAdhan

try{ const c=JSON.parse(localStorage.getItem(SHEET_CACHE)||"null"); if(c&&c.iqamah) SHEET=Object.assign(SHEET,c,{live:false}); }catch(e){}
try{ ADHAN=JSON.parse(localStorage.getItem(ADHAN_CACHE)||"{}")||{}; }catch(e){ ADHAN={}; }

/* ---- 2. Time helpers ---- */
function mosqueNow(){
  const now=new Date();
  try{
    const f=new Intl.DateTimeFormat("en-US",{timeZone:TZ,hourCycle:"h23",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric",second:"numeric",weekday:"short"});
    const p={}; f.formatToParts(now).forEach(x=>p[x.type]=x.value);
    const h=(+p.hour)%24;
    return {y:+p.year,m:+p.month,d:+p.day,h:h,mi:+p.minute,s:+p.second,hours:h+(+p.minute)/60+(+p.second)/3600};
  }catch(e){
    return {y:now.getFullYear(),m:now.getMonth()+1,d:now.getDate(),h:now.getHours(),mi:now.getMinutes(),s:now.getSeconds(),hours:now.getHours()+now.getMinutes()/60+now.getSeconds()/3600};
  }
}
function wrap(h,n){ h=h%n; if(h<0)h+=n; return h; }
function fmtTime(h){
  if(h===null||h===undefined||isNaN(h)) return "—";
  h=wrap(h+0.5/60,24);
  const hh=Math.floor(h), mm=Math.floor((h-hh)*60);
  let H=hh%12; if(H===0)H=12;
  return H+":"+String(mm).padStart(2,"0")+" "+(hh<12?"AM":"PM");
}
function hmsToHours(s){ const m=String(s||"").match(/(\d{1,2}):(\d{2})/); return m?(+m[1])+(+m[2])/60:null; }
function pad2(n){ return String(n).padStart(2,"0"); }

/* ---- 3. Sheet grammar (same as the display) ---- */
function parseDateKey(s){
  if(s==null) return null; s=String(s).trim(); if(!s) return null;
  let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/); if(m) return (+m[1])*10000+(+m[2])*100+(+m[3]);
  m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/); if(m) return (+m[3])*10000+(+m[1])*100+(+m[2]);
  const d=new Date(s); if(!isNaN(d)) return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
  return null;
}
function iqamahRowFor(y,m,d){
  const today=y*10000+m*100+d; let best=null,bestKey=-1;
  (SHEET.iqamah||[]).forEach(row=>{ const k=parseDateKey(row[0]); if(k!==null&&k<=today&&k>=bestKey){bestKey=k;best=row;} });
  return best||(SHEET.iqamah&&SHEET.iqamah[0])||[];
}
function resolveIqamah(cell,begin,dflt){
  let s=String(cell==null?"":cell).trim(); if(!s) s=dflt||"+10";
  let round=0; const rm=s.match(/\^\s*(\d+)/); if(rm){round=+rm[1]; s=s.replace(/\^\s*\d+/,"").trim();}
  let hours=null;
  if(/^[+]/.test(s)){ const mins=parseInt(s.slice(1),10); if(!isNaN(mins)&&begin!=null) hours=begin+mins/60; }
  else{ const m=s.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm|a|p)?$/i);
    if(m){ let H=+m[1]; const M=+m[2]; const ap=(m[3]||"").toLowerCase();
      if(ap.startsWith("p")&&H<12)H+=12; if(ap.startsWith("a")&&H===12)H=0;
      if(!ap&&H<=11&&begin!=null&&begin>=12)H+=12; hours=H+M/60; } }
  if(hours===null) return {hours:null,text:s};
  if(round>0){ let mins=Math.round(hours*60); mins=Math.ceil(mins/round)*round; hours=mins/60; }
  return {hours:hours,text:null};
}
function applySettings(){
  (SHEET.settings||[]).forEach(r=>{ const k=String(r[0]||"").trim(), v=r[1];
    if(!k||k.toLowerCase()==="key") return;
    if(k in CFG){ CFG[k]= typeof CFG[k]==="number" ? (isNaN(+v)?CFG[k]:+v) : String(v==null?"":v); } });
}

/* ---- 4. Data fetch ---- */
function fetchSheet(){
  const ranges=["Iqamah!A1:Z400","Announcements!A1:Z400","Settings!A1:Z200"].map(r=>"ranges="+encodeURIComponent(r)).join("&");
  const url="https://sheets.googleapis.com/v4/spreadsheets/"+SHEET_ID+"/values:batchGet?"+ranges+"&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&key="+API_KEY;
  return fetch(url,{cache:"no-store"}).then(r=>{ if(!r.ok) throw new Error("sheet "+r.status); return r.json(); }).then(j=>{
    const vr=j.valueRanges||[]; const strip=g=>(g&&g.values||[]).slice(1).filter(r=>r.some(c=>String(c||"").trim()));
    SHEET={iqamah:strip(vr[0]),announcements:strip(vr[1]),settings:strip(vr[2]),fetchedAt:Date.now(),live:true};
    try{ localStorage.setItem(SHEET_CACHE,JSON.stringify(SHEET)); }catch(e){}
    applySettings(); return SHEET;
  });
}
function fetchAdhan(y,m){
  const key=y+"-"+m; if(ADHAN[key]) return Promise.resolve(ADHAN[key]);
  return fetch(ALADHAN.replace("{Y}",y).replace("{M}",m)).then(r=>r.json()).then(j=>{
    if(!j||!j.data) throw new Error("aladhan"); ADHAN[key]=j.data;
    try{ localStorage.setItem(ADHAN_CACHE,JSON.stringify(ADHAN)); }catch(e){}
    return j.data;
  });
}
function timesFor(n){
  const days=ADHAN[n.y+"-"+n.m]; if(!days) return null;
  const day=days.find(x=>+x.date.gregorian.day===n.d); if(!day) return null;
  const t=day.timings, g=k=>hmsToHours(t[k]);
  return {fajr:g("Fajr"),sunrise:g("Sunrise"),dhuhr:g("Dhuhr"),asr:g("Asr"),maghrib:g("Sunset"),isha:g("Isha"),hijri:day.date.hijri};
}

/* ---- 5. Day model ---- */
function buildDay(n){
  const t=timesFor(n); if(!t) return null;
  const row=iqamahRowFor(n.y,n.m,n.d);
  const out=PRAYERS.map((p,i)=>{
    const dflt=p.key==="maghrib"?"+"+Math.round(CFG.maghribIqamahMinutes):"+10";
    const iq=resolveIqamah(row[i+1],t[p.key],dflt);
    return Object.assign({},p,{begin:t[p.key],iq:iq.hours,iqText:iq.text});
  });
  return {prayers:out,sunrise:t.sunrise,sunset:t.maghrib,hijri:t.hijri};
}
function focusIndex(day,now){
  // Same rule as the TV: a prayer stays "current" until highlightHoldMinutes after its iqamah.
  for(let i=0;i<day.prayers.length;i++){ const p=day.prayers[i];
    const end=Math.max(p.iq==null?p.begin:p.iq,p.begin)+CFG.highlightHoldMinutes/60;
    if(now<end) return i; }
  return -1; // past Isha hold → tomorrow's Fajr
}
function hijriText(h){
  if(!h) return "";
  const off=Math.round(CFG.hijriOffset||0);
  let d=+h.day+off, mo=h.month.en, y=h.year;
  return d+" "+mo+" "+y+" AH";
}

/* ---- 6. Announcements ---- */
function activeAnnouncements(n){
  const today=n.y*10000+n.m*100+n.d;
  return (SHEET.announcements||[]).map(r=>({message:String(r[0]||"").trim(),start:parseDateKey(r[1]),end:parseDateKey(r[2]),startRaw:r[1]||"",endRaw:r[2]||""}))
    .filter(a=>a.message).filter(a=>(a.start===null||a.start<=today)&&(a.end===null||a.end>=today));
}
function announcementState(a,n){
  const today=n.y*10000+n.m*100+n.d;
  if(a.end!==null&&a.end<today) return "past";
  if(a.start!==null&&a.start>today) return "sched";
  return "live";
}

/* ---- 7. Public API ---- */
window.Aasiya={CFG,PRAYERS,SHEET:()=>SHEET,mosqueNow,fmtTime,pad2,fetchSheet,fetchAdhan,buildDay,focusIndex,hijriText,activeAnnouncements,announcementState,parseDateKey,applySettings,SHEET_ID,timesFor,resolveIqamah,iqamahRowFor};
})();
