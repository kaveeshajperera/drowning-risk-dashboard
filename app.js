(() => {
  'use strict';
  const config = window.DASHBOARD_CONFIG;
  const districts = window.SRI_LANKA_DISTRICTS || [];
  const districtNames = districts.map(d => d.name);
  const state = {
    view:'overview', district:'', rows:[], loaded:false, loadError:false,
    map:null, boundaryLayer:null, markerLayer:null, mapReady:false,
    showHigh:true, showLow:false, showUnknown:false, showCrocodile:true
  };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (input) => String(input ?? '').replace(/[&<>"']/g, chr => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[chr]));
  const s = (v) => String(v ?? '').trim();
  const norm = (v) => s(v).toLowerCase().replace(/district/gi,'').replace(/[\s_-]+/g,' ').replace(/[^a-z ]/g,'').trim();
  function canonicalDistrict(value) {
    const key = norm(value).replace(/moneragala/,'monaragala').replace(/nuwaraeliya/,'nuwara eliya').replace(/kilinochchi/,'kilinochchi');
    return districtNames.find(d => norm(d) === key) || s(value);
  }
  const byDistrict = row => !state.district || norm(row.district) === norm(state.district);
  function parseBoolean(value) { return ['yes','true','1','reported','present','y'].includes(s(value).toLowerCase()); }
  function classify(value) {
    const v=s(value).toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ');
    if(['high','high risk','high risk area','high risk location'].includes(v))return 'high';
    if(['low','low risk','lower risk','low risk area','lower risk area'].includes(v))return 'low';
    return 'unknown';
  }
  function col(row,...names) {
    for(const name of names) {
      const key=Object.keys(row).find(k=> k.toLowerCase().replace(/[^a-z0-9]/g,'')===name.toLowerCase().replace(/[^a-z0-9]/g,''));
      if(key!==undefined && s(row[key])!=='') return row[key];
    }
    return '';
  }
  function normalizeRow(row,index) {
    const locationName=s(col(row,'locationName','location','placeName','riskLocation','site'));
    const latRaw=col(row,'latitude','lat'),lngRaw=col(row,'longitude','lng','lon');
    const lat=latRaw===''?null:Number(latRaw),lng=lngRaw===''?null:Number(lngRaw);
    const coordsValid=Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=5.7&&lat<=10.1&&lng>=79.3&&lng<=82.2;
    return {
      id:s(col(row,'id','locationId'))||`site-${index+1}`,
      locationName, district:canonicalDistrict(col(row,'district')),
      mohArea:s(col(row,'mohArea','moh')),dsDivision:s(col(row,'dsDivision','ds')),
      gnDivision:s(col(row,'gnDivision','gn')),risk:classify(col(row,'riskLevel','risk','riskCategory','riskClassification')),
      waterbodyType:s(col(row,'waterbodyType','waterbody','waterBodyType')),
      latitude:coordsValid?lat:null,longitude:coordsValid?lng:null,
      crocodileHazard:parseBoolean(col(row,'crocodileHazard','crocodile','crocodileRisk')),
      notes:s(col(row,'notes','remarks')),source:s(col(row,'source')),
      reportYear:s(col(row,'reportYear','year'))
    };
  }
  function parseCSV(csv) {
    // Supports quoted values, embedded commas, double quotes and line breaks.
    const rows=[],fields=[];let field='',inQuotes=false;
    for(let i=0;i<csv.length;i++) {
      const c=csv[i];
      if(c==='"'){
        if(inQuotes && csv[i+1]==='"'){field+='"';i++;}
        else inQuotes=!inQuotes;
      } else if(c===','&&!inQuotes){fields.push(field);field='';}
      else if((c==='\r'||c==='\n')&&!inQuotes){
        if(c==='\r'&&csv[i+1]==='\n')i++;
        fields.push(field);field='';
        if(fields.some(f=>s(f)!==''))rows.push(fields.splice(0));else fields.length=0;
      } else field+=c;
    }
    if(field!==''||fields.length){fields.push(field);if(fields.some(f=>s(f)!==''))rows.push(fields);}
    if(!rows.length)return [];
    const headers=rows.shift().map((v,i)=>i===0?v.replace(/^\uFEFF/,'').trim():v.trim());
    return rows.map(cols=>Object.fromEntries(headers.map((key,i)=>[key,cols[i]??''])));
  }
  function setNavigation(view) {
    state.view=view;
    const sectionView=view==='risk-map'?'overview':view;
    $$('[data-view-content]').forEach(node=>node.hidden=node.dataset.viewContent!==sectionView);
    $$('.nav-link').forEach(node=>{const on=node.dataset.view===view;node.classList.toggle('is-active',on);if(on)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');});
    const titles={overview:'Overview','risk-map':'Risk Area Map',districts:'District Explorer',locations:'Location Directory',safety:'Water Safety',about:'About & Sources'};
    $('#breadcrumb-current').textContent=titles[view]||'Overview';
    $('body').classList.toggle('map-focused',view==='risk-map');
    $('#expand-map span').textContent=view==='risk-map'?'Restore':'Expand';
    $('#expand-map').setAttribute('aria-expanded',String(view==='risk-map'));
    hideMobileNav();
    window.scrollTo({top:0,behavior:'smooth'});
    if(view==='risk-map'){setTimeout(()=>{$('#map-section').scrollIntoView({behavior:'smooth',block:'start'});state.map?.invalidateSize();},80);}
    else if(view==='overview'){setTimeout(()=>state.map?.invalidateSize(),150);}
  }
  function hideMobileNav() { $('#sidebar').classList.remove('open');$('#mobile-scrim').classList.remove('show');$('#mobile-scrim').hidden=true; }
  function setupNav() {
    $$('.nav-link').forEach(button=>button.addEventListener('click',()=>setNavigation(button.dataset.view)));
    $$('[data-go]').forEach(button=>button.addEventListener('click',()=>setNavigation(button.dataset.go)));
    $('#open-districts').addEventListener('click',()=>setNavigation('districts'));
    $('#expand-map').addEventListener('click',()=>{setNavigation(state.view==='risk-map'?'overview':'risk-map');});
    $('#open-sidebar').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#mobile-scrim').hidden=false;$('#mobile-scrim').classList.add('show');});
    $('#close-sidebar').addEventListener('click',hideMobileNav);
    $('#mobile-scrim').addEventListener('click',hideMobileNav);
    document.addEventListener('keydown',ev=>{if(ev.key==='Escape')hideMobileNav();});
    $('#reset-map').addEventListener('click',()=>selectDistrict(''));
    $('#district-select').addEventListener('change',ev=>selectDistrict(ev.target.value));
    ['filter-high','filter-low','filter-unknown','filter-croc'].forEach((id,i)=>{
      $(`#${id}`).addEventListener('change',ev=>{
        const keys=['showHigh','showLow','showUnknown','showCrocodile'];state[keys[i]]=ev.target.checked;renderMarkers();
      });
    });
    $('#directory-search').addEventListener('input',renderDirectory);
    $('#directory-district').addEventListener('change',renderDirectory);
  }
  function setupDistricts() {
    for(const [selector,initial] of [['#district-select','Select district'],['#directory-district','Select district']]){
      const select=$(selector);for(const d of districts){const opt=document.createElement('option');opt.value=d.name;opt.textContent=d.name;select.append(opt);}
    }
    $('#district-grid').innerHTML=districts.map(d=>`<button type="button" class="district-choice" data-district="${esc(d.name)}"><strong>${esc(d.name)}<svg class="ico"><use href="#i-chevron"/></svg></strong><span>View district map &amp; risk areas</span></button>`).join('');
    $$('.district-choice').forEach(button=>button.addEventListener('click',()=>{selectDistrict(button.dataset.district);setNavigation('risk-map');}));
  }
  function selectDistrict(name) {
    state.district=canonicalDistrict(name)||'';
    if(!name)state.district='';
    $('#district-select').value=state.district;
    $('#map-chip').textContent=state.district?`${state.district.toUpperCase()} · DISTRICT VIEW`:'SRI LANKA · NATIONAL VIEW';
    if(state.mapReady){
      if(state.district){
        let matched=null;
        if(state.boundaryLayer) state.boundaryLayer.eachLayer(layer=>{if(norm(layer._districtName)===norm(state.district))matched=layer;});
        if(matched)state.map.fitBounds(matched.getBounds(),{padding:[35,35],maxZoom:11,animate:true});
        else{const d=districts.find(x=>x.name===state.district);if(d)state.map.flyTo([d.lat,d.lng],10,{duration:.65});}
      }else{state.map.flyTo([7.86,80.77],7,{duration:.65});}
      updateBoundaryStyle();
    }
    renderMarkers();renderSpotlight();
  }
  function updateBoundaryStyle(){
    if(!state.boundaryLayer)return;
    state.boundaryLayer.eachLayer(layer=>{
      const selected=state.district && norm(layer._districtName)===norm(state.district);
      layer.setStyle({color:selected?'#3657B2':'#6E86BF',weight:selected?2.8:1.4,fillColor:selected?'#AFC2F0':'#A6B9DF',fillOpacity:selected?.2:.045,opacity:selected?1:.73});
      if(selected)layer.bringToFront();
    });
  }
  function mapStatus(message,error=false) {
    const el=$('#map-loading');if(!el)return;
    if(!message){el.style.display='none';return;}
    el.style.display='flex';el.classList.toggle('map-error',error);
    el.querySelector('strong').textContent=message;
    el.querySelector('span').textContent=error?'Check your internet connection or refresh the page.':'Connecting to mapping layers…';
  }
  function initMap() {
    if(!window.L){mapStatus('Map library could not be loaded',true);return;}
    const L=window.L;
    const map=L.map('risk-map',{zoomControl:false,minZoom:6,maxZoom:17,preferCanvas:true}).setView([7.86,80.77],7);
    state.map=map;state.mapReady=true;
    L.tileLayer(config.tileUrl,{maxZoom:19,attribution:config.tileAttribution,subdomains:'abc'}).addTo(map);
    L.control.zoom({position:'bottomright'}).addTo(map);
    state.markerLayer=L.layerGroup().addTo(map);
    mapStatus(null);
    loadBoundaries();
    setTimeout(()=>map.invalidateSize(),100);
  }
  async function loadBoundaries() {
    try {
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),16000);
      const response=await fetch(config.districtBoundaryUrl,{signal:controller.signal});clearTimeout(timeout);
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const geojson=await response.json();
      if(geojson.type!=='FeatureCollection'||!Array.isArray(geojson.features)||geojson.features.length<20)throw new Error('No district boundary features');
      state.boundaryLayer=window.L.geoJSON(geojson,{
        style:()=>({color:'#6E86BF',weight:1.4,fillColor:'#A6B9DF',fillOpacity:.045,opacity:.73}),
        onEachFeature:(feature,layer)=>{
          const props=feature.properties||{};
          const display=canonicalDistrict(props.district_name||props.shapeName||props.adm2_en||props.name||'');
          layer._districtName=display;
          layer.bindTooltip(esc(display),{sticky:true,direction:'top',className:'district-tooltip'});
          layer.on('click',()=>selectDistrict(display));
          layer.on('mouseover',()=>{if(!state.district)layer.setStyle({fillOpacity:.16,weight:2});});
          layer.on('mouseout',()=>updateBoundaryStyle());
        }
      }).addTo(state.map);
      updateBoundaryStyle();
    }catch(error){
      console.warn('District boundary service unavailable. District selector uses approximate town centres instead.',error);
      $('.map-footnote').append(' District polygons are temporarily unavailable; the district dropdown still navigates to approximate district towns.');
    }
  }
  function riskVisible(row){return(row.risk==='high'&&state.showHigh)||(row.risk==='low'&&state.showLow)||(row.risk==='unknown'&&state.showUnknown);}
  function renderMarkers(){
    if(!state.mapReady||!state.markerLayer)return;
    state.markerLayer.clearLayers();
    for(const row of state.rows.filter(byDistrict).filter(r=>r.latitude!==null&&riskVisible(r))){
      const croc=state.showCrocodile&&row.crocodileHazard;
      const icon=window.L.divIcon({className:'',html:`<div class="risk-marker ${row.risk}">${croc?'<span class="croc" aria-hidden="true">🐊</span>':''}</div>`,iconSize:[23,29],iconAnchor:[11,28]});
      const popup=`<h3>${esc(row.locationName)}</h3><p><strong>District:</strong> ${esc(row.district)}</p>`+
        (row.mohArea?`<p><strong>MOH area:</strong> ${esc(row.mohArea)}</p>`:'')+
        `<p><strong>Reported risk:</strong> ${esc(row.risk==='high'?'High-risk':row.risk==='low'?'Lower-risk':'Not classified')}</p>`+
        (row.waterbodyType?`<p><strong>Water body:</strong> ${esc(row.waterbodyType)}</p>`:'')+
        (row.crocodileHazard?'<p><strong>Additional hazard:</strong> Potential crocodile hazard reported</p>':'')+
        (row.notes?`<p><strong>Remarks:</strong> ${esc(row.notes)}</p>`:'')+
        (row.reportYear?`<p><strong>Reporting period:</strong> ${esc(row.reportYear)}</p>`:'');
      window.L.marker([row.latitude,row.longitude],{icon,title:row.locationName}).addTo(state.markerLayer).bindPopup(popup);
    }
  }
  function subset(){return state.district?state.rows.filter(byDistrict):state.rows;}
  function textNum(n){return state.loaded?String(n):'—';}
  function updateNational(){
    $('#kpi-high').textContent=textNum(state.rows.filter(x=>x.risk==='high').length);
    $('#kpi-districts').textContent=textNum(new Set(state.rows.map(x=>x.district).filter(Boolean)).size);
    $('#kpi-mapped').textContent=textNum(state.rows.filter(x=>x.latitude!==null).length);
    $('#kpi-hazards').textContent=textNum(state.rows.filter(x=>x.crocodileHazard).length);
    $('.topbar-status').innerHTML=state.loadError?'<span class="status-dot"></span> Data connection error':state.rows.length?'<span class="status-dot" style="background:#28a78a"></span> Location data connected':'<span class="status-dot"></span> Dataset not connected';
    $('#data-refresh-label').textContent=state.rows.length?`Location data retrieved ${new Date().toLocaleString('en-LK',{dateStyle:'medium',timeStyle:'short'})} · Map © OpenStreetMap contributors`:'Location dataset pending · Map tiles © OpenStreetMap contributors';
  }
  function renderSpotlight(){
    const items=subset();$('#spotlight-name').textContent=state.district?`${state.district} District`:'All districts';
    $('#spotlight-description').textContent=state.district?'Explore identified risk locations within this district.':'Select one of Sri Lanka’s 25 districts to explore reported drowning-risk locations.';
    $('#district-high').textContent=textNum(items.filter(x=>x.risk==='high').length);
    $('#district-low').textContent=textNum(items.filter(x=>x.risk==='low').length);
    $('#spotlight-empty').textContent=!state.rows.length?'Risk locations will be added here when verified.':!items.length?'No records for the selected district in the current dataset.':`${items.filter(x=>x.latitude!==null).length} of ${items.length} submitted locations have coordinates.`;
  }
  function renderChart(){
    const target=$('#district-bars');
    if(!state.rows.length){target.innerHTML='<div class="chart-empty"><svg class="ico"><use href="#i-chart"/></svg><span>District comparisons will appear when data are added.</span></div>';return;}
    const values=districts.map(d=>({name:d.name,count:state.rows.filter(x=>x.risk==='high'&&norm(x.district)===norm(d.name)).length})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,7);
    if(!values.length){target.innerHTML='<div class="chart-empty">No high-risk counts in the current dataset.</div>';return;}
    const max=values[0].count;
    target.innerHTML=values.map(x=>`<div class="bar-row"><span class="bar-label" title="${esc(x.name)}">${esc(x.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(x.count/max*100).toFixed(2)}%"></div></div><strong class="bar-value">${x.count}</strong></div>`).join('');
  }
  function renderDirectory(){
    const term=s($('#directory-search').value).toLowerCase();const district=$('#directory-district').value;
    const records=state.rows.filter(row=>(!district||norm(row.district)===norm(district))&&[row.locationName,row.district,row.mohArea,row.dsDivision,row.gnDivision].some(v=>v.toLowerCase().includes(term)));
    const tbody=$('#directory-rows');
    tbody.innerHTML=records.map(row=>`<tr><td><strong>${esc(row.locationName)}</strong>${row.waterbodyType?`<br><small>${esc(row.waterbodyType)}</small>`:''}</td><td>${esc(row.district)}${row.mohArea?`<br><small>${esc(row.mohArea)} MOH</small>`:''}</td><td><span class="tag ${row.risk}">${row.risk==='high'?'High risk':row.risk==='low'?'Lower risk':'Unclassified'}</span></td><td>${row.latitude!==null?'Mapped':'Not yet mapped'}</td></tr>`).join('');
    $('#directory-empty').hidden=records.length>0;
    if(!records.length){$('#directory-empty h3').textContent=state.rows.length?'No matching locations':'No risk locations loaded yet';$('#directory-empty p').textContent=state.rows.length?'Try a different district or search term.':'Once a confirmed location list is connected, records will appear here automatically.';}
  }
  async function fetchLocations(){
    const useGoogle=config.dataMode==='googleSheetsCsv';
    if(useGoogle&&!s(config.googleSheetCsvUrl))throw Error('Google Sheets CSV URL is missing in config.js');
    const url=useGoogle?config.googleSheetCsvUrl:'./data/risk-locations.json';
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(`Data request failed (${response.status})`);
    const raw=useGoogle?parseCSV(await response.text()):await response.json();
    if(!Array.isArray(raw))throw new Error('Location data must be an array or published CSV');
    return raw.map(normalizeRow).filter(x=>x.locationName&&x.district);
  }
  async function loadLocations(){
    try{
      const locations=await fetchLocations();state.rows=locations;state.loaded=locations.length>0;state.loadError=false;
    }catch(error){console.error('Could not load location dataset:',error);state.loadError=true;state.loaded=false;state.rows=[];}
    updateNational();renderSpotlight();renderChart();renderDirectory();renderMarkers();
  }
  function init(){setupNav();setupDistricts();initMap();loadLocations();
    if(config.dataMode==='googleSheetsCsv'&&config.refreshIntervalMs>=60000)setInterval(loadLocations,config.refreshIntervalMs);
    window.addEventListener('resize',()=>state.map?.invalidateSize());
  }
  document.addEventListener('DOMContentLoaded',init);
})();
