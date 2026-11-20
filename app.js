/* National Drowning Risk Mapping Dashboard — map-first interface (V7)
 * Data stays in the approved Google Sheets CSV or local JSON file.
 * Public reporting is OPTIONAL and must be connected to a private Google Form.
 */
(() => {
  'use strict';

  const config = window.DASHBOARD_CONFIG || {};
  const districts = window.SRI_LANKA_DISTRICTS || [];
  const districtNames = districts.map(d => d.name);
  const state = {
    district: '', search: '', rows: [], dataLoaded: false, error: false, lastSuccess: null,
    map: null, mapReady: false, basemapLayer: null, activeBasemap: 'satellite', boundaryLayer: null, markerLayer: null, selected: null,
    high: true, low: false, unknown: false, crocodile: true, shown: 50,
    pane: 'browse', panelOpen: false, picking: false, reportLocationId: '', reportPoint: null,
    reportPin: null, userPin: null, toastTimer: null
  };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const str = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, chr => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[chr]));
  const normalise = value => str(value).toLowerCase().replace(/district/gi, '').replace(/[\s_-]+/g, ' ').replace(/[^a-z ]/g, '').trim();
  function canonicalDistrict(value) {
    const key = normalise(value).replace(/moneragala/, 'monaragala').replace(/nuwaraeliya/, 'nuwara eliya');
    return districtNames.find(name => normalise(name) === key) || str(value);
  }
  function parseBoolean(value) { return ['yes','true','1','reported','present','y'].includes(str(value).toLowerCase()); }
  function classify(value) {
    const v = str(value).toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ');
    if (['high','high risk','high risk area','high risk location'].includes(v)) return 'high';
    if (['low','low risk','lower risk','low risk area','lower risk area'].includes(v)) return 'low';
    return 'unknown';
  }
  function col(row, ...aliases) {
    const columns = Object.keys(row);
    for (const alias of aliases) {
      const key = columns.find(c => c.toLowerCase().replace(/[^a-z0-9]/g,'') === alias.toLowerCase().replace(/[^a-z0-9]/g,''));
      if (key !== undefined && str(row[key]) !== '') return row[key];
    }
    return '';
  }
  function normaliseRow(row, index) {
    const latText = str(col(row, 'latitude','lat'));
    const lngText = str(col(row, 'longitude','lng','lon'));
    const lat = latText === '' ? null : Number(latText);
    const lng = lngText === '' ? null : Number(lngText);
    const valid = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 5.7 && lat <= 10.1 && lng >= 79.3 && lng <= 82.2;
    return {
      id: str(col(row,'id','locationId')) || `site-${index + 1}`,
      name: str(col(row,'locationName','location','placeName','riskLocation','site')),
      district: canonicalDistrict(col(row,'district')),
      moh: str(col(row,'mohArea','moh')),
      ds: str(col(row,'dsDivision','ds')),
      gn: str(col(row,'gnDivision','gn')),
      risk: classify(col(row,'riskLevel','risk','riskCategory','riskClassification')),
      waterbody: str(col(row,'waterbodyType','waterbody','waterBodyType')),
      lat: valid ? lat : null, lng: valid ? lng : null,
      croc: parseBoolean(col(row,'crocodileHazard','crocodile','crocodileRisk')),
      notes: str(col(row,'notes','remarks')),
      source: str(col(row,'source')),
      year: str(col(row,'reportYear','year'))
    };
  }
  function parseCSV(csv) {
    const rows = []; let row = []; let field = ''; let quoted = false;
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i];
      if (c === '"') {
        if (quoted && csv[i+1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (c === ',' && !quoted) { row.push(field); field = ''; }
      else if ((c === '\r' || c === '\n') && !quoted) {
        if (c === '\r' && csv[i+1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(v => str(v) !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) {
      row.push(field); if (row.some(v => str(v) !== '')) rows.push(row);
    }
    if (!rows.length) return [];
    const headings = rows.shift().map((v,i) => i === 0 ? v.replace(/^\uFEFF/,'').trim() : v.trim());
    return rows.map(fields => Object.fromEntries(headings.map((h,i) => [h, fields[i] ?? ''])));
  }

  const withinDistrict = row => !state.district || normalise(row.district) === normalise(state.district);
  const riskShown = row => row.risk === 'high' && state.high || row.risk === 'low' && state.low || row.risk === 'unknown' && state.unknown;
  const searchMatches = row => !state.search || [row.name,row.district,row.moh,row.ds,row.gn,row.waterbody].some(v => v.toLocaleLowerCase().includes(state.search));
  function filteredRows() { return state.rows.filter(withinDistrict).filter(riskShown).filter(searchMatches); }
  function statCount(value) { return state.dataLoaded ? value.toLocaleString('en-US') : '—'; }
  function riskLabel(risk) { return risk === 'high' ? 'Reported high-risk' : risk === 'low' ? 'Reported lower-risk' : 'Unclassified'; }
  function showToast(message) {
    const target = $('#toast'); target.textContent = message; target.hidden = false;
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => { target.hidden = true; }, 3700);
  }
  function iconSymbol(name) { return `<svg class="icon" aria-hidden="true"><use href="#ic-${name}"/></svg>`; }

  function setPanel(open, pane = state.pane) {
    state.pane = pane; state.panelOpen = open;
    $('#info-panel').classList.toggle('is-open', open);
    $('#info-panel').setAttribute('aria-hidden', String(!open));
    $('#toggle-panel').setAttribute('aria-expanded', String(open));
    $('#toggle-panel').setAttribute('aria-label', open ? 'Close locations panel' : 'Open locations panel');
    $('#drawer-scrim').hidden = !open;
    $('#pane-browse').hidden = pane !== 'browse';
    $('#pane-detail').hidden = pane !== 'detail';
    $('#pane-about').hidden = pane !== 'about';
    $('#panel-title').textContent = pane === 'detail' ? 'Location details' : pane === 'about' ? 'About the dashboard' : 'Explore risk areas';
    if (open) $('#panel-scroll')?.scrollTo({top:0});
  }
  function closePopovers() {
    $('#layer-popover').hidden = true;
    $('#stats-popover').hidden = true;
    $('#layers-toggle').setAttribute('aria-expanded','false');
    $('#stats-toggle').setAttribute('aria-expanded','false');
  }
  function togglePopover(id, btnId) {
    const target = $(id); const open = target.hidden;
    closePopovers(); if (open) { target.hidden = false; $(btnId).setAttribute('aria-expanded','true'); }
  }
  function chooseDistrict(name) {
    state.district = str(name) ? canonicalDistrict(name) : '';
    $('#district-select').value = state.district;
    $('#view-label').textContent = state.district ? `${state.district.toUpperCase()} · DISTRICT MAP` : 'SRI LANKA · NATIONAL MAP';
    if (state.mapReady) {
      const boundary = findDistrictBoundary(state.district);
      if (boundary) state.map.fitBounds(boundary.getBounds(), {padding:[30,30],maxZoom:12,animate:true});
      else if (state.district) {
        const district = districts.find(d => d.name === state.district);
        if (district) state.map.flyTo([district.lat, district.lng], 10, {duration:.6});
      } else state.map.flyTo([7.86,80.77],7,{duration:.6});
      updateBoundaryStyle();
    }
    state.shown = 50;
    updateDistrictSummary(); renderLocations(); renderMarkers();
  }
  function findDistrictBoundary(name) {
    if (!name || !state.boundaryLayer) return null;
    let found = null;
    state.boundaryLayer.eachLayer(layer => { if (normalise(layer._districtName) === normalise(name)) found = layer; });
    return found;
  }
  function updateBoundaryStyle() {
    if (!state.boundaryLayer) return;
    state.boundaryLayer.eachLayer(layer => {
      const active = state.district && normalise(layer._districtName) === normalise(state.district);
      layer.setStyle({color:active?'#243B83':'#5378BB',weight:active?2.7:1.3,opacity:active?1:.75,fillColor:active?'#718ED8':'#809DC6',fillOpacity:active?.15:.035});
      if (active) layer.bringToFront();
    });
  }

  function mapMessage(message, error = false) {
    const el = $('#map-veil');
    if (!message) { el.hidden = true; return; }
    el.hidden = false;
    el.querySelector('strong').textContent = message;
    el.querySelector('small').textContent = error ? 'Try refreshing or checking your internet connection.' : 'Connecting to mapping services…';
    el.querySelector('.spinner').hidden = error;
  }
  const mapBackgrounds = {
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: {
        maxZoom: 19,
        attribution: 'Imagery &copy; Esri, Vantor, Earthstar Geographics and the GIS User Community'
      }
    },
    terrain: {
      url: 'https://tile.openmaps.fr/opentopomap/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19, maxNativeZoom: 17,
        attribution: '<a href="https://github.com/sletuffe/OpenTopoMap">&copy; OpenTopoMap-R</a> <a href="https://openmaps.fr/donate">♥ Donation</a> <a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap</a>'
      }
    },
    road: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution: config.tileAttribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    }
  };

  function setMapBackground(mode) {
    const definition = mapBackgrounds[mode];
    if (!definition || !state.mapReady) return;
    const layer = window.L.tileLayer(definition.url, definition.options);
    if (state.basemapLayer) state.map.removeLayer(state.basemapLayer);
    state.basemapLayer = layer;
    state.activeBasemap = mode;
    layer.addTo(state.map);
    layer.bringToBack();
    document.querySelectorAll('input[name="basemap"]').forEach(input => {
      input.checked = input.value === mode;
    });
  }

  function initMap() {
    if (!window.L) { mapMessage('Map library could not be loaded', true); return; }
    const L = window.L;
    const map = L.map('risk-map', {zoomControl:false,minZoom:6,maxZoom:18,preferCanvas:true}).setView([7.86,80.77],7);
    state.map = map; state.mapReady = true;
    setMapBackground('satellite');
    L.control.zoom({position:'bottomright'}).addTo(map);
    state.markerLayer = typeof L.markerClusterGroup === 'function' ? L.markerClusterGroup({showCoverageOnHover:false,chunkedLoading:true,maxClusterRadius:44,disableClusteringAtZoom:14,iconCreateFunction(cluster) {
      return L.divIcon({html:`<div>${cluster.getChildCount()}</div>`,className:'risk-cluster',iconSize:[41,41]});
    }}) : L.layerGroup();
    state.markerLayer.addTo(map);
    map.on('click', event => {
      if (state.picking) { setReportPoint(event.latlng.lat,event.latlng.lng); finishPicking(); }
    });
    mapMessage(null);
    loadBoundaries();
    setTimeout(() => map.invalidateSize(),130);
  }
  async function loadBoundaries() {
    if (!config.districtBoundaryUrl || !state.mapReady) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),16000);
    try {
      const response = await fetch(config.districtBoundaryUrl,{signal:controller.signal});
      if (!response.ok) throw Error(`Boundary service ${response.status}`);
      const json = await response.json();
      state.boundaryLayer = window.L.geoJSON(json, {
        style:() => ({color:'#5378BB',weight:1.3,opacity:.75,fillColor:'#809DC6',fillOpacity:.035}),
        onEachFeature:(feature,layer) => {
          const p = feature.properties || {};
          const name = canonicalDistrict(p.district_name || p.shapeName || p.adm2_en || p.name || '');
          layer._districtName = name;
          if (name) layer.bindTooltip(esc(name),{sticky:true,className:'district-tooltip'});
          layer.on('click',() => { if (!state.picking && districtNames.includes(name)) chooseDistrict(name); });
          layer.on('mouseover',() => { if (!state.district) layer.setStyle({weight:2,fillOpacity:.1}); });
          layer.on('mouseout',updateBoundaryStyle);
        }
      }).addTo(state.map);
      updateBoundaryStyle();
    } catch(error) {
      console.warn('District boundaries are not available. District-centre navigation remains available.',error);
    } finally { clearTimeout(timeout); }
  }

  function renderMarkers() {
    if (!state.mapReady || !state.markerLayer) return;
    state.markerLayer.clearLayers();
    const rows = filteredRows().filter(row => row.lat !== null);
    for (const row of rows) {
      const showCroc = state.crocodile && row.croc;
      const markerIcon = window.L.divIcon({className:'',html:`<div class="risk-marker ${row.risk}">${showCroc?'<span class="croc" aria-label="Crocodile hazard reported">🐊</span>':''}</div>`,iconSize:[24,29],iconAnchor:[11,27]});
      const marker = window.L.marker([row.lat,row.lng],{icon:markerIcon,title:row.name});
      marker.bindTooltip(esc(row.name),{direction:'top',offset:[0,-22]});
      marker.on('click',() => { if (state.picking) {setReportPoint(row.lat,row.lng);finishPicking();} else showDetails(row); });
      state.markerLayer.addLayer(marker);
    }
  }

  function updateDistrictSummary() {
    const rows = state.rows.filter(withinDistrict);
    const districtNote = state.district ? `Showing reported sites in ${state.district} District.` : 'Browse district-reported drowning-prone locations across Sri Lanka.';
    $('#district-summary-note').textContent = districtNote;
    $('#district-high').textContent = statCount(rows.filter(r => r.risk === 'high').length);
    $('#district-low').textContent = statCount(rows.filter(r => r.risk === 'low').length);
    $('#district-mapped').textContent = statCount(rows.filter(r => r.lat !== null).length);
  }
  function updateNational() {
    $('#kpi-high').textContent = statCount(state.rows.filter(r => r.risk === 'high').length);
    $('#kpi-districts').textContent = statCount(new Set(state.rows.map(r => r.district).filter(Boolean)).size);
    $('#kpi-mapped').textContent = statCount(state.rows.filter(r => r.lat !== null).length);
    $('#kpi-hazards').textContent = statCount(state.rows.filter(r => r.croc).length);
    const status = $('#connection-status');
    status.classList.toggle('connected',!state.error && state.dataLoaded);
    status.classList.toggle('error',state.error);
    $('#connection-text').textContent = state.error ? (state.dataLoaded ? 'Using last loaded data' : 'Data unavailable') : state.dataLoaded ? 'Location data connected' : 'No dataset connected';
    const stamp = state.lastSuccess ? new Date(state.lastSuccess).toLocaleString('en-LK',{dateStyle:'medium',timeStyle:'short'}) : null;
    $('#data-refreshed').textContent = stamp ? `Data retrieved: ${stamp}` : 'Location data pending';
    $('#about-data-meta').textContent = stamp ? `Last successful data retrieval: ${stamp}. Source: public district-level risk-area dataset.` : 'No location dataset loaded.';
  }
  function renderLocations() {
    const rows = filteredRows();
    const target = $('#location-results');
    $('#search-count').textContent = state.dataLoaded ? `${rows.length.toLocaleString('en-US')} results` : 'No records';
    if (!rows.length) {
      target.innerHTML = `<div class="small-note">${state.dataLoaded ? 'No locations match these search and layer settings.' : 'Location records will appear when the public data feed becomes available.'}</div>`;
      $('#show-more').hidden = true;
      return;
    }
    const sorted = rows.slice().sort((a,b) => (a.risk==='high'?0:a.risk==='low'?1:2)-(b.risk==='high'?0:b.risk==='low'?1:2));
    target.innerHTML = sorted.slice(0,state.shown).map(row => `
      <button class="location-item ${row.lat === null?'':'has-coords'}" type="button" data-site-id="${esc(row.id)}">
        <span class="pin-bubble ${row.risk}">${iconSymbol('pin')}</span>
        <span class="location-item-body"><span class="location-item-name">${esc(row.name)}</span>
        <span class="location-item-meta">${esc(row.district)} · ${row.risk === 'high' ? 'High-risk' : row.risk === 'low' ? 'Lower-risk' : 'Unclassified'}${row.lat===null?' · Unmapped':''}</span></span>
        ${iconSymbol('chevron')}
      </button>`).join('');
    target.querySelectorAll('[data-site-id]').forEach(btn => btn.addEventListener('click',() => {
      const row = state.rows.find(r => r.id === btn.dataset.siteId);
      if (row) showDetails(row);
    }));
    $('#show-more').hidden = sorted.length <= state.shown;
  }
  function detailRow(title,value) { return value ? `<div class="detail-row"><dt>${esc(title)}</dt><dd>${esc(value)}</dd></div>` : ''; }
  function showDetails(row) {
    state.selected = row;
    const risk = riskLabel(row.risk);
    $('#location-detail').innerHTML = `
      <span class="risk-chip ${row.risk}"><span class="swatch ${row.risk}"></span> ${esc(risk)}</span>
      <h3 class="detail-title">${esc(row.name)}</h3>
      <div class="detail-location-info"><dl style="margin:0">
        ${detailRow('District',row.district)}${detailRow('MOH area',row.moh)}
        ${detailRow('DS division',row.ds)}${detailRow('GN division',row.gn)}
        ${detailRow('Water body',row.waterbody)}${detailRow('Reported period',row.year)}
        ${detailRow('Source',row.source)}${row.lat!==null?detailRow('Coordinates',`${row.lat.toFixed(6)}, ${row.lng.toFixed(6)}`):''}
      </dl></div>
      ${row.croc?'<div class="detail-warning">🐊 Potential crocodile hazard reported for this location.</div>':''}
      ${row.notes?`<div class="detail-notes"><small>REPORT REMARKS</small><p>${esc(row.notes)}</p></div>`:''}
      <div class="detail-warning">Risk classifications reflect submitted district reports; map coordinates may be approximate. A lower-risk label does not guarantee safety.</div>
      <div class="detail-actions">
        ${row.lat!==null?`<button type="button" class="detail-map-link" id="focus-site">View on map</button>`:'<span class="detail-map-link" style="opacity:.55">No mapped point</span>'}
        <button type="button" class="detail-correct" id="correct-site">Suggest a correction</button>
      </div>`;
    setPanel(true,'detail');
    const focus = $('#focus-site'); if (focus) focus.addEventListener('click',() => {
      if (state.mapReady && row.lat !== null) state.map.flyTo([row.lat,row.lng],Math.max(state.map.getZoom(),13),{duration:.5});
      if (window.innerWidth < 721) setPanel(false);
    });
    $('#correct-site').addEventListener('click',() => startReport(row));
    if (state.mapReady && row.lat !== null && window.innerWidth >= 721) {
      state.map.flyTo([row.lat,row.lng],Math.max(state.map.getZoom(),11),{duration:.5});
    }
  }

  async function fetchLocations() {
    const useCsv = config.dataMode === 'googleSheetsCsv';
    if (useCsv && !str(config.googleSheetCsvUrl)) throw Error('Google Sheets CSV URL is not configured');
    const url = useCsv ? config.googleSheetCsvUrl : './data/risk-locations.json';
    const response = await fetch(url,{cache:'no-store'});
    if (!response.ok) throw Error(`Data request failed (${response.status})`);
    const data = useCsv ? parseCSV(await response.text()) : await response.json();
    if (!Array.isArray(data)) throw Error('Unexpected dataset format');
    return data.map(normaliseRow).filter(row => row.name && row.district);
  }
  async function loadLocations() {
    try {
      const rows = await fetchLocations();
      state.rows = rows; state.dataLoaded = true; state.error = false; state.lastSuccess = Date.now();
    } catch(error) {
      console.error('Could not retrieve the drowning risk dataset:',error);
      state.error = true;
      if (!state.dataLoaded) { state.rows = []; state.lastSuccess = null; }
      showToast(state.dataLoaded ? 'Data refresh failed — showing previously loaded records.' : 'Could not connect to the location dataset.');
    }
    updateNational();updateDistrictSummary();renderLocations();renderMarkers();
    if (state.selected) {
      const sameRow = state.rows.find(r => r.id === state.selected.id);
      if (sameRow && state.pane==='detail') showDetails(sameRow);
    }
  }

  function resetSearch() {
    state.search = ''; $('#map-search').value = ''; $('#clear-search').hidden = true;state.shown = 50;
    renderLocations(); renderMarkers();
  }
  function showDistrictSearch(term) {
    const matches = !term ? [] : districts.filter(d => d.name.toLowerCase().includes(term)).slice(0,8);
    if (!matches.length) return;
    const target = $('#location-results');
    const first = document.createElement('div');
    first.innerHTML = `<div class="list-title"><strong>Matching districts</strong></div>${matches.map(d => `<button type="button" class="location-item district-search-result" data-district="${esc(d.name)}"><span class="pin-bubble unknown">${iconSymbol('layers')}</span><span class="location-item-body"><span class="location-item-name">${esc(d.name)}</span><span class="location-item-meta">Zoom to district</span></span>${iconSymbol('chevron')}</button>`).join('')}`;
    target.prepend(first);
    first.querySelectorAll('button[data-district]').forEach(btn => btn.addEventListener('click',() => {
      chooseDistrict(btn.dataset.district);resetSearch();setPanel(true,'browse');
    }));
  }
  function toggleRisk(name,checked) {
    state[name] = checked; state.shown = 50;
    renderLocations();renderMarkers();
  }
  function locateUser(forReport = false) {
    if (!navigator.geolocation) {showToast('Your browser does not support location access.');return;}
    navigator.geolocation.getCurrentPosition(pos => {
      const {latitude,longitude} = pos.coords;
      if (forReport) {setReportPoint(latitude,longitude);showToast('GPS position added; check and adjust the pin on the map.');}
      else if (state.mapReady) {
        state.map.flyTo([latitude,longitude],13,{duration:.6});
        if (state.userPin) state.map.removeLayer(state.userPin);
        state.userPin=window.L.circleMarker([latitude,longitude],{radius:8,color:'#fff',weight:3,fillColor:'#527DD3',fillOpacity:1}).addTo(state.map);
        showToast('Your approximate device location is shown as a blue dot.');
      }
    },err => showToast(err.code === 1 ? 'Location permission was denied.' : 'Could not determine your location.'),
    {enableHighAccuracy:false,timeout:12000,maximumAge:60000});
  }

  function reportingConfig() { return config.publicReporting || {}; }
  function canOpenForm() {
    const r = reportingConfig(); const entries = r.entryIds || {};
    return Boolean(r.formUrl && ['locationName','district','coordinates','description','reportType'].every(k => /^entry\.\d+$/.test(str(entries[k]))));
  }
  function updateReportAvailability() {
    const enabled = canOpenForm();
    $('#submit-report').disabled = !enabled;
    $('#submit-report').title = enabled ? 'Open private Google Form with these details prefilled' : 'Public reporting destination not connected yet';
    $('#report-form-note').textContent = enabled ? 'Continue to the Ministry reporting form to review and submit your suggestion. It will not appear on the map until approved.' : 'Public reporting intake is not connected yet. You can prepare and copy the report details; no submission is sent until an official review form is linked.';
  }
  function startReport(row = null) {
    closePopovers();
    state.reportLocationId = row ? row.id : '';
    $('#report-name').value = row?.name || '';
    $('#report-district').value = row?.district || state.district || '';
    $('#report-waterbody').value = row?.waterbody && [...$('#report-waterbody').options].some(o=>o.value===row.waterbody) ? row.waterbody : '';
    $('#report-type').value = row ? 'Correction' : 'New location';
    $('#report-description').value = '';
    state.reportPoint = null;
    if (state.reportPin && state.mapReady) {state.map.removeLayer(state.reportPin);state.reportPin=null;}
    if (row && row.lat !== null) setReportPoint(row.lat,row.lng);
    $('#report-title').textContent = row ? 'Suggest a location correction' : 'Report a risk location';
    $('#report-intro').textContent = row ? 'Suggest a correction to this reported site. Your request will require review.' : 'Suggest a location that may need review. Reports do not appear on the official map automatically.';
    updateReportAvailability();
    $('#report-overlay').hidden = false;
    setPanel(false);
    $('#report-name').focus();
  }
  function closeReport() {
    if (state.picking) cancelPicking();
    $('#report-overlay').hidden = true;
    // A draft marker is never left on the public map after the draft is closed.
    if (state.reportPin && state.mapReady) state.map.removeLayer(state.reportPin);
    state.reportPin = null; state.reportPoint = null;
  }
  function setReportPoint(lat,lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    state.reportPoint = {lat,lng};
    $('#report-coordinates').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} · Tap Place pin to adjust`;
    if (state.mapReady) {
      if (state.reportPin) state.map.removeLayer(state.reportPin);
      state.reportPin = window.L.marker([lat,lng],{draggable:true,title:'Suggested reporting location'}).addTo(state.map);
      state.reportPin.on('dragend',ev=>setReportPoint(ev.target.getLatLng().lat,ev.target.getLatLng().lng));
    }
  }
  function chooseMapPoint() {
    if (!state.mapReady) {showToast('The map has not loaded. Try again once it is available.');return;}
    state.picking = true; $('#report-overlay').hidden = true; $('#map-pick-notice').hidden = false;
    state.map.getContainer().style.cursor = 'crosshair';
    setPanel(false);
  }
  function finishPicking() {
    state.picking = false; $('#map-pick-notice').hidden = true; $('#report-overlay').hidden = false;
    if (state.mapReady) state.map.getContainer().style.cursor = '';
  }
  function cancelPicking() {
    state.picking = false; $('#map-pick-notice').hidden = true; $('#report-overlay').hidden = false;
    if (state.mapReady) state.map.getContainer().style.cursor = '';
  }
  function getReport() {
    const name=str($('#report-name').value),district=$('#report-district').value,notes=str($('#report-description').value),type=$('#report-type').value;
    return {name,district,notes,type,waterbody:$('#report-waterbody').value,coords:state.reportPoint?`${state.reportPoint.lat.toFixed(6)}, ${state.reportPoint.lng.toFixed(6)}`:'',locationId:state.reportLocationId};
  }
  function validateReport(report) {
    if (!report.name || !report.district || !report.notes) {showToast('Enter a location name, district and description first.');return false;}
    if (!report.coords) {showToast('Place a pin on the map or use GPS before continuing.');return false;}
    if (!state.reportPoint || state.reportPoint.lat < 5.7 || state.reportPoint.lat > 10.1 || state.reportPoint.lng < 79.3 || state.reportPoint.lng > 82.2) {
      showToast('Choose a location within Sri Lanka before continuing.');return false;
    }
    return true;
  }
  function reportText(r) {
    return `Drowning-risk map submission draft\nReport type: ${r.type}\nLocation: ${r.name}\nDistrict: ${r.district}\nWater body: ${r.waterbody || 'Not specified'}\nCoordinates: ${r.coords || 'Not selected'}\nExisting record ID: ${r.locationId || 'Not applicable'}\nDescription: ${r.notes}`;
  }
  async function copyReport() {
    const r=getReport();
    try {await navigator.clipboard.writeText(reportText(r));showToast('Report details copied. No report has been submitted.');}
    catch(error) {console.warn(error);showToast('Copy unavailable. Select and copy the report fields manually.');}
  }
  function sendToForm() {
    const r=getReport(); if (!validateReport(r) || !canOpenForm()) return;
    const cfg=reportingConfig(); const ids=cfg.entryIds; const url=new URL(cfg.formUrl);
    const values={locationName:r.name,district:r.district,coordinates:r.coords,description:r.notes,reportType:r.type,waterbody:r.waterbody,locationId:r.locationId};
    for (const [key,value] of Object.entries(values)) if (ids[key] && value) url.searchParams.set(ids[key],value);
    url.searchParams.set('usp','pp_url');
    window.open(url.toString(),'_blank','noopener,noreferrer');
    showToast('The private reporting form has opened. Remember to press Submit there.');
  }

  function setupEvents() {
    $('#toggle-panel').addEventListener('click',()=>setPanel(!state.panelOpen,'browse'));
    $('#close-panel').addEventListener('click',()=>setPanel(false));
    $('#drawer-scrim').addEventListener('click',()=>setPanel(false));
    $('#back-to-browse').addEventListener('click',()=>setPanel(true,'browse'));
    $('#back-from-about').addEventListener('click',()=>setPanel(true,'browse'));
    $('#header-about').addEventListener('click',()=>{closePopovers();setPanel(true,'about');});
    $('#layers-toggle').addEventListener('click',()=>togglePopover('#layer-popover','#layers-toggle'));
    document.querySelectorAll('input[name="basemap"]').forEach(input => input.addEventListener('change', () => {
      if (input.checked) setMapBackground(input.value);
    }));
    $('#stats-toggle').addEventListener('click',()=>togglePopover('#stats-popover','#stats-toggle'));
    $$('[data-hide-popover]').forEach(el=>el.addEventListener('click',closePopovers));
    $('#reset-view').addEventListener('click',()=>{chooseDistrict('');resetSearch();setPanel(false);});
    $('#locate-me').addEventListener('click',()=>locateUser(false));
    $('#district-select').addEventListener('change',ev=>chooseDistrict(ev.target.value));
    $('#filter-high').addEventListener('change',ev=>toggleRisk('high',ev.target.checked));
    $('#filter-low').addEventListener('change',ev=>toggleRisk('low',ev.target.checked));
    $('#filter-unknown').addEventListener('change',ev=>toggleRisk('unknown',ev.target.checked));
    $('#filter-croc').addEventListener('change',ev=>toggleRisk('crocodile',ev.target.checked));
    $('#map-search').addEventListener('input',ev=>{
      state.search = ev.target.value.trim().toLocaleLowerCase();state.shown=50;
      $('#clear-search').hidden = !state.search;
      renderLocations();renderMarkers();
      showDistrictSearch(state.search);
      if (state.search) setPanel(true,'browse');
    });
    $('#map-search').addEventListener('keydown',ev=>{if(ev.key==='Enter' && state.search){setPanel(true,'browse');ev.preventDefault();}});
    $('#clear-search').addEventListener('click',()=>{resetSearch();$('#map-search').focus();});
    $('#show-more').addEventListener('click',()=>{state.shown+=50;renderLocations();showDistrictSearch(state.search);});
    $$('[data-start-report]').forEach(btn=>btn.addEventListener('click',()=>startReport()));
    $('#close-report').addEventListener('click',closeReport);
    $('#report-overlay').addEventListener('click',ev=>{if(ev.target.id==='report-overlay')closeReport();});
    $('#choose-map-point').addEventListener('click',chooseMapPoint);
    $('#cancel-picking').addEventListener('click',cancelPicking);
    $('#report-use-location').addEventListener('click',()=>locateUser(true));
    $('#copy-report').addEventListener('click',copyReport);
    $('#submit-report').addEventListener('click',sendToForm);
    document.addEventListener('keydown',ev=>{
      if (ev.key==='Escape') { if (state.picking) cancelPicking(); else if (!$('#report-overlay').hidden) closeReport(); else {closePopovers();setPanel(false);} }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase()==='k') { ev.preventDefault();$('#map-search').focus(); }
    });
    window.addEventListener('resize',()=>state.map?.invalidateSize());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden && state.mapReady)state.map.invalidateSize();});
  }
  function setupDistricts() {
    for (const d of districts) {
      for (const selector of ['#district-select','#report-district']) {
        const opt=document.createElement('option');opt.value=d.name;opt.textContent=d.name;$(selector).append(opt);
      }
    }
  }
  function init() {
    setupDistricts();setupEvents();initMap();updateReportAvailability();loadLocations();
    if (config.dataMode === 'googleSheetsCsv' && Number(config.refreshIntervalMs) >= 60000)
      setInterval(loadLocations, Number(config.refreshIntervalMs));
  }
  document.addEventListener('DOMContentLoaded',init);
})();
