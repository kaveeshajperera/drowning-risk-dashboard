/**
 * Candidate checks for the PIN CORRECTIONS pilot.
 * Add this as a NEW file to the same Apps Script project as PinQualityAudit.
 * Run prepareDrowningCandidateReview() once; enter candidate coordinates;
 * run validateDrowningCandidates() to assess the proposed points.
 * This script NEVER writes to Dashboard Data or changes publication settings.
 */
function prepareDrowningCandidateReview() {
  const sheet = drowningCandidateSheet_();
  const count = sheet.getLastRow() - 1;
  if (sheet.getMaxColumns() < 25) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 25-sheet.getMaxColumns());
  }
  const headers = ['Candidate district','District check','Move distance (km)','Coordinate check','Review readiness','Boundary source'];
  const existing=sheet.getRange(1,20,1,6).getDisplayValues()[0];
  if (existing.some((v,i)=>v && v!==headers[i])) {
    throw new Error('Columns T:Y already contain other information. Move that information before running this tool.');
  }
  // Repair the map-link formula from the original pilot.
  sheet.getRange(2,12,count,1).setFormulas(Array.from({length:count},(_,i)=>{
    const n=i+2;
    return ['=IF(AND(ISNUMBER(J'+n+'),ISNUMBER(K'+n+')),HYPERLINK("https://www.google.com/maps?q="&J'+n+'&","&K'+n+',"View candidate"),"")'];
  }));
  sheet.getRange(1,20,1,6).setValues([headers]).setBackground('#243B83')
    .setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
  sheet.getRange(2,22,count,1).setNumberFormat('0.00');
  [185,200,135,260,290,300].forEach((w,i)=>sheet.setColumnWidth(i+20,w));
  sheet.getRange(2,20,count,6).setWrap(true).setVerticalAlignment('top');
  // Expand the existing filter so the new columns are filterable too.
  // Preserve any active filter criteria.
  const filter=sheet.getFilter();
  if(!filter) sheet.getRange(1,1,count+1,25).createFilter();
  else if(filter.getRange().getLastColumn()<25){
    const criteria=[];
    for(let c=1;c<=filter.getRange().getLastColumn();c++){
      const x=filter.getColumnFilterCriteria(c);if(x)criteria.push([c,x]);
    }
    filter.remove();
    const fresh=sheet.getRange(1,1,count+1,25).createFilter();
    criteria.forEach(([c,x])=>fresh.setColumnFilterCriteria(c,x));
  }
  SpreadsheetApp.flush();
  console.log('Candidate review ready. Enter independently located candidate coordinates in J/K. Dashboard Data unchanged.');
}

