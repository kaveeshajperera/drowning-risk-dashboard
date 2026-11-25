/**
 * Drowning risk map: automated candidate discovery (21-record pilot).
 * Requires PinQualityAudit.gs and PinCandidateValidation.gs in the same bound project.
 * Set GEOAPIFY_API_KEY in Apps Script > Project Settings > Script properties.
 * Run autoFindDrowningCandidates(). Never changes Dashboard Data or publishes coordinates.
 * Only the refined geographical query in G is sent externally, NOT original descriptions.
 * Geoapify / underlying data-source attribution must be retained for any reused results.
 */
function autoFindDrowningCandidates() {
  const key=PropertiesService.getScriptProperties().getProperty('GEOAPIFY_API_KEY');
  if(!key)throw new Error('Set GEOAPIFY_API_KEY in Project Settings > Script properties first.');
  const lock=LockService.getDocumentLock();
  if(!lock.tryLock(1000))throw new Error('Another candidate lookup is running.');
  try{
    const sheet=drowningCandidateSheet_();
    prepareDrowningCandidateReview();
    const count=sheet.getLastRow()-1;
    const headers=['Suggested latitude','Suggested longitude','Matched place','Result type','Geocoder confidence','Candidate district (auto)','Automated result','Data attribution','Open reference point','Search query used'];
    if(sheet.getMaxColumns()<35)sheet.insertColumnsAfter(sheet.getMaxColumns(),35-sheet.getMaxColumns());
    const existing=sheet.getRange(1,26,1,10).getDisplayValues()[0];
    if(existing.some((v,i)=>v&&v!==headers[i]))throw new Error('Columns Z:AI contain other information. Move those columns before running.');
    sheet.getRange(1,26,1,10).setValues([headers]).setBackground('#243B83').setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
    sheet.getRange(2,26,count,2).setNumberFormat('0.000000');
    sheet.getRange(2,30,count,1).setNumberFormat('0%');
    [120,120,330,150,135,180,325,320,260,320].forEach((w,i)=>sheet.setColumnWidth(26+i,w));
    sheet.getRange(2,26,count,10).setWrap(true).setVerticalAlignment('top');
    const rows=sheet.getRange(2,1,count,19).getValues();
    const previous=sheet.getRange(2,26,count,10).getValues();
    const boundary=loadDrowningDistrictBoundaries_();
    const norm=s=>String(s||'').toLowerCase().replace(/district|දිස්ත්‍රික්කය|மாவட்டம்/g,'').replace(/moneragala/g,'monaragala').replace(/[^a-z]/g,'');
    const known=new Set(boundary.features.map(f=>norm(f.district)));
    const safe=s=>/^[=+\-@]/.test(String(s))?"'"+String(s):String(s||'');
    const pointTypes=new Set(['amenity','building','poi']);
    let searched=0,found=0,specific=0,review=0,skipped=0;
    const maxQueries=30;
    for(let i=0;i<rows.length;i++){
      const r=rows[i],row=i+2;
      const id=String(r[0]),district=String(r[1]),query=String(r[6]||'').trim(),scope=String(r[7]||'').trim(),decision=String(r[12]||'');
      // Do not override an existing review or a manually entered candidate.
      if(r[9]!==''||r[10]!==''||!['NOT REVIEWED','NEEDS LOCAL VERIFICATION','CANDIDATE IDENTIFIED',''].includes(decision)){skipped++;continue;}
      if(previous[i][6] && previous[i][9]===query && !/^RETRY/.test(previous[i][6])){skipped++;continue;}
      if(!query){
        sheet.getRange(row,26,1,10).setValues([['','','','','','','NO SAFE SEARCH QUERY','','','']]);review++;continue;
      }
      if(searched>=maxQueries){console.log('Batch limit reached. Run again to continue.');break;}
      // G contains deliberately curated public geographic terms. Never copy household names
      // or the original long report from C into this query.
      const url='https://api.geoapify.com/v1/geocode/search?text='+encodeURIComponent(query)+
        '&format=json&filter=countrycode:lk&bias=countrycode:lk&limit=5&apiKey='+encodeURIComponent(key);
      let response;
      try{response=UrlFetchApp.fetch(url,{muteHttpExceptions:true});}
      catch(e){sheet.getRange(row,32).setValue('RETRY: network error');review++;continue;}
      searched++;
      const status=response.getResponseCode();
      if(status===401||status===403)throw new Error('Geoapify rejected the key or its permissions (HTTP '+status+'). Check your private key.');
      if(status===429){console.log('Geoapify quota/rate limit reached; rerun later.');break;}
      if(status!==200){
        sheet.getRange(row,26,1,10).setValues([['','','','','','','RETRY: HTTP '+status,'','',query]]);review++;continue;
      }
      let results;
      try{results=JSON.parse(response.getContentText()).results;}catch(e){results=null;}
      if(!Array.isArray(results)){sheet.getRange(row,26,1,10).setValues([['','','','','','','RETRY: invalid API response','','',query]]);review++;continue;}
      const candidates=results.filter(p=>p.lat!=null&&p.lon!=null&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))&&p.lat>=5.7&&p.lat<=10.1&&p.lon>=79.3&&p.lon<=82.2).map(p=>{
        const actual=boundary.features.filter(f=>insideGeoGeometry_(Number(p.lon),Number(p.lat),f.geometry)).map(f=>f.district);
        const match=known.has(norm(district))&&actual.some(d=>norm(d)===norm(district));
        const confidence=Number(p.rank&&p.rank.confidence);
        const name=String(p.name||p.address_line1||'');
        const words=name.toLowerCase().match(/[a-z]{4,}/g)||[];
        const nameClue=words.some(w=>!['sri','lanka','district','division','province','road','street','town','village','north','south','east','west'].includes(w)&&query.toLowerCase().includes(w));
        return {p,actual,match,confidence:Number.isFinite(confidence)?confidence:null,nameClue,detail:pointTypes.has(String(p.result_type))};
      }).sort((a,b)=>Number(b.match)-Number(a.match)||Number(b.detail&&b.nameClue)-Number(a.detail&&a.nameClue)||(b.confidence??-1)-(a.confidence??-1));
      if(!candidates.length){
        sheet.getRange(row,26,1,10).setValues([['','','','','','','NO MATCH — local verification','','',query]]);review++;
        Utilities.sleep(300);continue;
      }
      found++;
      const best=candidates[0],p=best.p,lat=Number(p.lat),lon=Number(p.lon);
      const kind=String(p.result_type||'unknown');
      const ds=p.datasource||{};
      const attribution=['Powered by Geoapify (https://www.geoapify.com/)',ds.attribution||ds.sourcename,ds.license,ds.url].filter(Boolean).join(' | ');
      let outcome='REFERENCE ONLY — locality/feature match; exact hazard not confirmed';
      // Even a high-confidence geocoder only verifies a named feature, not a hazard.
      // Fill J/K ONLY for a single point with a specific named feature and district match.
      const canSuggest=/^point$/i.test(scope)&&best.match&&best.detail&&best.nameClue&&best.confidence!==null&&best.confidence>=0.7;
      if(!boundary.features.length||!known.has(norm(district)))outcome='REFERENCE ONLY — district check unavailable';
      else if(!best.match)outcome='REVIEW — district mismatch or boundary ambiguity';
      else if(!/^point$/i.test(scope))outcome='REFERENCE ONLY — scope is not a confirmed single point';
      else if(canSuggest)outcome='POINT CANDIDATE — requires independent confirmation';
      const href='https://www.openstreetmap.org/?mlat='+lat.toFixed(6)+'&mlon='+lon.toFixed(6)+'#map=17/'+lat.toFixed(6)+'/'+lon.toFixed(6);
      sheet.getRange(row,26,1,10).setValues([[lat,lon,safe(p.formatted||p.name||''),safe(kind),best.confidence===null?'':best.confidence,safe(best.actual.join(' / ')),outcome,safe(attribution),href,query]]);
      // Never overwrite anything entered by a reviewer, even during this run.
      if(canSuggest&&sheet.getRange(row,10,1,2).getValues()[0].every(v=>v==='')&&['','NOT REVIEWED','CANDIDATE IDENTIFIED','NEEDS LOCAL VERIFICATION'].includes(sheet.getRange(row,13).getValue())){
        sheet.getRange(row,10,1,2).setValues([[lat,lon]]);
        sheet.getRange(row,13).setValue('CANDIDATE IDENTIFIED');
        specific++;
      }else review++;
      Utilities.sleep(300);
    }
    SpreadsheetApp.flush();
    console.log('Automated search: '+searched+' requests; '+found+' returned reference locations; '+specific+' point candidates filled in J/K; '+review+' need further review; '+skipped+' already handled.');
    console.log('District source: '+boundary.note);
    console.log('See Z:AI for all suggested coordinates and match details. Dashboard Data unchanged.');
    console.log('All results remain unverified. Keep Geoapify and underlying data-source attribution when reusing them.');
  }finally{lock.releaseLock();}
}
