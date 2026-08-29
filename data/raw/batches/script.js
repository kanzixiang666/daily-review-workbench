
(function(){
  'use strict';

  /* ========== 常量与状态 ========== */
  var DATABASE_ID = 'cLcxNlQynomKfZa92Ptryc';   // 每日行情总表
  var DB2_ID = 'rOEUCAdnBUZXNJpMNg1WNd';        // 每日持仓表现
  var DB3_ID = 'Ca9lZzGvP8gCYCWoXoljoT';        // 持仓清单  var CACHE_KEY = 'wb_market_cache';
  var DRAFT_REVIEW = 'wb_market_draft_review';
  var DRAFT_POS = 'wb_market_draft_pos';

  var state = {
    date: '',
    db1: [], db2: [], db3: [], db4: [],
    db1map: {}, db2map: {}, db1dates: [], posByCode: {},
    online: true,
    editingPosId: null,
    intradayIdx: 'sh',
    schemaOptions: {}   // { '类型': [{text,id}] }
  };

  var GLOBAL_FIELDS = [
    ['道琼斯', '道琼斯涨跌幅'],
    ['纳斯达克', '纳斯达克涨跌幅'],
    ['标普500', '标普500涨跌幅'],
    ['恒生指数', '恒生指数涨跌幅'],
    ['恒生科技', '恒生科技涨跌幅'],
    ['日经225', '日经225涨跌幅'],
    ['韩国KOSPI', '韩国综合指数涨跌幅'],
    ['富时A50期货', '富时A50期货涨跌幅'],
    ['美元指数', '美元指数涨跌幅']
  ];
  var MOODS = ['冰点','偏冷','中性','偏热','过热'];

  /* ========== 工具函数 ========== */
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function num(v, d){ if(v===null||v===undefined||v===''||isNaN(Number(v))) return null; return Number(v).toFixed(d==null?2:d); }
  function fmtPct(v){
    if(v===null||v===undefined||v===''||isNaN(Number(v))) return '--';
    var n = Number(v);
    return (n>0?'+':'') + n.toFixed(2) + '%';
  }
  function pctCls(v){
    if(v===null||v===undefined||v===''||isNaN(Number(v))) return 'flat';
    var n = Number(v);
    return n>0 ? 'up' : (n<0 ? 'down' : 'flat');
  }
  function dateKey(iso){ return iso ? String(iso).slice(0,10) : ''; }
  function todayStr(){
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
  }
  function pad2(n){ return (n<10?'0':'') + n; }
  function shiftDate(dateStr, delta){
    var d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
  }
  function debounce(fn, ms){
    var t = null;
    return function(){
      var args = arguments, self = this;
      if(t) clearTimeout(t);
      t = setTimeout(function(){ fn.apply(self, args); }, ms);
    };
  }
  function storageGet(key){
    try{ var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }catch(e){ return null; }
  }
  function storageSet(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
  }
  function storageDel(key){
    try{ localStorage.removeItem(key); }catch(e){}
  }
  function sdk(){ return (window.__SMART_PAGE__ && window.__SMART_PAGE__.database) || null; }

  /* ========== 数据加载（databaseId 一律使用字面量，供平台静态校验） ========== */
  function qDaily(cursor, acc){
    var params = { databaseId: 'cLcxNlQynomKfZa92Ptryc', pageSize: 100,
      sorts: [{ property: '交易日期', direction: 'ascending' }] };
    if(cursor) params.startCursor = cursor;
    return sdk().query(params).then(function(res){
      var rows = (res && res.results) ? res.results : [];
      acc = (acc||[]).concat(rows);
      if(res && res.hasMore && res.nextCursor) return qDaily(res.nextCursor, acc);
      return acc;
    });
  }
  function qHold(cursor, acc){
    var params = { databaseId: 'rOEUCAdnBUZXNJpMNg1WNd', pageSize: 100,
      sorts: [{ property: '交易日期', direction: 'ascending' }] };
    if(cursor) params.startCursor = cursor;
    return sdk().query(params).then(function(res){
      var rows = (res && res.results) ? res.results : [];
      acc = (acc||[]).concat(rows);
      if(res && res.hasMore && res.nextCursor) return qHold(res.nextCursor, acc);
      return acc;
    });
  }
  function qPos(cursor, acc){
    var params = { databaseId: 'Ca9lZzGvP8gCYCWoXoljoT', pageSize: 100 };
    if(cursor) params.startCursor = cursor;
    return sdk().query(params).then(function(res){
      var rows = (res && res.results) ? res.results : [];
      acc = (acc||[]).concat(rows);
      if(res && res.hasMore && res.nextCursor) return qPos(res.nextCursor, acc);
      return acc;
    });
  }
  function qCal(cursor, acc){
    var params = { databaseId: 'WE6AI38GWioyyd3aGraNRg', pageSize: 100,
      sorts: [{ property: '事件日期', direction: 'ascending' }] };
    if(cursor) params.startCursor = cursor;
    return sdk().query(params).then(function(res){
      var rows = (res && res.results) ? res.results : [];
      acc = (acc||[]).concat(rows);
      if(res && res.hasMore && res.nextCursor) return qCal(res.nextCursor, acc);
      return acc;
    });
  }
  function loadOptions(){
    var db = sdk();
    if(!db) return Promise.resolve();
    return db.getSchema({ databaseId: 'Ca9lZzGvP8gCYCWoXoljoT' }).then(function(schema){
      var props = (schema && schema.properties) || [];
      props.forEach(function(f){
        if((f.type==='select'||f.type==='multi_select') && f.config && f.config.options){
          state.schemaOptions[f.name] = f.config.options;
        }
      });
    }).catch(function(){ /* 选项加载失败时用文本兜底 */ });
  }
  function loadData(){
    var db = sdk();
    if(!db){ goOffline('当前环境无在线数据能力'); return; }
    Promise.all([qDaily(), qHold(), qPos(), qCal()])
      .then(function(rs){
        state.db1 = rs[0]||[]; state.db2 = rs[1]||[]; state.db3 = rs[2]||[]; state.db4 = rs[3]||[];
        state.online = true;
        saveCache();
        return loadOptions();
      })
      .then(function(){ afterDataReady(); })
      .catch(function(err){
        console.error('[market] 数据加载失败:', err);
        goOffline('在线数据加载失败');
      });
  }
  function afterDataReady(){
    rebuildMaps();
    if(!state.db1map[state.date]){
      var latest = '';
      for(var i=0;i<state.db1dates.length;i++){
        if(state.db1dates[i] <= state.date) latest = state.db1dates[i];
      }
      if(latest) state.date = latest;
    }
    restoreDrafts();
    refreshAll();
  }
  function goOffline(reason){
    state.online = false;
    var cache = storageGet(CACHE_KEY);
    if(cache){
      state.db1 = cache.db1||[]; state.db2 = cache.db2||[]; state.db3 = cache.db3||[]; state.db4 = cache.db4||[];
    }
    rebuildMaps();
    if(!state.db1map[state.date]){
      var latest = '';
      for(var i=0;i<state.db1dates.length;i++){
        if(state.db1dates[i] <= state.date) latest = state.db1dates[i];
      }
      if(latest) state.date = latest;
    }
    restoreDrafts();
    refreshAll();
  }
  function saveCache(){ storageSet(CACHE_KEY, { db1: state.db1, db2: state.db2, db3: state.db3, db4: state.db4, at: Date.now() }); }
  function rebuildMaps(){
    state.db1map = {}; state.db2map = {}; state.db1dates = []; state.posByCode = {};
    state.db1.forEach(function(r){
      var k = dateKey(r['交易日期']);
      if(!k) return;
      state.db1map[k] = r;
      state.db1dates.push(k);
    });
    state.db1dates.sort();
    state.db2.forEach(function(r){
      var k = dateKey(r['交易日期']);
      if(!k) return;
      if(!state.db2map[k]) state.db2map[k] = [];
      state.db2map[k].push(r);
    });
    state.db3.forEach(function(p){
      var c = String(p['股票代码']||'').trim();
      if(c) state.posByCode[c] = p;
    });
  }

  /* ========== 统一刷新入口（渲染函数互不调用） ========== */
  function refreshAll(){
    renderSync();
    renderToday();
    renderCalendar();
    renderMarket();
    renderIntraday();
    renderGlobal();
    renderHoldings();
    renderPosTable();
    renderReview();
  }

  function renderSync(){
    var dot = $('syncDot'), txt = $('syncText');
    if(state.online){ dot.className = 'dot ok'; txt.textContent = '已同步'; }
    else { dot.className = 'dot off'; txt.textContent = '离线模式'; }
  }

  function calcTriggers(){
    var alerts = [];
    state.db3.forEach(function(p){
      var code = String(p['股票代码']||'').trim();
      var name = p['股票名称'] || code;
      var latest = null, latestD = '';
      for(var i=0;i<state.db2.length;i++){
        var r = state.db2[i];
        if(String(r['股票代码']||'').trim() !== code) continue;
        var d = dateKey(r['交易日期']);
        if(d && d <= state.date && d >= latestD){ latestD = d; latest = r; }
      }
      if(!latest) return;
      var close = Number(latest['收盘价']);
      if(isNaN(close)) return;
      var stop = Number(p['减仓触发价']), addp = Number(p['加仓触发价']);
      if(!isNaN(stop) && p['减仓触发价']!==null && p['减仓触发价']!==undefined && p['减仓触发价']!=='' && close >= stop){
        alerts.push({ t: name + ' 触发减仓信号：现价 ' + close + ' ≥ 减仓触发价 ' + stop, hot: true });
      }
      if(!isNaN(addp) && p['加仓触发价']!==null && p['加仓触发价']!==undefined && p['加仓触发价']!=='' && close <= addp){
        alerts.push({ t: name + ' 触发加仓信号：现价 ' + close + ' ≤ 加仓触发价 ' + addp, hot: true });
      }
    });
    return alerts;
  }

  function renderToday(){
    var el = $('todayList');
    var items = [];
    var rec = state.db1map[state.date];
    if(rec && rec['今日要处理']){
      var parts = String(rec['今日要处理']).split(/[；;\n]+/);
      for(var i=0;i<parts.length;i++){
        var t = parts[i].replace(/^\s+|\s+$/g,'');
        if(t) items.push({ t: t, hot: false });
      }
    }
    items = calcTriggers().concat(items);
    if(rec && !rec['大盘判断']){
      items.push({ t: state.date + ' 复盘未填写，请在下方「复盘笔记」补上', hot: true });
    }
    if(!items.length){
      el.innerHTML = '<li class="muted">' + (rec ? '暂无待处理事项' : '该日无行情记录（非交易日或尚未抓取）') + '</li>';
      return;
    }
    var html = '';
    for(var j=0;j<items.length;j++){
      html += '<li class="' + (items[j].hot?'hot':'') + '"><span class="tag">' + (items[j].hot?'信号':'提醒') + '</span><span>' + esc(items[j].t) + '</span></li>';
    }
    el.innerHTML = html;
  }

  function renderCalendar(){
    var el = $('calList');
    var today = todayStr();
    var horizon = shiftDate(today, 7);
    var rows = [];
    for(var i=0;i<state.db4.length;i++){
      var r = state.db4[i];
      var d = dateKey(r['事件日期']);
      if(!d) continue;
      if(d >= today && d <= horizon) rows.push({ d: d, r: r });
    }
    if(!rows.length){
      // 未来 7 天没有事件时，回退显示最近的 3 条日历记录
      var past = [];
      for(var m=0;m<state.db4.length;m++){
        var dm = dateKey(state.db4[m]['事件日期']);
        if(dm && dm < today) past.push({ d: dm, r: state.db4[m] });
      }
      past.sort(function(a,b){ return a.d<b.d?1:-1; });
      rows = past.slice(0,3);
    }
    rows.sort(function(a,b){ return a.d<b.d?-1:1; });
    if(!rows.length){
      el.innerHTML = '<li class="muted">暂无日历事件（自动更新会持续维护）</li>';
      return;
    }
    var html = '';
    for(var j=0;j<rows.length && j<8;j++){
      var it = rows[j];
      var imp = String(it.r['重要度']||'');
      var cls = imp==='高' ? 'ctag high' : (imp==='中' ? 'ctag mid' : 'ctag');
      var rel = String(it.r['关联标的']||'');
      html += '<li><span class="cdate">' + esc(it.d.slice(5).replace('-','/')) + '</span>'
        + '<span class="' + cls + '">' + esc(imp||'—') + '</span>'
        + '<span>' + esc(it.r['事件']||'') + '</span>'
        + (rel ? '<span class="crelated">' + esc(rel) + '</span>' : '')
        + '</li>';
    }
    el.innerHTML = html;
  }

  function parseSectors(s){
    if(!s) return [];
    try{
      var arr = JSON.parse(s);
      if(Object.prototype.toString.call(arr) !== '[object Array]') return [];
      var out = [];
      for(var i=0;i<arr.length;i++){
        var it = arr[i];
        if(it && it.name && it.pct!==undefined && !isNaN(Number(it.pct))){
          out.push({ name: String(it.name), pct: Number(it.pct), inflow: it.inflow!==undefined && !isNaN(Number(it.inflow)) ? Number(it.inflow) : null });
        }
      }
      return out;
    }catch(e){ return []; }
  }

  function sparklineSVG(points){
    if(!points || points.length < 2) return '<p class="muted">数据不足，暂无法绘制走势（至少 2 个交易日）</p>';
    var W=640,H=140,L=10,R=64,T=14,B=26;
    var min=Infinity,max=-Infinity;
    for(var i=0;i<points.length;i++){ if(points[i].v<min)min=points[i].v; if(points[i].v>max)max=points[i].v; }
    if(min===max){ min=min-1; max=max+1; }
    var span=max-min;
    function x(i){ return L + (W-L-R) * (i/(points.length-1)); }
    function y(v){ return T + (H-T-B) * (1-(v-min)/span); }
    var pts='';
    for(var j=0;j<points.length;j++){ pts += x(j).toFixed(1) + ',' + y(points[j].v).toFixed(1) + ' '; }
    var last=points[points.length-1];
    var svg = '<svg viewBox="0 0 680 ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="上证指数走势">';
    svg += '<line x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'" stroke="#223146" stroke-width="1"/>';
    svg += '<polyline points="'+pts+'" fill="none" stroke="#4f8cff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<circle cx="'+x(points.length-1).toFixed(1)+'" cy="'+y(last.v).toFixed(1)+'" r="4" fill="#4f8cff"/>';
    svg += '<text x="'+(x(points.length-1)+8).toFixed(1)+'" y="'+(y(last.v)+4).toFixed(1)+'" font-size="14" font-weight="700" fill="#e6edf3">'+last.v.toFixed(2)+'</text>';
    svg += '<text x="'+L+'" y="'+(H-8)+'" font-size="11" fill="#8fa0b3">'+esc(points[0].d)+'</text>';
    svg += '<text x="'+(W-R)+'" y="'+(H-8)+'" font-size="11" fill="#8fa0b3" text-anchor="end">'+esc(last.d)+'</text>';
    svg += '</svg>';
    return svg;
  }

  function sectorSVG(rows){
    if(!rows.length) return '<p class="muted">该日无板块资金流向数据</p>';
    var maxAbs=0;
    for(var i=0;i<rows.length;i++){ var a=Math.abs(rows[i].pct); if(a>maxAbs)maxAbs=a; }
    if(!maxAbs) maxAbs=1;
    var rowH=30, W=680, mid=250, scale=170;
    var H = rows.length*rowH + 12;
    var svg = '<svg viewBox="0 0 680 ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="板块涨跌与主力资金">';
    svg += '<line x1="'+(mid)+'" y1="4" x2="'+mid+'" y2="'+(H-8)+'" stroke="#223146" stroke-width="1"/>';
    for(var j=0;j<rows.length;j++){
      var r = rows[j];
      var cy = 12 + j*rowH + rowH/2 - 4;
      var w = Math.abs(r.pct)/maxAbs*scale;
      var fill = r.pct>0 ? '#ff5d5d' : (r.pct<0 ? '#2bd576' : '#8fa0b3');
      var bx = r.pct>0 ? mid : mid - w;
      svg += '<text x="6" y="'+(cy+4)+'" font-size="12" fill="#8fa0b3">'+esc(r.name)+'</text>';
      svg += '<rect x="'+bx.toFixed(1)+'" y="'+(cy-6)+'" width="'+Math.max(w,1).toFixed(1)+'" height="12" rx="3" fill="'+fill+'"/>';
      svg += '<text x="440" y="'+(cy+4)+'" font-size="12.5" font-weight="700" fill="'+fill+'">'+fmtPct(r.pct)+'</text>';
      var inflow = r.inflow===null ? '' : '主力 ' + (r.inflow>0?'+':'') + r.inflow.toFixed(1) + '亿';
      svg += '<text x="672" y="'+(cy+4)+'" font-size="11.5" fill="#8fa0b3" text-anchor="end">'+esc(inflow)+'</text>';
    }
    svg += '</svg>';
    return svg;
  }

  function parseIntraday(s){
    if(!s) return null;
    try{
      var o = JSON.parse(s);
      if(!o || !o.sh || !o.sh.pts) return null;
      return o;
    }catch(e){ return null; }
  }

  function intradaySVG(data){
    var pts = data.pts, amt = data.amt;
    if(!pts || pts.length<2) return '<p class="muted">该日无分时数据（自动更新 15:30 抓取当日分时）</p>';
    var W=680, H=210, L=8, R=64;
    var pT=12, pB=108;      // 价格区
    var aT=128, aB=182;     // 成交额区
    var vals=[], avals=[];
    for(var i=0;i<pts.length;i++){ if(pts[i][1]!==null && !isNaN(Number(pts[i][1]))) vals.push(Number(pts[i][1])); }
    for(var a=0;a<amt.length;a++){ if(amt[a][1]!==null && !isNaN(Number(amt[a][1]))) avals.push(Number(amt[a][1])); }
    if(vals.length<2) return '<p class="muted">分时数据不完整</p>';
    var min=Math.min.apply(null,vals), max=Math.max.apply(null,vals);
    var pad=(max-min)*0.12 || max*0.002 || 1;
    min-=pad; max+=pad;
    var aMax=avals.length ? Math.max.apply(null,avals) : 1;
    function x(i){ return L + (W-L-R) * (i/(pts.length-1)); }
    function y(v){ return pT + (pB-pT) * (1-(v-min)/(max-min)); }
    function ya(v){ return aT + (aB-aT) * (1-v/aMax); }
    // 前收：用首点近似开盘（若首点为09:30价格即开盘价，可作参考基准）
    var base = vals[0];
    var lastClose = vals[vals.length-1];
    var dayPct = base ? (lastClose/base-1)*100 : 0;
    var lineColor = lastClose>=base ? '#ff5d5d' : '#2bd576';
    var svg = '<svg viewBox="0 0 680 '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="当日分时走势">';
    // 价格区
    svg += '<text x="'+L+'" y="9" font-size="11" fill="#8fa0b3">价格</text>';
    svg += '<line x1="'+L+'" y1="'+y(base).toFixed(1)+'" x2="'+(W-R)+'" y2="'+y(base).toFixed(1)+'" stroke="#2c3d57" stroke-dasharray="4 4"/>';
    svg += '<text x="'+(W-R)+'" y="'+(y(base)-3).toFixed(1)+'" font-size="10" fill="#8fa0b3" text-anchor="end">前收 '+base.toFixed(2)+'</text>';
    var pstr='';
    for(var j=0;j<pts.length;j++){ pstr += x(j).toFixed(1)+','+y(Number(pts[j][1])).toFixed(1)+' '; }
    svg += '<polyline points="'+pstr+'" fill="none" stroke="'+lineColor+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<circle cx="'+x(pts.length-1).toFixed(1)+'" cy="'+y(lastClose).toFixed(1)+'" r="3.5" fill="'+lineColor+'"/>';
    svg += '<text x="'+(W-R)+'" y="'+(y(lastClose)+4).toFixed(1)+'" font-size="12.5" font-weight="700" fill="'+lineColor+'">'+lastClose.toFixed(2)+' ('+fmtPct(dayPct)+')</text>';
    svg += '<text x="'+L+'" y="'+(pB+4)+'" font-size="10.5" fill="#8fa0b3">'+esc(pts[0][0])+'</text>';
    svg += '<text x="'+((L+W-R)/2).toFixed(1)+'" y="'+(pB+4)+'" font-size="10.5" fill="#8fa0b3" text-anchor="middle">'+esc(pts[Math.floor(pts.length/2)][0])+'</text>';
    svg += '<text x="'+(W-R)+'" y="'+(pB+4)+'" font-size="10.5" fill="#8fa0b3" text-anchor="end">15:00</text>';
    // 成交额区
    if(avals.length>=2){
      svg += '<text x="'+L+'" y="'+(aT-4)+'" font-size="11" fill="#8fa0b3">成交额累计（亿）</text>';
      var astr='';
      for(var k=0;k<amt.length;k++){ astr += x(Math.min(k,amt.length-1)).toFixed(1)+','+ya(Number(amt[k][1])).toFixed(1)+' '; }
      svg += '<polygon points="'+L+','+(aB)+' '+astr+(W-R)+','+(aB)+'" fill="rgba(79,140,255,0.14)"/>';
      svg += '<polyline points="'+astr+'" fill="none" stroke="#4f8cff" stroke-width="1.6" stroke-linejoin="round"/>';
      svg += '<text x="'+(W-R)+'" y="'+(ya(avals[avals.length-1])+4).toFixed(1)+'" font-size="11.5" fill="#7fb4ff">'+avals[avals.length-1].toFixed(0)+' 亿</text>';
      svg += '<text x="'+L+'" y="'+(aB+14)+'" font-size="10.5" fill="#8fa0b3">'+esc(amt[0][0])+'</text>';
      svg += '<text x="'+(W-R)+'" y="'+(aB+14)+'" font-size="10.5" fill="#8fa0b3" text-anchor="end">'+esc(amt[amt.length-1][0])+'</text>';
    }
    svg += '</svg>';
    return svg;
  }

  function renderIntraday(){
    var wrap = $('intradayWrap');
    var rec = state.db1map[state.date];
    if(!rec){
      wrap.innerHTML = '<p class="muted">该日无行情记录，无分时数据</p>';
      return;
    }
    var data = parseIntraday(rec['分时数据']);
    if(!data || !data[state.intradayIdx]){
      wrap.innerHTML = '<p class="muted">该日无分时数据（自动更新 15:30 抓取当日分时）</p>';
      return;
    }
    wrap.innerHTML = intradaySVG(data[state.intradayIdx]);
  }

  function renderMarket(){
    var rec = state.db1map[state.date];
    var srcBadge = $('srcBadge');
    if(!rec){
      $('idxClose').textContent='--'; $('idxClose').className='flat';
      $('idxPct').textContent='--'; $('idxPct').className='pct flat';
      $('szPct').textContent='--'; $('szPct').className='flat';
      $('cybPct').textContent='--'; $('cybPct').className='flat';
      $('amtVal').textContent='--';
      $('moodBadge').textContent='--'; $('moodBadge').className='';
      $('sparkWrap').innerHTML='<p class="muted">该日无行情数据</p>';
      $('sectorList').innerHTML='<p class="muted">该日无板块资金流向数据</p>';
      srcBadge.textContent='无记录'; srcBadge.className='badge';
      return;
    }
    var shP = rec['上证涨跌幅'];
    var closeEl = $('idxClose');
    closeEl.textContent = num(rec['上证指数'],2) || '--';
    closeEl.className = pctCls(shP)==='down' ? 'down' : (pctCls(shP)==='up' ? 'up' : 'flat');
    var pctEl = $('idxPct');
    pctEl.textContent = fmtPct(shP); pctEl.className = 'pct ' + pctCls(shP);
    $('szPct').textContent = fmtPct(rec['深证成指涨跌幅']); $('szPct').className = pctCls(rec['深证成指涨跌幅']);
    $('cybPct').textContent = fmtPct(rec['创业板指涨跌幅']); $('cybPct').className = pctCls(rec['创业板指涨跌幅']);
    var amt = Number(rec['两市成交额']);
    $('amtVal').textContent = isNaN(amt) ? '--' : amt.toFixed(0) + ' 亿';
    var mood = String(rec['市场情绪']||'');
    var moodEl = $('moodBadge');
    moodEl.textContent = mood || '--';
    moodEl.className = 'mood ' + (MOODS.indexOf(mood)>=0 ? 'm'+(MOODS.indexOf(mood)+1) : '');
    var pts = [];
    for(var i=0;i<state.db1dates.length;i++){
      var d = state.db1dates[i];
      if(d > state.date) break;
      var v = Number(state.db1map[d]['上证指数']);
      if(!isNaN(v)) pts.push({ d: d.slice(5), v: v });
    }
    pts = pts.slice(-12);
    $('sparkWrap').innerHTML = sparklineSVG(pts);
    $('sectorList').innerHTML = sectorSVG(parseSectors(rec['板块资金流向']));
    srcBadge.textContent = rec['数据来源'] || '数据';
    srcBadge.className = 'badge' + (rec['数据来源']==='示例数据' ? ' sample' : '');
  }

  function renderGlobal(){
    var rec = state.db1map[state.date];
    var grid = $('globalGrid'), comment = $('globalComment');
    if(!rec){
      grid.innerHTML = '<p class="muted">该日无数据</p>';
      comment.textContent = '--';
      return;
    }
    var html = '';
    for(var i=0;i<GLOBAL_FIELDS.length;i++){
      var name = GLOBAL_FIELDS[i][0], field = GLOBAL_FIELDS[i][1];
      var v = rec[field];
      html += '<div class="gcard"><span class="gname">' + esc(name) + '</span><b class="' + pctCls(v) + '">' + fmtPct(v) + '</b></div>';
    }
    var cnh = rec['离岸人民币'];
    var cnhTxt = (cnh===null||cnh===undefined||isNaN(Number(cnh))) ? '--' : Number(cnh).toFixed(3);
    html += '<div class="gcard"><span class="gname">离岸人民币（USDCNH）</span><b class="flat">' + esc(cnhTxt) + '</b></div>';
    grid.innerHTML = html;
    comment.textContent = rec['全球联动简评'] || '暂无联动简评';
  }

  function holdingsOfDate(){
    var rows = state.db2map[state.date] || [];
    var merged = [];
    for(var i=0;i<rows.length;i++){
      var r = rows[i];
      var code = String(r['股票代码']||'').trim();
      var pos = state.posByCode[code] || null;
      merged.push({ row: r, pos: pos, pct: Number(r['涨跌幅']) });
    }
    merged.sort(function(a,b){ return (b.pct||0) - (a.pct||0); });
    return merged;
  }

  function holdBarsSVG(list){
    if(!list.length) return '<p class="muted">该日无持仓行情数据</p>';
    var maxAbs=0;
    for(var i=0;i<list.length;i++){ var a=Math.abs(list[i].pct||0); if(a>maxAbs)maxAbs=a; }
    if(!maxAbs) maxAbs=1;
    var rowH=30, W=680, mid=230, scale=160, H=list.length*rowH+12;
    var svg = '<svg viewBox="0 0 680 '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="持仓当日涨跌">';
    svg += '<line x1="'+mid+'" y1="4" x2="'+mid+'" y2="'+(H-8)+'" stroke="#223146" stroke-width="1"/>';
    for(var j=0;j<list.length;j++){
      var it=list[j];
      var name = it.row['股票名称'] || it.row['股票代码'];
      var cy = 12 + j*rowH + rowH/2 - 4;
      var w = Math.abs(it.pct||0)/maxAbs*scale;
      var fill = it.pct>0 ? '#ff5d5d' : (it.pct<0 ? '#2bd576' : '#8fa0b3');
      var bx = it.pct>0 ? mid : mid-w;
      var label = esc(name) + (it.pos && it.pos['类型']==='观察仓' ? '（观察）' : '');
      svg += '<text x="6" y="'+(cy+4)+'" font-size="12" fill="#c7d3e0">'+label+'</text>';
      svg += '<rect x="'+bx.toFixed(1)+'" y="'+(cy-6)+'" width="'+Math.max(w,1).toFixed(1)+'" height="12" rx="3" fill="'+fill+'"/>';
      svg += '<text x="'+(W-8)+'" y="'+(cy+4)+'" font-size="12.5" font-weight="700" fill="'+fill+'" text-anchor="end">'+fmtPct(it.pct)+'</text>';
    }
    svg += '</svg>';
    return svg;
  }

  function cumSVG(dates, series){
    if(dates.length<2) return '<p class="muted">数据不足（至少 2 个交易日）</p>';
    var W=680,H=170,L=10,R=10,T=14,B=26;
    var min=Infinity,max=-Infinity;
    for(var s=0;s<series.length;s++){
      for(var i=0;i<series[s].vals.length;i++){
        if(series[s].vals[i]<min)min=series[s].vals[i];
        if(series[s].vals[i]>max)max=series[s].vals[i];
      }
    }
    if(min===max){min-=1;max+=1;}
    var span=max-min;
    function x(i){ return L+(W-L-R)*(i/(dates.length-1)); }
    function y(v){ return T+(H-T-B)*(1-(v-min)/span); }
    var svg='<svg viewBox="0 0 680 '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="组合与上证累计走势">';
    svg+='<line x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'" stroke="#223146"/>';
    svg+='<line x1="'+L+'" y1="'+y(100)+'" x2="'+(W-R)+'" y2="'+y(100)+'" stroke="#2c3d57" stroke-dasharray="4 4"/>';
    for(var k=0;k<series.length;k++){
      var pts='';
      for(var m=0;m<series[k].vals.length;m++){ pts+=x(m).toFixed(1)+','+y(series[k].vals[m]).toFixed(1)+' '; }
      svg+='<polyline points="'+pts+'" fill="none" stroke="'+series[k].color+'" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      svg+='<text x="'+(W-R)+'" y="'+(y(series[k].vals[series[k].vals.length-1])-6)+'" font-size="11.5" fill="'+series[k].color+'" text-anchor="end">'+esc(series[k].name)+' '+((series[k].vals[series[k].vals.length-1])-100).toFixed(2)+'%</text>';
    }
    svg+='<text x="'+L+'" y="'+(H-8)+'" font-size="11" fill="#8fa0b3">'+esc(dates[0])+'</text>';
    svg+='<text x="'+(W-R)+'" y="'+(H-8)+'" font-size="11" fill="#8fa0b3" text-anchor="end">'+esc(dates[dates.length-1])+'</text>';
    svg+='</svg>';
    return svg;
  }

  function renderHoldings(){
    var list = holdingsOfDate();
    var shRec = state.db1map[state.date];
    var shPct = shRec ? Number(shRec['上证涨跌幅']) : NaN;
    var sumEl = $('holdSummary');

    if(!list.length){
      sumEl.innerHTML = '<div class="s">该日无持仓行情数据</div>';
      $('holdBars').innerHTML = '<p class="muted">该日无持仓行情数据</p>';
      $('holdTbody').innerHTML = '<tr><td colspan="7" class="muted">该日无持仓行情数据</td></tr>';
      $('cumChart').innerHTML = '<p class="muted">数据不足</p>';
      return;
    }

    var avg=0, upCnt=0, beatCnt=0, totalMv=0, portRet=0, hasMv=false;
    for(var i=0;i<list.length;i++){
      var p = list[i].pct||0;
      avg += p;
      if(p>0) upCnt++;
      if(!isNaN(shPct) && p>shPct) beatCnt++;
      var pos = list[i].pos;
      if(pos && pos['持股数'] && pos['持股数']>0){
        var close = Number(list[i].row['收盘价']);
        if(!isNaN(close)){
          hasMv = true;
          totalMv += close * pos['持股数'];
        }
      }
    }
    avg = avg / list.length;
    if(hasMv && totalMv>0){
      for(var j=0;j<list.length;j++){
        var pj = list[j].pct||0;
        var posj = list[j].pos;
        var closej = Number(list[j].row['收盘价']);
        if(posj && posj['持股数'] && posj['持股数']>0 && !isNaN(closej)){
          list[j].contrib = pj * (closej*posj['持股数']) / totalMv;
          portRet += list[j].contrib;
        } else {
          list[j].contrib = null;
        }
      }
    }

    var html = '';
    html += '<div class="s">组合等权平均<b class="'+pctCls(avg)+'">'+fmtPct(avg)+'</b></div>';
    html += '<div class="s">上涨家数<b>'+upCnt+' / '+list.length+'</b></div>';
    html += '<div class="s">跑赢上证<b>'+(isNaN(shPct)?'--':beatCnt+' / '+list.length)+'</b></div>';
    if(hasMv){
      html += '<div class="s">组合当日估算收益<b class="'+pctCls(portRet)+'">'+fmtPct(portRet)+'</b></div>';
      html += '<div class="s">持仓市值<b>¥ '+(totalMv/10000).toFixed(2)+' 万</b></div>';
    }
    sumEl.innerHTML = html;

    $('holdBars').innerHTML = holdBarsSVG(list);

    var tbody='';
    for(var k=0;k<list.length;k++){
      var it=list[k];
      var name=it.row['股票名称']||'';
      var code=String(it.row['股票代码']||'');
      var pos=it.pos;
      var wtag = pos && pos['类型']==='观察仓' ? '<span class="wtag watch">观察仓</span>' : (pos?'<span class="wtag hold">持仓</span>':'');
      var closeV = num(it.row['收盘价'],2) || '--';
      var rel = isNaN(shPct)?'--':fmtPct((it.pct||0)-shPct);
      var relCls = isNaN(shPct)?'flat':pctCls((it.pct||0)-shPct);
      var contribTxt='--', contribCls='flat';
      if(it.contrib!==null && it.contrib!==undefined){ contribTxt=fmtPct(it.contrib); contribCls=pctCls(it.contrib); }
      var trig='';
      if(pos){
        var stop=Number(pos['减仓触发价']), addp=Number(pos['加仓触发价']);
        var closeN=Number(it.row['收盘价']);
        if(!isNaN(stop) && pos['减仓触发价'] && !isNaN(closeN) && closeN>=stop*0.98){
          trig='<span class="neartrig">接近/达到减仓价 '+stop+'</span>';
        } else if(!isNaN(addp) && pos['加仓触发价'] && !isNaN(closeN) && closeN<=addp*1.02){
          trig='<span class="neartrig">接近/达到加仓价 '+addp+'</span>';
        }
      }
      tbody += '<tr><td>'+esc(name)+wtag+'</td><td>'+esc(closeV)+'</td><td class="'+pctCls(it.pct)+'">'+fmtPct(it.pct)+'</td><td class="'+relCls+'">'+esc(rel)+'</td><td class="'+contribCls+'">'+esc(contribTxt)+'</td><td>'+trig+'</td>'
        + '<td><button class="btn small ghost" type="button" data-act="chart" data-code="'+esc(code)+'">走势</button></td></tr>';
    }
    $('holdTbody').innerHTML = tbody;

    var dates=[], shVals=[], pfVals=[], base=null;
    for(var m=0;m<state.db1dates.length;m++){
      var d=state.db1dates[m];
      if(d>state.date) break;
      dates.push(d);
    }
    dates = dates.slice(-20);
    if(dates.length>=2){
      for(var n=0;n<dates.length;n++){
        var dRec = state.db1map[dates[n]];
        var sp = Number(dRec['上证涨跌幅']);
        if(isNaN(sp)){ shVals.push(null); pfVals.push(null); continue; }
        if(base===null) base = { sh: 100, pf: 100 };
        else {
          base = { sh: base.sh*(1+sp/100), pf: base.pf*(1+avgOfDate(dates[n])/100) };
        }
        shVals.push(base.sh);
        pfVals.push(base.pf);
      }
      var cleanedDates=[], cSh=[], cPf=[];
      for(var q=0;q<dates.length;q++){
        if(shVals[q]===null || pfVals[q]===null) break;
        cleanedDates.push(dates[q]); cSh.push(shVals[q]); cPf.push(pfVals[q]);
      }
      $('cumChart').innerHTML = cumSVG(cleanedDates, [
        { name:'组合(等权)', color:'#e8b339', vals:cPf },
        { name:'上证指数', color:'#4f8cff', vals:cSh }
      ]);
    } else {
      $('cumChart').innerHTML = '<p class="muted">数据不足（至少 2 个交易日）</p>';
    }
  }

  function avgOfDate(dateStr){
    var rows = state.db2map[dateStr] || [];
    if(!rows.length) return 0;
    var s=0;
    for(var i=0;i<rows.length;i++){ s += Number(rows[i]['涨跌幅'])||0; }
    return s/rows.length;
  }

  /* ========== 个股走势查看器 ========== */
  function stockSeriesSVG(name, dates, stockVals, shVals){
    if(dates.length<2) return '<p class="muted">数据不足（至少 2 个交易日）</p>';
    var W=680,H=180,L=10,R=70,T=14,B=26;
    var min=Infinity,max=-Infinity;
    var all = stockVals.concat(shVals);
    for(var i=0;i<all.length;i++){ if(all[i]<min)min=all[i]; if(all[i]>max)max=all[i]; }
    if(min===max){ min-=1; max+=1; }
    var span=max-min;
    function x(i){ return L+(W-L-R)*(i/(dates.length-1)); }
    function y(v){ return T+(H-T-B)*(1-(v-min)/span); }
    var svg='<svg viewBox="0 0 680 '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="个股与上证累计走势">';
    svg+='<line x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'" stroke="#223146"/>';
    svg+='<line x1="'+L+'" y1="'+y(100)+'" x2="'+(W-R)+'" y2="'+y(100)+'" stroke="#2c3d57" stroke-dasharray="4 4"/>';
    var series=[
      { name:name+'（累计）', color:'#e8b339', vals:stockVals },
      { name:'上证指数（累计）', color:'#4f8cff', vals:shVals }
    ];
    for(var k=0;k<series.length;k++){
      var pts='';
      for(var m=0;m<series[k].vals.length;m++){ pts+=x(m).toFixed(1)+','+y(series[k].vals[m]).toFixed(1)+' '; }
      svg+='<polyline points="'+pts+'" fill="none" stroke="'+series[k].color+'" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      var lv=series[k].vals[series[k].vals.length-1];
      svg+='<text x="'+(W-R)+'" y="'+(y(lv)-6).toFixed(1)+'" font-size="11.5" fill="'+series[k].color+'" text-anchor="end">'+esc(series[k].name)+' '+(lv>0?'+':'')+(lv-100).toFixed(2)+'%</text>';
    }
    svg+='<text x="'+L+'" y="'+(H-8)+'" font-size="11" fill="#8fa0b3">'+esc(dates[0])+'</text>';
    svg+='<text x="'+(W-R)+'" y="'+(H-8)+'" font-size="11" fill="#8fa0b3" text-anchor="end">'+esc(dates[dates.length-1])+'</text>';
    svg+='</svg>';
    return svg;
  }

  function openStockModal(code){
    var target=null, name=code;
    for(var i=0;i<state.db3.length;i++){
      if(String(state.db3[i]['股票代码']||'').trim()===code){ target=state.db3[i]; name=state.db3[i]['股票名称']||code; break; }
    }
    if(!target){
      // 允许查看不在持仓清单里的历史记录股票
      for(var j=0;j<state.db2.length;j++){
        if(String(state.db2[j]['股票代码']||'').trim()===code){ name=state.db2[j]['股票名称']||code; break; }
      }
    }
    // 收集该股与上证近 12 个交易日收盘
    var dates=[], sVals=[], shVals=[];
    var sClose=null, shClose=null;
    var count=0;
    for(var m=state.db1dates.length-1;m>=0 && count<12;m--){
      var d=state.db1dates[m];
      if(d>state.date) continue;
      var shRec=state.db1map[d];
      var shC=Number(shRec['上证指数']);
      var sC=null;
      var rows=state.db2map[d]||[];
      for(var n=0;n<rows.length;n++){
        if(String(rows[n]['股票代码']||'').trim()===code){ sC=Number(rows[n]['收盘价']); break; }
      }
      if(isNaN(shC) || sC===null || isNaN(sC)) continue;
      if(shClose===null){ shClose=shC; sClose=sC; }
      // 基准日取窗口内最早一个有效日：临时收集，最后归一
      dates.push(d); sVals.push(sC); shVals.push(shC);
      count++;
    }
    dates.reverse(); sVals.reverse(); shVals.reverse();
    var html='';
    if(dates.length>=2){
      var s0=sVals[0], sh0=shVals[0];
      var sv=[], hv=[];
      for(var q=0;q<dates.length;q++){ sv.push(sVals[q]/s0*100); hv.push(shVals[q]/sh0*100); }
      var chg=(sv[sv.length-1]-100), shChg=(hv[hv.length-1]-100);
      var winCls = chg>=0 ? 'up' : 'down';
      $('stockTitle').textContent = name + ' · 近 ' + dates.length + ' 个交易日';
      $('stockSub').innerHTML = '区间累计 <span class="'+winCls+'">'+(chg>0?'+':'')+chg.toFixed(2)+'%</span>（同期上证 '+(shChg>0?'+':'')+shChg.toFixed(2)+'%，'+(chg>=shChg?'跑赢':'跑输')+' '+Math.abs(chg-shChg).toFixed(2)+' 个百分点）· 基准日 '+dates[0];
      html = stockSeriesSVG(name, dates, sv, hv);
    } else {
      $('stockTitle').textContent = name + ' · 个股走势';
      $('stockSub').textContent = '该股历史收盘数据不足，暂无法绘制走势';
    }
    $('stockChart').innerHTML = html;
    $('stockOverlay').className = 'show';
  }

  function closeStockModal(){
    $('stockOverlay').className = '';
  }

  function renderPosTable(){
    var tbody = $('posTbody');
    if(!state.db3.length){
      tbody.innerHTML = '<tr><td colspan="6" class="muted">暂无持仓，先在下方添加</td></tr>';
      return;
    }
    var html='';
    for(var i=0;i<state.db3.length;i++){
      var p=state.db3[i];
      var id=p['_id'];
      var tp = p['类型']==='观察仓' ? '<span class="wtag watch">观察仓</span>' : '<span class="wtag hold">持仓</span>';
      html += '<tr><td>'+esc(p['股票名称']||'')+'<br><span class="muted" style="font-size:11px;">'+esc(p['股票代码']||'')+'</span></td>'
        + '<td>'+tp+'</td>'
        + '<td>'+esc(num(p['成本价'],3)||'--')+'</td>'
        + '<td>'+esc(num(p['持股数'],0)||'--')+'</td>'
        + '<td>'+esc(num(p['减仓触发价'],2)||'--')+' / '+esc(num(p['加仓触发价'],2)||'--')+'</td>'
        + '<td><button class="btn small" type="button" data-act="edit" data-id="'+esc(id)+'">编辑</button> <button class="btn small ghost" type="button" data-act="del" data-id="'+esc(id)+'">删除</button></td></tr>';
    }
    tbody.innerHTML = html;
  }

  function renderReview(){
    var rec = state.db1map[state.date];
    $('r_todo').value = rec && rec['今日要处理'] ? rec['今日要处理'] : '';
    $('r_judge').value = rec && rec['大盘判断'] ? rec['大盘判断'] : '';
    $('r_op').value = rec && rec['持仓操作'] ? rec['持仓操作'] : '';
    $('r_plan').value = rec && rec['明日计划'] ? rec['明日计划'] : '';
    $('r_risk').value = rec && rec['风险提示'] ? rec['风险提示'] : '';
    $('reviewStatus').textContent = '';
  }

  /* ========== 写操作 ========== */
  function saveReview(e){
    e.preventDefault();
    var btn = $('reviewSaveBtn');
    var props = {
      '今日要处理': { text: $('r_todo').value },
      '大盘判断': { text: $('r_judge').value },
      '持仓操作': { text: $('r_op').value },
      '明日计划': { text: $('r_plan').value },
      '风险提示': { text: $('r_risk').value }
    };
    var db = sdk();
    btn.disabled = true; btn.textContent = '保存中…';
    var rec = state.db1map[state.date];
    var p;
    if(state.online && db && rec){
      p = db.updateRecord({ databaseId: DATABASE_ID, recordId: rec['_id'], properties: props });
    } else if(state.online && db){
      var full = {
        '交易日期': { date: state.date },
        '数据来源': { select: '手动录入' },
        '今日要处理': props['今日要处理'],
        '大盘判断': props['大盘判断'],
        '持仓操作': props['持仓操作'],
        '明日计划': props['明日计划'],
        '风险提示': props['风险提示']
      };
      p = db.addRecord({ databaseId: DATABASE_ID, properties: full });
    } else {
      storageSet(DRAFT_REVIEW, { date: state.date, props: props });
      $('reviewStatus').textContent = '离线模式：已暂存本地，恢复联网后请重新保存';
      btn.disabled = false; btn.textContent = '保存复盘';
      return;
    }
    p.then(function(){
      storageDel(DRAFT_REVIEW);
      $('reviewStatus').textContent = '已保存 ✓';
      btn.disabled = false; btn.textContent = '保存复盘';
      loadData();
    }).catch(function(err){
      console.error('[market] 复盘保存失败:', err);
      storageSet(DRAFT_REVIEW, { date: state.date, props: props });
      $('reviewStatus').textContent = '保存失败，已暂存本地草稿，请稍后重试';
      btn.disabled = false; btn.textContent = '保存复盘';
    });
  }

  function savePos(e){
    e.preventDefault();
    var name = $('posForm').elements['p_name'].value.replace(/^\s+|\s+$/g,'');
    var code = $('posForm').elements['p_code'].value.replace(/^\s+|\s+$/g,'');
    var status = $('posStatus');
    if(!name || !code){ status.textContent = '股票名称和代码必填'; return; }
    var props = { '股票名称': { text: name }, '股票代码': { text: code } };
    var typeVal = $('p_type').value;
    if(typeVal) props['类型'] = { select: typeVal };
    var cost = $('posForm').elements['p_cost'].value;
    if(cost!=='') props['成本价'] = { number: parseFloat(cost) };
    var shares = $('posForm').elements['p_shares'].value;
    if(shares!=='') props['持股数'] = { number: parseFloat(shares) };
    var stop = $('posForm').elements['p_stop'].value;
    if(stop!=='') props['减仓触发价'] = { number: parseFloat(stop) };
    var addp = $('posForm').elements['p_addp'].value;
    if(addp!=='') props['加仓触发价'] = { number: parseFloat(addp) };
    var note = $('posForm').elements['p_note'].value;
    props['备注'] = { text: note };

    var db = sdk();
    var btn = $('posSaveBtn');
    if(!state.online || !db){
      status.textContent = '离线模式：暂不能修改持仓，恢复联网后再试';
      return;
    }
    btn.disabled = true; btn.textContent = '保存中…';
    var p;
    if(state.editingPosId){
      p = db.updateRecord({ databaseId: 'Ca9lZzGvP8gCYCWoXoljoT', recordId: state.editingPosId, properties: props });
    } else {
      p = db.addRecord({ databaseId: 'Ca9lZzGvP8gCYCWoXoljoT', properties: props });
    }
    p.then(function(){
      storageDel(DRAFT_POS);
      status.textContent = '已保存 ✓';
      btn.disabled = false; btn.textContent = '保存';
      resetPosForm();
      loadData();
    }).catch(function(err){
      console.error('[market] 持仓保存失败:', err);
      status.textContent = '保存失败，请稍后重试';
      btn.disabled = false; btn.textContent = '保存';
    });
  }

  function deletePos(id){
    if(!confirm('确定删除这条持仓记录吗？删除后不可恢复。')) return;
    var db = sdk();
    if(!state.online || !db){ alert('离线模式不能删除'); return; }
    db.deleteRecord({ databaseId: 'Ca9lZzGvP8gCYCWoXoljoT', recordId: id }).then(function(){
      if(state.editingPosId===id) resetPosForm();
      loadData();
    }).catch(function(err){
      console.error('[market] 删除失败:', err);
      alert('删除失败，请稍后重试');
    });
  }

  function editPos(id){
    var rec = null;
    for(var i=0;i<state.db3.length;i++){
      if(state.db3[i]['_id']===id){ rec = state.db3[i]; break; }
    }
    if(!rec) return;
    state.editingPosId = id;
    var f = $('posForm');
    f.elements['p_name'].value = rec['股票名称']||'';
    f.elements['p_code'].value = rec['股票代码']||'';
    fillTypeSelect();
    var opts = state.schemaOptions['类型']||[];
    var sel = $('p_type');
    sel.value = '';
    for(var j=0;j<opts.length;j++){
      if(opts[j].text === rec['类型']){ sel.value = opts[j].id; break; }
    }
    f.elements['p_cost'].value = rec['成本价']===null||rec['成本价']===undefined ? '' : rec['成本价'];
    f.elements['p_shares'].value = rec['持股数']===null||rec['持股数']===undefined ? '' : rec['持股数'];
    f.elements['p_stop'].value = rec['减仓触发价']===null||rec['减仓触发价']===undefined ? '' : rec['减仓触发价'];
    f.elements['p_addp'].value = rec['加仓触发价']===null||rec['加仓触发价']===undefined ? '' : rec['加仓触发价'];
    f.elements['p_note'].value = rec['备注']||'';
    $('posFormTitle').textContent = '编辑：' + (rec['股票名称']||'');
    $('btnCancelEdit').hidden = false;
    $('posStatus').textContent = '';
  }

  function resetPosForm(){
    state.editingPosId = null;
    $('posForm').reset();
    fillTypeSelect();
    $('posFormTitle').textContent = '添加持仓 / 观察仓';
    $('btnCancelEdit').hidden = true;
    $('posStatus').textContent = '';
    storageDel(DRAFT_POS);
  }

  function clearSample(){
    var ids1 = [], ids2 = [], ids4 = [];
    for(var i=0;i<state.db1.length;i++){
      if(state.db1[i]['数据来源']==='示例数据') ids1.push(state.db1[i]['_id']);
    }
    for(var j=0;j<state.db2.length;j++){
      if(state.db2[j]['数据来源']==='示例数据') ids2.push(state.db2[j]['_id']);
    }
    for(var k=0;k<state.db4.length;k++){
      if(state.db4[k]['数据来源']==='示例数据') ids4.push(state.db4[k]['_id']);
    }
    var total = ids1.length + ids2.length + ids4.length;
    if(!total){ alert('没有找到示例数据'); return; }
    if(!confirm('将删除 ' + total + ' 条示例数据（行情总表 ' + ids1.length + ' 条、持仓表现 ' + ids2.length + ' 条、财经日历 ' + ids4.length + ' 条），不可恢复。确定吗？')) return;
    var db = sdk();
    if(!state.online || !db){ alert('离线模式不能删除'); return; }
    var chain = Promise.resolve();
    ids1.forEach(function(id){
      chain = chain.then(function(){ return db.deleteRecord({ databaseId: 'cLcxNlQynomKfZa92Ptryc', recordId: id }); });
    });
    ids2.forEach(function(id){
      chain = chain.then(function(){ return db.deleteRecord({ databaseId: 'rOEUCAdnBUZXNJpMNg1WNd', recordId: id }); });
    });
    ids4.forEach(function(id){
      chain = chain.then(function(){ return db.deleteRecord({ databaseId: 'WE6AI38GWioyyd3aGraNRg', recordId: id }); });
    });
    chain.then(function(){ loadData(); }).catch(function(err){
      console.error('[market] 清空示例失败:', err);
      alert('部分删除失败，请刷新后重试');
      loadData();
    });
  }

  function exportJSON(){
    var payload = {
      exportedAt: new Date().toISOString(),
      daily: state.db1,
      holdingsDaily: state.db2,
      positions: state.db3,
      calendar: state.db4
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'market-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
  }

  /* ========== 草稿缓存（DSDK008） ========== */
  function restoreDrafts(){
    var dr = storageGet(DRAFT_REVIEW);
    if(dr && dr.date===state.date && dr.props){
      var m = { todo:'今日要处理', judge:'大盘判断', op:'持仓操作', plan:'明日计划', risk:'风险提示' };
      var keys = Object.keys(m);
      for(var i=0;i<keys.length;i++){
        var el = $('r_'+keys[i]);
        var val = dr.props[m[keys[i]]];
        var text = val && val.text!==undefined ? val.text : '';
        if(el && !el.value && text) el.value = text;
      }
      $('reviewStatus').textContent = '检测到未保存的本地草稿，请确认后保存';
    }
    var dp = storageGet(DRAFT_POS);
    if(dp && dp.props){
      var f = $('posForm');
      var pm = { p_name:'股票名称', p_code:'股票代码', p_note:'备注' };
      var ks = Object.keys(pm);
      for(var j=0;j<ks.length;j++){
        var v = dp.props[pm[ks[j]]];
        var tv = v && v.text!==undefined ? v.text : '';
        if(f.elements[ks[j]] && !f.elements[ks[j]].value && tv) f.elements[ks[j]].value = tv;
      }
    }
  }
  var draftReviewSave = debounce(function(){
    storageSet(DRAFT_REVIEW, {
      date: state.date,
      props: {
        '今日要处理': { text: $('r_todo').value },
        '大盘判断': { text: $('r_judge').value },
        '持仓操作': { text: $('r_op').value },
        '明日计划': { text: $('r_plan').value },
        '风险提示': { text: $('r_risk').value }
      }
    });
  }, 300);
  var draftPosSave = debounce(function(){
    var f = $('posForm');
    storageSet(DRAFT_POS, {
      props: {
        '股票名称': { text: f.elements['p_name'].value },
        '股票代码': { text: f.elements['p_code'].value },
        '备注': { text: f.elements['p_note'].value }
      }
    });
  }, 300);

  /* ========== 选项渲染（运行时从 schema 取，不硬编码） ========== */
  function fillTypeSelect(){
    var sel = $('p_type');
    var cur = sel.value;
    var opts = state.schemaOptions['类型'] || [];
    sel.innerHTML = '<option value="">请选择类型</option>';
    for(var i=0;i<opts.length;i++){
      var o = document.createElement('option');
      o.value = opts[i].id;
      o.textContent = opts[i].text;
      sel.appendChild(o);
    }
    if(cur) sel.value = cur;
  }

  /* ========== 事件绑定与初始化 ========== */
  function bindEvents(){
    $('btnPrev').addEventListener('click', function(){ state.date = shiftDate(state.date,-1); syncDateInput(); refreshAll(); });
    $('btnNext').addEventListener('click', function(){ state.date = shiftDate(state.date,1); syncDateInput(); refreshAll(); });
    $('btnLatest').addEventListener('click', function(){
      var latest = '';
      for(var i=0;i<state.db1dates.length;i++){
        if(state.db1dates[i] <= todayStr()) latest = state.db1dates[i];
      }
      state.date = latest || todayStr();
      syncDateInput(); refreshAll();
    });
    $('dateInput').addEventListener('change', function(){
      if(this.value){ state.date = this.value; refreshAll(); }
    });
    $('reviewForm').addEventListener('submit', saveReview);
    $('r_todo').addEventListener('input', draftReviewSave);
    $('r_judge').addEventListener('input', draftReviewSave);
    $('r_op').addEventListener('input', draftReviewSave);
    $('r_plan').addEventListener('input', draftReviewSave);
    $('r_risk').addEventListener('input', draftReviewSave);
    $('posForm').addEventListener('submit', savePos);
    $('posForm').addEventListener('input', draftPosSave);
    $('btnCancelEdit').addEventListener('click', resetPosForm);
    $('posTbody').addEventListener('click', function(e){
      var btn = e.target.closest ? e.target.closest('button') : null;
      if(!btn) return;
      var act = btn.getAttribute('data-act'), id = btn.getAttribute('data-id');
      if(act==='edit') editPos(id);
      else if(act==='del') deletePos(id);
    });
    $('holdTbody').addEventListener('click', function(e){
      var btn = e.target.closest ? e.target.closest('button') : null;
      if(!btn) return;
      var act = btn.getAttribute('data-act'), code = btn.getAttribute('data-code');
      if(act==='chart' && code) openStockModal(code);
    });
    $('intradayTabs').addEventListener('click', function(e){
      var tab = e.target.closest ? e.target.closest('.tab') : null;
      if(!tab) return;
      var idx = tab.getAttribute('data-idx');
      if(!idx || idx===state.intradayIdx) return;
      state.intradayIdx = idx;
      var tabs = this.querySelectorAll('.tab');
      for(var i=0;i<tabs.length;i++){ tabs[i].className = (tabs[i]===tab) ? 'tab on' : 'tab'; }
      renderIntraday();
    });
    $('btnCloseStock').addEventListener('click', closeStockModal);
    $('stockOverlay').addEventListener('click', function(e){ if(e.target===this) closeStockModal(); });
    $('btnManage').addEventListener('click', function(){ openDrawer(true); });
    $('btnCloseDrawer').addEventListener('click', function(){ openDrawer(false); });
    $('overlay').addEventListener('click', function(){ openDrawer(false); });
    $('btnExport').addEventListener('click', exportJSON);
    $('btnClearSample').addEventListener('click', clearSample);
  }
  function openDrawer(show){
    $('drawer').className = show ? 'open' : '';
    $('overlay').className = show ? 'show' : '';
  }
  function syncDateInput(){ $('dateInput').value = state.date; }

  function init(){
    state.date = todayStr();
    syncDateInput();
    bindEvents();
    fillTypeSelect();
    loadData();
  }

  init();
})();
