/**
 * National automated geocoding V2. Uses the imported LANGUAGE REVIEW tab.
 * Add as a new file in the existing bound Apps Script project.
 * Requires loadDrowningDistrictBoundaries_ and insideGeoGeometry_ from PinQualityAudit.
 * GEOAPIFY_API_KEY is a Script Property. Never sends original descriptions or source notes.
 * Creates GEO RESULTS V2; never writes to Dashboard Data or publishes coordinates.
 * Run geocodeDrowningV2Pilot() first; then geocodeDrowningV2NextBatch() to resume.
 */
function geocodeDrowningV2Pilot(){return geocodeDrowningV2Run_(25);}
function geocodeDrowningV2NextBatch(){return geocodeDrowningV2Run_(100);}
function geocodeDrowningV2Run_(maxRows){
  const key=PropertiesService.getScriptProperties().getProperty('GEOAPIFY_API_KEY');
  if(!key)throw new Error('Add GEOAPIFY_API_KEY in Project Settings > Script properties.');
  const lock=LockService.getDocumentLock();
  if(!lock.tryLock(1000))throw new Error('A geocoding run is already active.');
  try{
    const started=Date.now(),ss=SpreadsheetApp.getActiveSpreadsheet();
    const input=ss.getSheetByName('LANGUAGE REVIEW');
    if(!input||input.getLastRow()<2)throw new Error('Missing imported LANGUAGE REVIEW tab.');
    const data=input.getRange(1,1,input.getLastRow(),24).getValues(), h=data.shift();
    const names=['Location ID','Source row','District','Geometry / scope (provisional)','Primary geocoding query','Alternative geocoding query','Lookup status','Audit priority','Current latitude','Current longitude'];
    const ix=names.map(n=>h.indexOf(n));
    if(ix.some(i=>i<0))throw new Error('LANGUAGE REVIEW headers differ from the imported V2 workbook.');
    const records=data.filter(r=>r[ix[0]]).map(r=>ix.map(i=>r[i]));
    const composite=r=>String(r[0])+'|'+String(r[1]);
    if(new Set(records.map(composite)).size!==records.length)throw new Error('Duplicate ID + source-row combinations; resolve before proceeding.');
    const columns=['Location ID','Source row (reference)','Reported district','Scope','Audit priority','Primary query','Alternative query','Original latitude','Original longitude','Suggested latitude','Suggested longitude','Matched feature','Result type','Confidence (provider)','Candidate district','District check','Automated result','Distance moved (km)','Query selected','Map link','Attribution','Boundary source','Other candidate count','Reviewed decision (manual)','Verification evidence (manual)'];
    const safe=v=>typeof v==='string'&&/^[=+\-@]/.test(v)?"'"+v:v;
    const outName='GEO RESULTS V2';
    let out=ss.getSheetByName(outName);
    if(!out){
      out=ss.insertSheet(outName);
      if(out.getMaxRows()<records.length+1)out.insertRowsAfter(out.getMaxRows(),records.length+1-out.getMaxRows());
      if(out.getMaxColumns()<columns.length)out.insertColumnsAfter(out.getMaxColumns(),columns.length-out.getMaxColumns());
      out.getRange(1,1,1,columns.length).setValues([columns]).setBackground('#243B83').setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
      out.setRowHeight(1,42);
      out.getRange(2,1,records.length,9).setValues(records.map(r=>[r[0],r[1],r[2],r[3],r[7],r[4],r[5],r[8],r[9]].map(safe)));
      out.getRange(2,8,records.length,4).setNumberFormat('0.000000');
      out.getRange(2,14,records.length,1).setNumberFormat('0%');
      out.getRange(2,18,records.length,1).setNumberFormat('0.00');
      out.getRange(2,24,records.length,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['NOT REVIEWED','NEEDS LOCAL VERIFICATION','CONFIRMED POINT','CONFIRMED NON-POINT / MULTIPLE','WITHHOLD PIN','RETAIN EXISTING PIN'],true).setAllowInvalid(false).build());
      out.getRange(2,24,records.length,1).setValue('NOT REVIEWED');
      out.getRange(1,1,records.length+1,columns.length).createFilter();
      out.setFrozenRows(1);out.setFrozenColumns(3);
      [165,100,130,190,105,315,315,115,115,115,115,310,140,110,170,175,330,115,300,210,340,320,110,220,300].forEach((w,i)=>out.setColumnWidth(i+1,w));
      [4,6,7,12,17,19,21,22,25].forEach(c=>out.getRange(2,c,records.length,1).setWrap(true));
    }
    if(out.getLastRow()!==records.length+1)throw new Error('Result row count differs from LANGUAGE REVIEW. Do not overwrite prior reviews; inspect sheets.');
    const existingHeader=out.getRange(1,1,1,columns.length).getDisplayValues()[0];
    if(columns.some((c,i)=>existingHeader[i]!==c))throw new Error('GEO RESULTS V2 headers changed. No results overwritten.');
    const existing=out.getRange(2,1,records.length,columns.length).getValues();
    const byKey=new Map(records.map(r=>[composite(r),r]));
    for(const e of existing){
      const r=byKey.get(composite(e));
      if(!r||String(e[5])!==String(r[4])||String(e[6])!==String(r[5]))throw new Error('Source ID, row or query changed. Preserve existing review and reconcile before running again.');
    }
    const boundary=loadDrowningDistrictBoundaries_();
    if(!boundary.features.length)throw new Error('District boundaries unavailable. No geocoding requests made; retry later.');
    const norm=s=>String(s||'').toLowerCase().replace(/district|දිස්ත්‍රික්කය|மாவட்டம்/g,'').replace(/moneragala/g,'monaragala').replace(/[^a-z]/g,'');
    const known=new Set(boundary.features.map(f=>norm(f.district)));
    const pointTypes=new Set(['amenity','building','poi']);
    const statusCount={};let processed=0,requests=0,halt='';
    const cache=new Map();
    function lookup(q){
      if(cache.has(q))return cache.get(q);
      // Only curated geographic query cells may be sent. Do not paste private details into K/L.
      const url='https://api.geoapify.com/v1/geocode/search?text='+encodeURIComponent(q)+'&format=json&lang=en&filter=countrycode:lk&limit=5&apiKey='+encodeURIComponent(key);
      let response;
      try{response=UrlFetchApp.fetch(url,{muteHttpExceptions:true});}
      catch(e){return {error:'Network error; retry'};}
      requests++;
      const code=response.getResponseCode();
      if(code===401||code===403)return {stop:'API key rejected (HTTP '+code+')'};
      if(code===429)return {stop:'Provider quota or rate limit reached'};
      if(code!==200)return {error:'HTTP '+code+'; retry'};
      let result;
      try{result=JSON.parse(response.getContentText()).results;}catch(e){return {error:'Invalid API response; retry'};}
      if(!Array.isArray(result))return {error:'Missing results; retry'};
      Utilities.sleep(300);
      const value={results:result};cache.set(q,value);return value;
    }
    const order=existing.map((e,i)=>({e,i,r:byKey.get(composite(e))})).sort((a,b)=>Number(b.r[7]==='HIGH')-Number(a.r[7]==='HIGH')||a.i-b.i);
    for(const {e,i,r} of order){
      if(processed>=maxRows||Date.now()-started>235000)break;
      if(e[16]&&!String(e[16]).startsWith('RETRY'))continue;
      if(e[23]&&e[23]!=='NOT REVIEWED')continue;
      const row=i+2,scope=String(r[3]||''),status=String(r[6]||'');
      const queries=[...new Set([r[4],r[5]].map(q=>String(q||'').trim()).filter(Boolean))];
      function write(values){
        out.getRange(row,10,1,14).setValues([values.map(safe)]);
        processed++;statusCount[values[7]]=(statusCount[values[7]]||0)+1;
      }
      const blank=(message)=>['','','','','','','',message,'','','','',boundary.note,0];
      if(status.startsWith('HOLD')||!queries.length){write(blank('HOLD — insufficient hazard detail'));continue;}
      if(queries.some(q=>/\b(?:mr|mrs|miss|dr)\.?\s|\b(?:private residence|private house|house of|residence of|home of)\b/i.test(q))){
        write(blank('HOLD — check query for personal details'));continue;
      }
      let candidates=[],error='';
      const expected=norm(r[2]);
      for(const q of queries){
        const res=lookup(q);
        if(res.stop){halt=res.stop;break;}
        if(res.error){error=res.error;break;}
        for(const p of res.results){
          if(p.lat==null||p.lon==null)continue;
          const lat=Number(p.lat),lon=Number(p.lon);
          if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<5.7||lat>10.1||lon<79.3||lon>82.2)continue;
          const district=boundary.features.filter(f=>insideGeoGeometry_(lon,lat,f.geometry)).map(f=>f.district);
          const match=known.has(expected)&&district.some(d=>norm(d)===expected);
          const raw=p.rank&&p.rank.confidence,confidence=raw==null?null:Number(raw);
          const kind=String(p.result_type||'unknown');
          const label=String(p.name||p.address_line1||'');
          const tokens=label.toLowerCase().match(/[a-z]{4,}/g)||[];
          const qTokens=new Set(q.toLowerCase().match(/[a-z]{4,}/g)||[]);
          const clue=tokens.some(w=>qTokens.has(w)&&!['lanka','district','division','province','village','north','south','east','west','road','street','town','office','bridge','river','waterfall','beach'].includes(w));
          const specific=pointTypes.has(kind)&&clue;
          candidates.push({p,q,lat,lon,district,match,confidence:Number.isFinite(confidence)?confidence:null,kind,specific});
        }
      }
      if(halt)break;
      if(error){write(blank('RETRY — '+error));continue;}
      if(!candidates.length){write(blank('NO MATCH — local verification'));continue;}
      const unique=new Map();
      candidates.sort((a,b)=>Number(b.match)-Number(a.match)||Number(b.specific)-Number(a.specific)||(b.confidence??-1)-(a.confidence??-1));
      for(const c of candidates){
        const k=c.lat.toFixed(5)+'|'+c.lon.toFixed(5);
        if(!unique.has(k))unique.set(k,c);
      }
      candidates=[...unique.values()];
      const b=candidates[0],p=b.p;
      const check=!known.has(expected)?'DISTRICT NAME UNRECOGNISED':b.match?'DISTRICT MATCH':b.district.length?'DISTRICT MISMATCH':'OUTSIDE POLYGONS / BOUNDARY';
      const other=candidates.slice(1).some(c=>c.match&&c.specific&&drowningV2Distance_(c.lat,c.lon,b.lat,b.lon)>1&&c.confidence!==null&&b.confidence!==null&&c.confidence>=b.confidence-0.1);
      let result='REFERENCE ONLY — exact hazard not identified';
      if(!b.match)result='REVIEW — '+check;
      else if(!/^Point$/i.test(scope)||!status.startsWith('POINT SEARCH'))result='REFERENCE ONLY — unclear or non-point scope';
      else if(other)result='REVIEW — competing feature matches';
      else if(b.specific&&b.confidence!==null&&b.confidence>=0.7)result='POINT CANDIDATE — independent confirmation required';
      const oldLat=r[8]===''||r[8]==null?NaN:Number(r[8]),oldLon=r[9]===''||r[9]==null?NaN:Number(r[9]);
      const move=Number.isFinite(oldLat)&&Number.isFinite(oldLon)&&oldLat>=5.7&&oldLat<=10.1&&oldLon>=79.3&&oldLon<=82.2?drowningV2Distance_(oldLat,oldLon,b.lat,b.lon):'';
      const ds=p.datasource||{},attrib=['Powered by Geoapify https://www.geoapify.com/',ds.attribution||ds.sourcename,ds.license,ds.url].filter(Boolean).join(' | ');
      const href='https://www.openstreetmap.org/?mlat='+b.lat.toFixed(6)+'&mlon='+b.lon.toFixed(6)+'#map=17/'+b.lat.toFixed(6)+'/'+b.lon.toFixed(6);
      write([b.lat,b.lon,p.formatted||p.name||'',b.kind,b.confidence===null?'':b.confidence,b.district.join(' / '),check,result,move,b.q,href,attrib,boundary.note,candidates.length-1]);
    }
    SpreadsheetApp.flush();
    const all=out.getRange(2,17,records.length,1).getDisplayValues().flat();
    const pending=all.filter(s=>!s||s.startsWith('RETRY')).length;
    console.log('Processed this run: '+processed+' | API requests: '+requests+' | Pending or retry: '+pending+' / '+records.length);
    console.log('Results: '+JSON.stringify(statusCount));
    if(halt)console.warn(halt+'; existing results saved. Fix the issue before continuing.');
    console.log('See GEO RESULTS V2. No original coordinates changed. No results automatically published.');
  }finally{lock.releaseLock();}
}
function drowningV2Distance_(a,b,c,d){
  const rad=Math.PI/180,x=(c-a)*rad,y=(d-b)*rad;
  const h=Math.sin(x/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(y/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