function validateDrowningCandidates() {
  prepareDrowningCandidateReview();
  const sheet=drowningCandidateSheet_();
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,19).getValues();
  const number=v=>v===''||v===null||typeof v==='boolean'?null:
    (Number.isFinite(Number(v))?Number(v):null);
  const valid=(lat,lon)=>lat!==null&&lon!==null&&lat>=5.7&&lat<=10.1&&lon>=79.3&&lon<=82.2;
  const norm=s=>String(s||'').toLowerCase().replace(/district|දිස්ත්‍රික්කය|மாவட்டம்/g,'')
    .replace(/moneragala/g,'monaragala').replace(/[^a-z]/g,'');
  const pairs=rows.map(r=>[number(r[9]),number(r[10])]);
  const group=new Map();
  pairs.forEach(([lat,lon],i)=>{
    if(!valid(lat,lon))return;
    const key=lat.toFixed(5)+'|'+lon.toFixed(5);
    if(!group.has(key))group.set(key,[]);
    group.get(key).push(String(rows[i][0]));
  });
  const hasCandidates=pairs.some(([lat,lon])=>valid(lat,lon));
  const boundary=hasCandidates?loadDrowningDistrictBoundaries_():{features:[],note:'No valid candidate coordinates entered'};
  const districtSet=new Set(boundary.features.map(f=>norm(f.district)));
  let validCount=0, matchCount=0, mismatchCount=0, missingCount=0;
  const output=rows.map((r,i)=>{
    const [lat,lon]=pairs[i],decision=String(r[12]||'');
    const evidence=String(r[13]||'').trim(), reviewer=String(r[17]||'').trim(),date=r[18];
    const scope=String(r[7]||'');
    if(lat===null&&lon===null){
      missingCount++;
      return ['','NOT ASSESSED','','NO CANDIDATE',decision==='WITHHOLD PIN'||decision==='CONFIRMED NON-POINT / MULTIPLE'?'No replacement point proposed — manual review only':'Enter a candidate only if the actual hazard can be located',boundary.note];
    }
    if(!valid(lat,lon)){
      return ['','NOT ASSESSED','','INVALID / INCOMPLETE COORDINATES','Correct J and K; do not publish',boundary.note];
    }
    validCount++;
    const districts=boundary.features.filter(f=>insideGeoGeometry_(lon,lat,f.geometry)).map(f=>f.district);
    const expected=norm(r[1]);
    let districtCheck='BOUNDARIES UNAVAILABLE';
    if(boundary.features.length){
      if(!districtSet.has(expected))districtCheck='DISTRICT NAME UNRECOGNISED';
      else if(!districts.length)districtCheck='OUTSIDE POLYGONS / BOUNDARY';
      else if(districts.some(d=>norm(d)===expected)){districtCheck='DISTRICT MATCH';matchCount++;}
      else{districtCheck='DISTRICT MISMATCH';mismatchCount++;}
    }
    const oldLat=number(r[3]),oldLon=number(r[4]);
    const move=valid(oldLat,oldLon)?drowningMoveDistance_(oldLat,oldLon,lat,lon):'';
    const matches=group.get(lat.toFixed(5)+'|'+lon.toFixed(5))||[];
    const flags=[];
    if(matches.length>1)flags.push('SHARED CANDIDATE ('+matches.length+' records)');
    if(typeof move==='number'&&move<0.002)flags.push('SAME / NEAR-SAME AS ORIGINAL');
    if(!flags.length)flags.push('NUMERIC CHECK PASSED');
    let readiness='Manual verification needed — district match does not verify the hazard';
    if(decision==='CONFIRMED POINT'){
      if(!evidence||!reviewer||!date)readiness='Missing verification source, reviewer or date';
      else if(!/^Point$/i.test(scope.trim()))readiness='Clarify scope as a single confirmed point before publication';
      else if(matches.length>1)readiness='Review duplicate candidate before publication';
      else if(districtCheck!=='DISTRICT MATCH')readiness='Resolve district / boundary issue before publication';
      else readiness='Eligible for final manual review — NOT automatically published';
    }else if(decision==='WITHHOLD PIN'||decision==='CONFIRMED NON-POINT / MULTIPLE'){
      readiness='Do not replace with a point; resolve scope / withholding separately';
    }else if(decision==='RETAIN EXISTING PIN'){
      readiness='Review evidence for retaining existing coordinates';
    }
    return [districts.join(' / '),districtCheck,move,flags.join('; '),readiness,boundary.note];
  });
  sheet.getRange(2,20,output.length,6).setValues(output);
  SpreadsheetApp.flush();
  console.log('Candidate audit: '+rows.length+' rows; '+validCount+' valid coordinate pairs; '+matchCount+' district matches; '+mismatchCount+' mismatches; '+missingCount+' blank candidates.');
  console.log('Boundary source: '+boundary.note);
  console.log('Dashboard Data unchanged. A district match is not proof of an exact hazard location.');
}

function drowningCandidateSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const sheet=ss&&ss.getSheetByName('PIN CORRECTIONS');
  if(!sheet||sheet.getLastRow()<2)throw new Error('Create PIN CORRECTIONS using createDrowningPinReviewQueue first.');
  const h=sheet.getRange(1,1,1,19).getDisplayValues()[0];
  const expected={0:'Location ID',1:'Reported district',3:'Current latitude',4:'Current longitude',
    7:'Geometry / scope (provisional)',9:'Candidate latitude',10:'Candidate longitude',11:'Open candidate pin',
    12:'Review decision',13:'Verification evidence / source',17:'Reviewer',18:'Review date'};
  Object.keys(expected).forEach(i=>{if(h[Number(i)]!==expected[i])throw new Error('PIN CORRECTIONS header mismatch at column '+(Number(i)+1));});
  return sheet;
}
function drowningMoveDistance_(a,b,c,d){
  const rad=Math.PI/180, p=(c-a)*rad,q=(d-b)*rad;
  const h=Math.sin(p/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(q/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
