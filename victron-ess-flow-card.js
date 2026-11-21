/*! victron-ess-flow-card — animated energy flow for Victron ESS systems
 *  Grid, Multi/Quattro, AC loads, battery, DC-coupled (MPPT) and AC-coupled PV, drawn as they are wired.
 *  https://github.com/CVKBaca/victron-ess-flow-card · MIT License
 */
(() => {
  const VERSION = '0.2.1';
  const TAG = 'victron-ess-flow-card';

  const I18N = {
    en: {
      grid: 'Grid', inverter: 'Inverter', loads: 'AC loads', battery: 'Battery', dc: 'Solar DC', ac: 'Solar AC',
      import: 'Import', export: 'Export', idle: 'Idle', output: 'Output', charging: 'Charging',
      discharging: 'Discharging', today: 'Today',
    },
    sk: {
      grid: 'Sieť', inverter: 'Menič', loads: 'Spotreba', battery: 'Batéria', dc: 'FV – DC', ac: 'FV – AC',
      import: 'Odber', export: 'Dodávka', idle: 'Bez toku', output: 'Výstup', charging: 'Nabíja',
      discharging: 'Vybíja', today: 'Dnes',
    },
  };

  // VE.Bus states (Victron /VebusState, Modbus vebus 31 / system 844): raw code or English text -> translated text
  const VEBUS = {
    codes: { 0: 'off', 1: 'low_power', 2: 'fault', 3: 'bulk', 4: 'absorption', 5: 'float', 6: 'storage', 7: 'equalize',
      8: 'passthru', 9: 'inverting', 10: 'power_assist', 11: 'power_supply', 244: 'sustain', 252: 'external_control' },
    en: { off: 'Off', low_power: 'Low power', fault: 'Fault', bulk: 'Bulk', absorption: 'Absorption', float: 'Float',
      storage: 'Storage', equalize: 'Equalize', passthru: 'Passthru', inverting: 'Inverting', power_assist: 'Power assist',
      power_supply: 'Power supply', sustain: 'Sustain', external_control: 'External control' },
    sk: { off: 'Vypnutý', low_power: 'Úsporný režim', fault: 'Porucha', bulk: 'Bulk', absorption: 'Absorpcia',
      float: 'Udržiavanie', storage: 'Skladovanie', equalize: 'Vyrovnávanie', passthru: 'Priechod', inverting: 'Invertovanie',
      power_assist: 'Podpora siete', power_supply: 'Napájanie', sustain: 'Udržiavanie SoC', external_control: 'Externé riadenie' },
  };
  const vebusKey = (v) => {
    const s = String(v ?? '').trim();
    if (/^\d+$/.test(s)) return VEBUS.codes[+s] || null;
    const k = s.toLowerCase().replace(/passthrough/, 'passthru').replace(/[\s-]+/g, '_');
    return VEBUS.en[k] ? k : null;
  };

  const COLORS = {
    grid: '#9FB3C8', import: '#E07A5F', export: '#9FB3C8', inverter: '#387DC5', loads: '#4AB9C1',
    battery: '#5DBE6E', dc: '#F7AB3E', ac: '#FDD835',
  };

  // portrait = phones / narrow columns, landscape = wide cards
  const LAYOUTS = {
    portrait: { W: 380, bw: 160, cols: [0, 220], gap: 52, rows: [['grid', 'ac'], ['inverter', 'loads'], ['battery', 'dc']] },
    landscape: { W: 960, bw: 200, cols: [0, 380, 760], gap: 60, rows: [['grid', 'inverter', 'loads'], ['dc', 'battery', 'ac']] },
    // landscape with consumers: 4th column right of the loads box
    landscape4: { W: 1240, bw: 200, cols: [0, 350, 700, 1040], gap: 60, rows: [['grid', 'inverter', 'loads'], ['dc', 'battery', 'ac']] },
  };
  const CONS_GAP = 12;    // gap between consumer boxes
  const CONS_FIRST = 28;  // portrait: gap between the loads box and the first row of consumers
  const CORNER_R = 10;    // radius of rounded line corners
  const CONS_PER_ROW = 2; // portrait: consumers side by side, right of the inverter-battery line up to the card edge
  const LANDSCAPE_MIN_WIDTH = 560;

  // flows: [from, to, key]; positive power flows from -> to
  const FLOWS = [['grid', 'inverter', 'grid'], ['inverter', 'loads', 'out'], ['ac', 'loads', 'ac'],
    ['inverter', 'battery', 'dcbus'], ['dc', 'battery', 'dc']];

  const list = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const boxH = (n) => (n ? 92 + 16 * (n - 1) : 70);
  const HDR_H = 22; // header bar height (header_style: bar)

  // readable text color (dark or white) for a header bar of the given color
  const onColor = (col) => {
    const s = String(col).trim();
    let rgb = null;
    let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
      rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    } else if ((m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i))) {
      rgb = [m[1], m[2], m[3]].map(Number);
    }
    if (!rgb) return 'rgba(0,0,0,.87)';
    const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? 'rgba(0,0,0,.87)' : '#fff';
  };

  const STYLE = `
    :host { display: block; }
    ha-card { padding: 12px; overflow: hidden; }
    .title { font-size: 16px; font-weight: 500; color: var(--primary-text-color); padding: 0 4px 10px; }
    svg { display: block; width: 100%; height: auto; overflow: visible;
      font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, sans-serif)); }
    .bg { fill: var(--secondary-background-color, #282828); cursor: pointer; }
    .lbl { fill: var(--secondary-text-color); font-size: 11px; font-weight: 700; letter-spacing: .06em; }
    .val { fill: var(--primary-text-color); font-size: 26px; font-weight: 700; }
    .val.small { font-size: 20px; }
    .u { font-size: 13px; font-weight: 500; fill-opacity: .7; }
    .sub { fill: var(--secondary-text-color); font-size: 12px; }
    .ln { fill: none; stroke: var(--divider-color, rgba(127,127,127,.25)); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .la { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transition: opacity .4s; }
    .la.on { opacity: .35; }
    text { pointer-events: none; }
  `;

  class VictronEssFlowCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._t = I18N.en;
      this._lang = 'en';
    }

    static getStubConfig() {
      return {
        grid: { power: 'sensor.grid_power' },
        inverter: { state: 'sensor.vebus_state' },
        loads: { power: 'sensor.ac_loads_power' },
        battery: { power: 'sensor.battery_power', soc: 'sensor.battery_soc' },
      };
    }

    setConfig(cfg) {
      if (!cfg || !cfg.grid || !list(cfg.grid.power).length) throw new Error('grid.power is required');
      if (!cfg.inverter) throw new Error('inverter is required');
      if (!cfg.loads || !list(cfg.loads.power).length) throw new Error('loads.power is required');
      const src = (a) => list(a).map((s) => (typeof s === 'string' ? { power: s } : s)).filter((s) => s && s.power);
      this._cfg = Object.assign({ layout: 'auto', min_flow: 10 }, cfg, {
        header_style: cfg.header_style === 'stripe' ? 'stripe' : 'bar',
        dc_sources: src(cfg.dc_sources), ac_sources: src(cfg.ac_sources),
        consumers: list(cfg.loads.consumers).map((x) => (typeof x === 'string' ? { power: x } : x)).filter(Boolean),
        colors: Object.assign({}, COLORS, cfg.colors || {}),
      });
      const c = this._cfg;
      const ents = [...list(c.grid.power), ...list(c.loads.power), c.inverter.state, ...list(c.inverter.power),
        c.inverter.dc_power, c.inverter.mode];
      if (c.battery) ents.push(...list(c.battery.power), c.battery.soc, c.battery.voltage, c.battery.current, c.battery.state);
      [...c.dc_sources, ...c.ac_sources].forEach((s) => ents.push(...list(s.power), s.today, ...list(s.voltage), ...list(s.current)));
      list(c.loads.details).forEach((d) => ents.push(...list(d.power)));
      ents.push(c.loads.today);
      c.consumers.forEach((x) => ents.push(...list(x.power), x.today, ...list(x.extra).map((e) => e.entity)));
      ['grid', 'inverter', 'loads', 'battery'].forEach((k) => c[k] && list(c[k].extra).forEach((x) => ents.push(x.entity)));
      this._ents = [...new Set(ents.filter(Boolean))];
      this._key = null;
      this._sig = null;
      this._render();
    }

    // inverter state: known VE.Bus states translated by the card, anything else via HA (translated enums) or raw
    _stateText(e) {
      const so = this._so(e);
      if (!so) return undefined;
      const k = vebusKey(so.state);
      if (k) return (VEBUS[this._lang.split('-')[0]] || VEBUS.en)[k];
      try { if (this._hass.formatEntityState) return this._hass.formatEntityState(so); } catch (err) { /* fall back */ }
      return so.state;
    }

    set hass(h) {
      this._hass = h;
      const lang = (h.locale && h.locale.language) || h.language || 'en';
      this._lang = lang;
      this._t = I18N[lang.split('-')[0]] || I18N.en;
      this._render();
    }

    connectedCallback() {
      if (!this._ro) this._ro = new ResizeObserver(() => this._render(true));
      this._ro.observe(this);
    }

    disconnectedCallback() {
      if (this._ro) this._ro.disconnect();
    }

    getCardSize() { return 6; }
    getGridOptions() { return { columns: 12, min_columns: 6 }; }

    // ---------------------------------------------------------------- values
    _so(e) { return e && this._hass ? this._hass.states[e] : undefined; }
    _st(e) { const s = this._so(e); return s ? s.state : undefined; }
    _num(e) { const v = parseFloat(this._st(e)); return Number.isFinite(v) ? v : NaN; }
    _pw(e) {
      const v = this._num(e);
      const u = ((this._so(e) || {}).attributes || {}).unit_of_measurement;
      return u === 'kW' ? v * 1000 : v;
    }
    _sum(ids) {
      let t = 0, ok = false;
      list(ids).forEach((e) => { const v = this._pw(e); if (!Number.isNaN(v)) { t += v; ok = true; } });
      return ok ? t : NaN;
    }
    _f(v, d = 0) {
      if (v == null || Number.isNaN(v)) return '–';
      return new Intl.NumberFormat(this._lang, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
    }
    _W(v) { return `${this._f(Number.isNaN(v) ? v : Math.round(v))} W`; }
    _num0(v) { return Number.isNaN(v) ? '–' : this._f(Math.round(v)); }
    _phases(ids) { return list(ids).length > 1 ? list(ids).map((e) => this._num0(this._pw(e))).join(' · ') + ' W' : null; }
    _extra(x) {
      const s = this._so(x.entity);
      if (!s) return `${x.name || x.entity}: –`;
      const u = x.unit != null ? x.unit : (s.attributes.unit_of_measurement || '');
      return `${x.name ? x.name + ': ' : ''}${s.state}${u ? ' ' + u : ''}`;
    }
    _mode() {
      const l = this._cfg.layout;
      if (l === 'portrait' || l === 'landscape') return l;
      const w = this.clientWidth || this.getBoundingClientRect().width || 0;
      return w >= LANDSCAPE_MIN_WIDTH ? 'landscape' : 'portrait';
    }

    // ---------------------------------------------------------------- model
    _model() {
      const c = this._cfg, t = this._t, C = c.colors, min = c.min_flow;
      const inv = (o) => (o && o.invert ? -1 : 1);
      const B = {}, F = {};
      const tap = (o, fallback) => (o && o.tap_entity) || fallback;

      // grid (+ = import)
      const grid = this._sum(c.grid.power) * inv(c.grid);
      const idleG = Number.isNaN(grid) || Math.abs(grid) < min;
      const gl = [Number.isNaN(grid) ? '–' : idleG ? t.idle : grid > 0 ? t.import : t.export];
      const gp = this._phases(c.grid.power); if (gp) gl.push(gp);
      list(c.grid.extra).forEach((x) => gl.push(this._extra(x)));
      B.grid = { label: c.grid.name || t.grid, color: C.grid, value: this._num0(Math.abs(grid)), unit: 'W',
        valueColor: idleG ? null : grid > 0 ? C.import : C.export, lines: gl, e: tap(c.grid, list(c.grid.power)[0]) };
      F.grid = grid;

      // PV sources (+ = production)
      const srcBox = (arr, key, label) => {
        if (!arr.length) return NaN;
        let tot = 0, ok = false;
        // PV voltage (list = average, e.g. strings) and current (list = sum)
        const va = (s) => {
          const out = [];
          const vs = list(s.voltage).map((e) => this._num(e)).filter((v) => !Number.isNaN(v));
          if (list(s.voltage).length) out.push(`${this._f(vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : NaN, 1)} V`);
          if (list(s.current).length) out.push(`${this._f(this._sum(s.current), 1)} A`);
          return out;
        };
        let lines;
        if (arr.length === 1) {
          // one source: the power is the big value -> line 1 = name · V · A, line 2 = today
          const s = arr[0];
          const p = this._sum(s.power); if (!Number.isNaN(p)) { tot += p; ok = true; }
          lines = [[s.name, ...va(s)].filter(Boolean).join(' · '),
            s.today ? `${t.today} ${this._f(this._num(s.today), 2)} kWh` : ''].filter(Boolean);
        } else {
          lines = arr.map((s) => {
            const p = this._sum(s.power); if (!Number.isNaN(p)) { tot += p; ok = true; }
            const today = s.today ? `${this._f(this._num(s.today), 2)} kWh` : '';
            return `${s.name ? s.name + ' ' : ''}${this._W(p)}${today ? ' · ' + today : ''}`;
          });
        }
        const total = ok ? tot : NaN;
        B[key] = { label, color: C[key], value: this._num0(total), unit: 'W', valueColor: C[key], lines, e: list(arr[0].power)[0] };
        return total;
      };
      const dcT = srcBox(c.dc_sources, 'dc', c.dc_label || t.dc);
      const acT = srcBox(c.ac_sources, 'ac', c.ac_label || t.ac);
      F.dc = dcT; F.ac = acT;

      // AC loads (+ = consumption)
      const load = this._sum(c.loads.power) * inv(c.loads);
      const ll = [];
      const lp = this._phases(c.loads.power); if (lp) ll.push(lp);
      const loadToday = c.loads.today ? this._num(c.loads.today) : NaN;
      if (c.loads.today) ll.push(`${t.today} ${this._f(loadToday, 2)} kWh`);
      list(c.loads.details).forEach((d) => ll.push(`${d.name || d.power} ${this._W(this._sum(d.power))}`));
      list(c.loads.extra).forEach((x) => ll.push(this._extra(x)));
      B.loads = { label: c.loads.name || t.loads, color: C.loads, value: this._num0(load), unit: 'W', lines: ll,
        e: tap(c.loads, list(c.loads.power)[0]) };

      // consumers fed from the AC loads (bus); the first one without `power` gets the rest (loads − others)
      // (same for today's energy: a consumer without `today` gets loads.today − others, if loads.today is set)
      let known = 0, knownToday = 0, todayOk = true;
      c.consumers.forEach((x) => {
        const p = list(x.power).length ? this._sum(x.power) : NaN; if (!Number.isNaN(p)) known += p;
        if (list(x.power).length) { const e = x.today ? this._num(x.today) : NaN; if (Number.isNaN(e)) todayOk = false; else knownToday += e; }
      });
      let restUsed = false;
      c.consumers.forEach((x, j) => {
        let p = NaN, today = x.today ? this._num(x.today) : NaN;
        if (list(x.power).length) p = this._sum(x.power);
        else if (!restUsed) {
          restUsed = true;
          p = Number.isNaN(load) ? NaN : Math.max(0, load - known);
          if (!x.today && c.loads.today) today = todayOk && !Number.isNaN(loadToday) ? Math.max(0, loadToday - knownToday) : NaN;
        }
        const cl = [];
        if (x.today || (!list(x.power).length && c.loads.today)) cl.push(`${t.today} ${this._f(today, 2)} kWh`);
        list(x.extra).forEach((e) => cl.push(this._extra(e)));
        const k = 'c' + j;
        B[k] = { label: x.name || `${t.loads} ${j + 1}`, color: x.color || C.loads, value: this._num0(p), unit: 'W',
          lines: cl, cons: true, e: tap(x, list(x.power)[0] || list(c.loads.power)[0]) };
        F[k] = p;
      });

      // battery (+ = charging)
      let bat = NaN;
      if (c.battery) {
        const b = c.battery;
        bat = this._sum(b.power) * inv(b);
        const soc = this._num(b.soc);
        const parts = [this._W(bat)];
        if (b.voltage) parts.push(`${this._f(this._num(b.voltage), 1)} V`);
        if (b.current) parts.push(`${this._f(this._num(b.current), 1)} A`);
        const state = b.state ? String(this._stateText(b.state) ?? '–')
          : Number.isNaN(bat) ? '–' : Math.abs(bat) < min ? t.idle : bat > 0 ? t.charging : t.discharging;
        const bl = [parts.join(' · '), state];
        list(b.extra).forEach((x) => bl.push(this._extra(x)));
        const sc = Number.isNaN(soc) ? null : soc < 20 ? '#E5484D' : soc < 50 ? '#F7AB3E' : C.battery;
        B.battery = { label: b.name || t.battery, color: C.battery, value: this._num0(soc), unit: '%', valueColor: sc,
          lines: bl, e: tap(b, b.soc || list(b.power)[0]) };
      }

      // inverter / charger
      const i = c.inverter;
      const outIds = list(i.power);
      const out = outIds.length ? this._sum(outIds) : load - (Number.isNaN(acT) ? 0 : acT);
      const st = i.state ? this._stateText(i.state) : null;
      const il = [];
      if (outIds.length) il.push(`${t.output} ${this._W(out)}`);
      if (i.mode) il.push(String(this._stateText(i.mode) ?? '–'));
      list(i.extra).forEach((x) => il.push(this._extra(x)));
      B.inverter = { label: i.name || t.inverter, color: C.inverter, value: st != null ? esc(st) : this._num0(out),
        unit: st != null ? '' : 'W', lines: il, e: tap(i, i.state || outIds[0]) };
      F.out = out;
      // DC bus between inverter and battery: + = inverter charges the battery
      F.dcbus = i.dc_power ? this._pw(i.dc_power) * (i.invert_dc ? -1 : 1) : bat - (Number.isNaN(dcT) ? 0 : dcT);

      return { B, F };
    }

    // ---------------------------------------------------------------- layout
    _layout(mode, B) {
      const ck = Object.keys(B).filter((k) => B[k].cons);
      const P = mode === 'landscape' && ck.length ? LAYOUTS.landscape4 : LAYOUTS[mode];
      const pos = {};
      let y = 0;
      P.rows.forEach((row) => {
        const keys = row.filter((k) => B[k]);
        if (!keys.length) return;
        const h = Math.max(...keys.map((k) => boxH(B[k].lines.length)));
        row.forEach((k, idx) => { if (B[k]) pos[k] = { x: P.cols[idx], y, w: P.bw, h }; });
        y += h + P.gap;
        // portrait: consumers side by side under the loads box, from the inverter-battery line to the card edge;
        // rows of CONS_PER_ROW, right-aligned (the last consumer sits right under the loads box)
        if (mode === 'portrait' && ck.length && row.includes('loads')) {
          y += CONS_FIRST - P.gap;
          const x0 = P.cols[0] + P.bw / 2 + CONS_GAP;
          const w = (P.W - x0 - CONS_GAP * (CONS_PER_ROW - 1)) / CONS_PER_ROW;
          for (let r = 0; r < ck.length; r += CONS_PER_ROW) {
            const rk = ck.slice(r, r + CONS_PER_ROW);
            const hc = Math.max(...rk.map((k) => boxH(B[k].lines.length)));
            rk.forEach((k, j) => { pos[k] = { x: P.W - (rk.length - j) * (w + CONS_GAP) + CONS_GAP, y, w, h: hc, row: r / CONS_PER_ROW }; });
            y += hc + CONS_GAP;
          }
          y += P.gap - CONS_GAP;
        }
      });
      let H = y - P.gap;
      // landscape: consumers stacked in the 4th column
      if (mode === 'landscape' && ck.length) {
        let yc = 0;
        ck.forEach((k) => {
          const hc = boxH(B[k].lines.length);
          pos[k] = { x: P.cols[3], y: yc, w: P.bw, h: hc };
          yc += hc + CONS_GAP;
        });
        H = Math.max(H, yc - CONS_GAP);
      }
      return { W: P.W, H, pos, mode };
    }

    // one line per consumer from the loads box (no shared bus)
    _consPaths(L, keys) {
      const a = L.pos.loads, out = {};
      if (!a) return out;
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      if (L.mode === 'portrait') {
        const y0 = a.y + a.h, yb = y0 + CONS_FIRST / 2;
        keys.forEach((k) => {
          const b = L.pos[k]; if (!b) return;
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          if (!b.row) {
            const ax = clamp(cx, a.x + 24, a.x + a.w - 24);
            const inv = L.pos.inverter;
            const gx = inv ? (inv.x + inv.w + a.x) / 2 : NaN; // middle of the gap between inverter and loads
            if (ax === cx) {
              // under the loads box: straight down
              out[k] = { d: `M${cx},${y0} L${cx},${b.y}`, len: b.y - y0 };
            } else if (gx > b.x + 8 && gx < b.x + b.w - 8 && a.x > gx) {
              // left of the loads box: into its left side (below the inverter line), up the gap, rounded corner
              const R = CORNER_R, ey = a.y + a.h - 16;
              out[k] = { d: `M${a.x},${ey} L${gx + R},${ey} A${R},${R} 0 0 0 ${gx},${ey + R} L${gx},${b.y}`,
                len: (a.x - gx - R) + (b.y - ey - R) + Math.PI * R / 2 };
            } else {
              out[k] = { d: `M${ax},${y0} L${ax},${yb} L${cx},${yb} L${cx},${b.y}`, len: (yb - y0) + Math.abs(cx - ax) + (b.y - yb) };
            }
          } else {
            // further rows: down the gap between the columns, then sideways into the box
            const right = b.x + b.w + CONS_GAP / 2 <= a.x + a.w;
            const gx = right ? b.x + b.w + CONS_GAP / 2 : b.x - CONS_GAP / 2;
            const ex = right ? b.x + b.w : b.x;
            out[k] = { d: `M${gx},${y0} L${gx},${cy} L${ex},${cy}`, len: (cy - y0) + CONS_GAP / 2 };
          }
        });
        return out;
      }
      const x0 = a.x + a.w;
      let prev = -Infinity;
      keys.forEach((k, i) => {
        const b = L.pos[k]; if (!b) return;
        const cy = b.y + b.h / 2;
        let ay = clamp(cy, a.y + HDR_H + 8, a.y + a.h - 8);
        if (ay < prev + 10) ay = Math.min(prev + 10, a.y + a.h - 4);
        prev = ay;
        const mx = x0 + (b.x - x0) * (i + 1) / (keys.length + 1);
        out[k] = ay === cy ? { d: `M${x0},${cy} L${b.x},${cy}`, len: b.x - x0 }
          : { d: `M${x0},${ay} L${mx},${ay} L${mx},${cy} L${b.x},${cy}`, len: (b.x - x0) + Math.abs(cy - ay) };
      });
      return out;
    }

    _path(a, b) {
      if (a.y === b.y) {
        const y = a.y + a.h / 2;
        return a.x < b.x ? { d: `M${a.x + a.w},${y} L${b.x},${y}`, len: b.x - a.x - a.w }
          : { d: `M${a.x},${y} L${b.x + b.w},${y}`, len: a.x - b.x - b.w };
      }
      const x = a.x + a.w / 2;
      return a.y < b.y ? { d: `M${x},${a.y + a.h} L${x},${b.y}`, len: b.y - a.y - a.h }
        : { d: `M${x},${a.y} L${x},${b.y + b.h}`, len: a.y - b.y - b.h };
    }

    _build(L, B) {
      const C = this._cfg.colors;
      let defs = '', boxes = '', lines = '';
      this._flows = [];
      FLOWS.forEach(([a, b, k]) => {
        if (!L.pos[a] || !L.pos[b]) return;
        const p = this._path(L.pos[a], L.pos[b]);
        const col = { grid: C.grid, out: C.loads, ac: C.ac, dcbus: C.battery, dc: C.dc }[k];
        this._flows.push({ k, d: p.d, len: p.len, col });
        lines += `<path class="ln" d="${p.d}"/><path class="la" data-la="${k}" d="${p.d}" stroke="${col}"/><g data-dots="${k}"></g>`;
      });
      const ck = Object.keys(B).filter((k) => B[k].cons);
      const cp = this._consPaths(L, ck);
      ck.filter((k) => cp[k]).forEach((k) => {
        const p = cp[k];
        const col = B[k].color;
        this._flows.push({ k, d: p.d, len: p.len, col });
        lines += `<path class="ln" d="${p.d}"/><path class="la" data-la="${k}" d="${p.d}" stroke="${esc(col)}"/><g data-dots="${k}"></g>`;
      });
      Object.entries(L.pos).forEach(([k, p]) => {
        defs += `<clipPath id="c-${k}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12"/></clipPath>`;
        boxes += `<g><rect class="bg" data-e="${esc(B[k].e || '')}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12"/>`
          + (this._cfg.header_style === 'bar'
            ? `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${HDR_H}" fill="${esc(B[k].color)}" clip-path="url(#c-${k})"/>`
            : `<rect x="${p.x}" y="${p.y}" width="4" height="${p.h}" fill="${esc(B[k].color)}" clip-path="url(#c-${k})"/>`)
          + `<g data-box="${k}"></g></g>`;
      });
      const title = this._cfg.title ? `<div class="title">${esc(this._cfg.title)}</div>` : '';
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card>${title}`
        + `<svg viewBox="-2 -2 ${L.W + 4} ${L.H + 4}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${lines}${boxes}</svg></ha-card>`;
      this.shadowRoot.querySelector('svg').addEventListener('click', (ev) => {
        const r = ev.composedPath().find((x) => x && x.dataset && x.dataset.e);
        if (!r) return;
        this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: r.dataset.e } }));
      });
      this._flowQ = {};
    }

    _render(force) {
      if (!this._cfg || !this._hass) return;
      const mode = this._mode();
      const sig = mode + '|' + this._ents.map((e) => this._st(e)).join('|') + '|' + this._lang;
      if (!force && sig === this._sig) return;
      this._sig = sig;
      const { B, F } = this._model();
      const key = mode + '|' + Object.keys(B).map((k) => k + B[k].lines.length).join(',');
      const L = this._layout(mode, B);
      if (key !== this._key) { this._build(L, B); this._key = key; }
      const root = this.shadowRoot;

      // texts (bar: title in the header bar, content moved up a little)
      const bar = this._cfg.header_style === 'bar';
      const yL = bar ? 15 : 24, yV = bar ? 52 : 56, yS = bar ? 74 : 78;
      Object.entries(L.pos).forEach(([k, p]) => {
        const b = B[k], x = p.x + (bar ? 12 : 16), mx = p.w - (bar ? 22 : 26);
        const vc = b.valueColor ? ` style="fill:${b.valueColor}"` : '';
        const small = b.unit === '' && String(b.value).length > 10 ? ' small' : '';
        const lc = bar ? ` style="fill:${onColor(b.color)}"` : '';
        let s = `<text class="lbl" x="${x}" y="${p.y + yL}"${lc} data-max="${mx}">${esc(b.label.toLocaleUpperCase(this._lang))}</text>`;
        s += `<text class="val${small}" x="${x}" y="${p.y + yV}"${vc} data-max="${mx}">${b.value}`
          + (b.unit ? `<tspan class="u" dx="4">${b.unit}</tspan>` : '') + '</text>';
        b.lines.forEach((ln, i) => { s += `<text class="sub" x="${x}" y="${p.y + yS + 16 * i}" data-max="${mx}">${esc(ln)}</text>`; });
        const g = root.querySelector(`[data-box="${k}"]`);
        if (g) g.innerHTML = s;
      });
      root.querySelectorAll('text[data-max]').forEach((el) => {
        const max = +el.dataset.max;
        try {
          if (el.getComputedTextLength() > max) { el.setAttribute('textLength', max); el.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
        } catch (e) { /* not rendered yet */ }
      });

      // animated flows
      (this._flows || []).forEach((f) => {
        const p = F[f.k];
        const on = !Number.isNaN(p) && Math.abs(p) >= this._cfg.min_flow;
        const dur = on ? Math.round(Math.max(0.6, Math.min(4, 4.6 - Math.log10(Math.abs(p)))) * Math.sqrt(Math.max(f.len, 20) / 60) * 4) / 4 : 0;
        const q = on ? (p > 0 ? '+' : '-') + dur : 'off';
        root.querySelector(`[data-la="${f.k}"]`).classList.toggle('on', on);
        if (this._flowQ[f.k] === q) return;
        this._flowQ[f.k] = q;
        let s = '';
        if (on) {
          const n = Math.max(2, Math.round(f.len / 28));
          const kp = p > 0 ? '0;1' : '1;0';
          for (let j = 0; j < n; j++) {
            s += `<circle r="3.5" fill="${f.col}"><animateMotion dur="${dur}s" begin="-${(j * dur / n).toFixed(2)}s" `
              + `repeatCount="indefinite" path="${f.d}" keyPoints="${kp}" keyTimes="0;1" calcMode="linear"/></circle>`;
          }
        }
        root.querySelector(`[data-dots="${f.k}"]`).innerHTML = s;
      });
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, VictronEssFlowCard);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({ type: TAG, name: 'Victron ESS Flow Card', preview: false,
      description: 'Animated energy flow for Victron ESS: grid, inverter, loads, battery, DC and AC-coupled PV' });
  }
  console.info(`%c VICTRON-ESS-FLOW-CARD %c ${VERSION} `, 'color:#fff;background:#387DC5;font-weight:700', 'color:#387DC5');
})();
