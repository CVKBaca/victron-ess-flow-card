/*! victron-ess-flow-card — animated energy flow for Victron ESS systems
 *  Grid, Multi/Quattro, AC loads, battery, DC-coupled (MPPT) and AC-coupled PV, drawn as they are wired.
 *  https://github.com/CVKBaca/victron-ess-flow-card · MIT License
 */
(() => {
  const VERSION = '0.7.0';
  const TAG = 'victron-ess-flow-card';
  const LS_KEY = `${TAG}:view`; // view chosen with the toggle, remembered per device (browser)

  const I18N = {
    en: {
      grid: 'Grid', inverter: 'Inverter', loads: 'AC loads', battery: 'Battery', dc: 'Solar DC', ac: 'Solar AC',
      import: 'Import', export: 'Export', idle: 'Idle', output: 'Output', charging: 'Charging',
      discharging: 'Discharging', today: 'Today', position: 'Position', voltage: 'Voltage', current: 'Current', detail: 'Detailed view', compact: 'Compact view',
      other: 'Other', balance: 'Balance today', selfsuff: 'Self-sufficiency', src_pv: 'PV', src_bat: 'Bat.', src_grid: 'Grid', peak: 'Peak today',
    },
    sk: {
      grid: 'Sieť', inverter: 'Menič', loads: 'Spotreba', battery: 'Batéria', dc: 'FV – DC', ac: 'FV – AC',
      import: 'Odber', export: 'Dodávka', idle: 'Bez toku', output: 'Výstup', charging: 'Nabíja',
      discharging: 'Vybíja', today: 'Dnes', position: 'Pozícia', voltage: 'Napätie', current: 'Prúd', detail: 'Detailné zobrazenie', compact: 'Kompaktné zobrazenie',
      other: 'Ostatné', balance: 'Bilancia dnes', selfsuff: 'Sebestačnosť', src_pv: 'FV', src_bat: 'Bat.', src_grid: 'Sieť', peak: 'Max dnes',
    },
  };
  // mdi:unfold-more-horizontal / mdi:unfold-less-horizontal
  const ICON_MORE = 'M12,18.17L8.83,15L7.42,16.41L12,21L16.59,16.41L15.17,15M12,5.83L15.17,9L16.58,7.59L12,3L7.41,7.59L8.83,9L12,5.83Z';
  const ICON_LESS = 'M16.59,5.41L15.17,4L12,7.17L8.83,4L7.41,5.41L12,10M7.41,18.59L8.83,20L12,16.83L15.17,20L16.58,18.59L12,14L7.41,18.59Z';

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

  // color_mode: accent = mono + this palette (energy colors common in the community: yellow PV, blue battery,
  // Victron blue inverter, red-orange import, green export, cyan loads), lines under the box titles, filled inverter
  const ACCENT = { dc: '#FDD835', ac: '#FDD835', battery: '#64B5F6', import: '#FF7043', export: '#66BB6A',
    loads: '#26C6DA', inverter: '#387DC5' };

  const COLORS = {
    grid: '#9FB3C8', import: '#E07A5F', export: '#9FB3C8', inverter: '#387DC5', loads: '#4AB9C1',
    battery: '#5DBE6E', dc: '#F7AB3E', ac: '#FDD835', header: '#387DC5',
  };

  // portrait = phones / narrow columns, landscape = wide cards
  const LAYOUTS = {
    portrait: { W: 380, bw: 160, cols: [0, 220], gap: 32, rows: [['grid', 'ac'], ['inverter', 'loads'], ['battery', 'dc']] },
    landscape: { W: 960, bw: 200, cols: [0, 380, 760], gap: 60, rows: [['grid', 'inverter', 'loads'], ['dc', 'battery', 'ac']] },
    // landscape with consumers: 4th column right of the loads box
    landscape4: { W: 1240, bw: 200, cols: [0, 350, 700, 1040], gap: 60, rows: [['grid', 'inverter', 'loads'], ['dc', 'battery', 'ac']] },
  };
  const CONS_GAP = 12;    // gap between consumer boxes
  const CONS_FIRST = 28;  // portrait: gap between the loads box and the first row of consumers
  const CORNER_R = 10;    // radius of rounded line corners
  const ALERT = '#E5484D'; // box header color while an alert is active
  // background graphs: today from 00:00 in 5-minute bins; data per entity, shared by all cards on the page
  const BIN_MS = 5 * 60 * 1000;
  const GRAPH_BINS = 288;
  const GRAPH_REFETCH = 10 * 60 * 1000; // no update for this long (e.g. phone asleep) -> reload today's history
  const GRAPH_CACHE = new Map();         // entity id -> { day, vals: Float64Array, last, loading }
  const dayStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const CONS_PER_ROW = 2; // portrait: consumers side by side, right of the inverter-battery line up to the card edge
  const LANDSCAPE_MIN_WIDTH = 560;

  // flows: [from, to, key]; positive power flows from -> to
  const FLOWS = [['grid', 'inverter', 'grid'], ['inverter', 'loads', 'out'], ['ac', 'loads', 'ac'],
    ['inverter', 'battery', 'dcbus'], ['dc', 'battery', 'dc']];

  const list = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // box content: lines (string, 16 px) and tables ({head, rows}, detailed view, TR px per row incl. the header)
  const TR = 14;
  const itemH = (it) => (typeof it === 'string' ? 16 : TR * (it.rows.length + 1) + 2);
  const boxH = (items) => (items.length ? 76 + items.reduce((s, it) => s + itemH(it), 0) : 70);
  const HDR_H = 22; // header bar height (header_style: bar)

  // readable text color (dark or white) for a header bar of the given color
  // maxL: luminance above which dark text is used (default: the one with better contrast)
  // TEXT_L: header texts are white unless the color is light (strict contrast picks black on mid blues / purples)
  const TEXT_L = 0.3;
  const onColor = (col, maxL) => {
    const s = String(col).trim();
    let rgb = null;
    let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
      rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    } else if ((m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i))) {
      rgb = [m[1], m[2], m[3]].map(Number);
    }
    if (!rgb) return maxL != null ? '#fff' : 'rgba(0,0,0,.87)';
    const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (maxL != null) return L > maxL ? 'rgba(0,0,0,.87)' : '#fff';
    return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? 'rgba(0,0,0,.87)' : '#fff';
  };

  const STYLE = `
    :host { display: block; }
    ha-card { padding: 12px; overflow: hidden; }
    /* card header in the style of the box headers: colored bar (header_style: bar) or stripe on the left */
    .hdr { display: flex; align-items: center; gap: 8px; height: 34px; margin: -12px -12px 12px; padding: 0 6px 0 16px;
      background: var(--vefc-hdr); color: var(--vefc-hdr-text); }
    .hdr.stripe { background: none; color: var(--secondary-text-color); box-shadow: inset 4px 0 0 var(--vefc-hdr); }
    /* icon: in a circle left of the title, like button-card headers */
    .hdr.ic { padding-left: 10px; }
    .hic { flex: none; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
      border-radius: 50%; background: rgba(0,0,0,.12); --mdc-icon-size: 20px; }
    .hdr.mono .hic { background: var(--secondary-background-color, #282828); }
    .title { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tg { flex: none; display: flex; padding: 3px; border: 0; border-radius: 50%; background: none; cursor: pointer;
      color: inherit; }
    .tg:hover { background: rgba(127,127,127,.2); }
    .tg svg { width: 22px; height: 22px; fill: currentColor; }
    svg { display: block; width: 100%; height: auto; overflow: visible;
      font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, sans-serif)); }
    .bg { fill: var(--secondary-background-color, #282828); cursor: pointer; }
    .lbl { fill: var(--secondary-text-color); font-size: 11px; font-weight: 700; letter-spacing: .06em; }
    .val { fill: var(--primary-text-color); font-size: 26px; font-weight: 700; }
    .val.small { font-size: 20px; }
    .u { font-size: 13px; font-weight: 500; fill-opacity: .7; }
    .sub { fill: var(--secondary-text-color); font-size: 12px; }
    .sub.ong { fill: var(--primary-text-color); } /* compact view: brighter lines (readable over the graphs) */
    .th { fill: var(--secondary-text-color); font-size: 11px; }
    .tc { fill: var(--primary-text-color); font-size: 11px; font-variant-numeric: tabular-nums; }
    .ln { fill: none; stroke: var(--divider-color, rgba(127,127,127,.25)); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .la { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transition: opacity .4s; }
    .la.on { opacity: .35; }
    text { pointer-events: none; }
    /* halo in the box color: graph lines break around the texts, which stay readable over the graphs */
    .val, .sub, .th, .tc { paint-order: stroke; stroke: var(--secondary-background-color, #282828); stroke-width: 3px;
      stroke-linejoin: round; }
    /* footer: bar in the style of the header, equal parts split by vertical dividers (tap = more-info) */
    .ftr { display: flex; height: 34px; margin: 12px -12px -12px; background: var(--vefc-hdr); color: var(--vefc-hdr-text); }
    .ftr.stripe { background: none; color: var(--primary-text-color); box-shadow: inset 0 1px 0 var(--divider-color, rgba(127,127,127,.25)); }
    .chip { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 0 6px;
      border: 0; background: none; color: inherit; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
    .chip + .chip { background: linear-gradient(color-mix(in srgb, currentColor 45%, transparent),
      color-mix(in srgb, currentColor 45%, transparent)) left center / 1px 18px no-repeat; }
    .chip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chip:hover { background-color: rgba(127,127,127,.2); }
    .chip ha-icon { --mdc-icon-size: 16px; flex: none; }
    .chip ha-icon.tgl { --mdc-icon-size: 22px; }
    /* color_mode: mono — shades of the theme text color (flat gray header, plain footer, gray boxes and flows) */
    .hdr.mono { background: color-mix(in srgb, var(--primary-text-color) 12%, transparent); color: var(--primary-text-color);
      box-shadow: inset 0 -1px 0 var(--divider-color, rgba(127,127,127,.25)); }
    .ftr.mono { background: var(--secondary-background-color, #282828); color: var(--secondary-text-color); box-shadow: none; }
    .hl { fill: var(--divider-color, rgba(127,127,127,.25)); }
    .gr { pointer-events: none; }
    .gra { stroke: none; fill-opacity: .2; }
    .grl { fill: none; stroke-width: 1.5; stroke-opacity: .55; stroke-linejoin: round; }
    .gz { stroke: var(--secondary-text-color); stroke-opacity: .45; stroke-width: 1; stroke-dasharray: 3 3; }
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
        grid: { power: 'sensor.grid_net_power' },
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
        color_mode: cfg.color_mode === 'mono' || cfg.color_mode === 'accent' ? 'mono' : 'color',
        accent: cfg.color_mode === 'accent',
        dc_sources: src(cfg.dc_sources), ac_sources: src(cfg.ac_sources),
        consumers: list(cfg.loads.consumers).map((x) => (typeof x === 'string' ? { power: x } : x)).filter(Boolean),
        colors: Object.assign({}, COLORS, cfg.colors || {}),
      });
      const c = this._cfg;
      // accent: defaults on top of mono (each can be overridden)
      if (c.accent) {
        c.tint = Object.assign({}, ACCENT, cfg.tint || {});
        if (cfg.tint_style == null) c.tint_style = 'line';
        if (cfg.fill == null) c.fill = ['inverter'];
        if (cfg.fill_opacity == null) c.fill_opacity = 0.8;
      }
      // background graphs of today: graphs: [dc, ac, battery, loads, grid]
      // (PV = sum of the sources' power, battery = SoC 0-100 %, grid = import above / export below a zero line)
      const gl = list(c.graphs), pw = (arr) => arr.flatMap((x) => list(x.power));
      this._graphs = {};
      if (gl.includes('dc') && c.dc_sources.length) this._graphs.dc = { ents: pw(c.dc_sources), pct: false };
      if (gl.includes('ac') && c.ac_sources.length) this._graphs.ac = { ents: pw(c.ac_sources), pct: false };
      if (gl.includes('battery') && c.battery && c.battery.soc) this._graphs.battery = { ents: [c.battery.soc], pct: true };
      if (gl.includes('loads')) this._graphs.loads = { ents: list(c.loads.power), sign: c.loads.invert ? -1 : 1 };
      if (gl.includes('grid')) this._graphs.grid = { ents: list(c.grid.power), sign: c.grid.invert ? -1 : 1, bi: true };
      const ents = [...list(c.grid.power), ...list(c.loads.power), c.inverter.state, ...list(c.inverter.power),
        c.inverter.dc_power, c.inverter.mode];
      if (c.battery) ents.push(...list(c.battery.power), c.battery.soc, c.battery.voltage, c.battery.current, c.battery.state);
      [...c.dc_sources, ...c.ac_sources].forEach((s) => ents.push(...list(s.power), s.today, ...list(s.voltage), ...list(s.current)));
      list(c.loads.details).forEach((d) => ents.push(...list(d.power)));
      ents.push(c.loads.today);
      if (c.grid.balance) ents.push(c.grid.balance.import, c.grid.balance.export);
      if (c.loads.self_sufficiency) ents.push(c.loads.self_sufficiency.import);
      c.consumers.forEach((x) => ents.push(...list(x.power), x.today, ...list(x.extra).map((e) => e.entity),
        ...list(x.top && x.top.entities).map((e) => (typeof e === 'string' ? e : e && e.entity))));
      ['grid', 'inverter', 'loads', 'battery'].forEach((k) => c[k] && list(c[k].extra).forEach((x) => ents.push(x.entity)));
      // detailed view: phase values, PV strings, detail-only lines
      const more = (o) => {
        if (!o) return;
        if (o.alert) ents.push(o.alert.entity, o.alert.text_entity);
        ents.push(...list(o.voltage), ...list(o.current), ...list(o.phase_power), ...list(o.detail).map((x) => x && x.entity),
          ...list(o.header_extra).map((x) => x && x.entity));
        list(o.strings).forEach((s) => s && ents.push(...list(s.power), ...list(s.voltage), ...list(s.current)));
      };
      ['grid', 'inverter', 'loads', 'battery'].forEach((k) => more(c[k]));
      [...c.dc_sources, ...c.ac_sources, ...c.consumers].forEach(more);
      list(c.footer).forEach((x) => x && ents.push(x.entity));
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

    // color_mode: mono — no box / flow / graph colors, gray shades of the theme text color
    _mono() { return this._cfg.color_mode === 'mono'; }
    // fill of the box header element (bar: header bar, stripe: left stripe); mono: flat gray
    _hbFill(b) {
      if (b.alert) return ALERT;
      if (!this._mono()) return b.color;
      if (b.fill) return 'rgba(0,0,0,0.18)'; // filled box: header a shade darker than the box
      // tint_style: line — header without a fill (like tiles), the color only in the line under the title
      if (this._cfg.tint_style === 'line' && this._cfg.header_style === 'bar') return 'transparent';
      // tinted box: header bar in the tint (tint_header overrides it, e.g. amber for PV: dimmed yellow turns olive)
      if (b.tint && this._cfg.header_style === 'bar') return b.tintHdr || b.tint;
      if (b.tint && this._cfg.header_style !== 'bar') return b.tint;
      return this._cfg.header_style === 'bar' ? 'url(#vefc-hg)' : 'url(#vefc-st)';
    }

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
    // energy_decimals: decimals of today's kWh values (default 2)
    _ed() { const d = this._cfg.energy_decimals; return d === 0 || d ? Math.max(0, Math.min(3, +d)) : 2; }
    _W(v) { return `${this._f(Number.isNaN(v) ? v : Math.round(v))} W`; }
    _num0(v) { return Number.isNaN(v) ? '–' : this._f(Math.round(v)); }
    _phases(ids) { return list(ids).length > 1 ? list(ids).map((e) => this._num0(this._pw(e))).join(' · ') + ' W' : null; }
    _extra(x) {
      const s = this._so(x.entity);
      if (!s) return `${x.name || x.entity}: –`;
      let v;
      // value formatted by HA (translated states such as on -> On, display precision), unless a unit is given
      if (x.unit == null && this._hass.formatEntityState) { try { v = this._hass.formatEntityState(s); } catch (e) { v = undefined; } }
      if (v == null || v === '') {
        const u = x.unit != null ? x.unit : (s.attributes.unit_of_measurement || '');
        v = `${s.state}${u ? ' ' + u : ''}`;
      }
      return `${x.name ? x.name + ': ' : ''}${v}`;
    }
    // detail-only line: "name: value" (value formatted by HA: locale, display precision, translated states)
    _detailRow(x) {
      if (!x || !x.entity) return '';
      const s = this._so(x.entity);
      let v = '–';
      if (s) {
        if (x.unit != null) v = `${s.state}${x.unit ? ' ' + x.unit : ''}`;
        else {
          try { if (this._hass.formatEntityState) v = this._hass.formatEntityState(s) || '–'; } catch (err) { v = '–'; }
          if (v === '–') v = `${s.state}${s.attributes.unit_of_measurement ? ' ' + s.attributes.unit_of_measurement : ''}`;
        }
      }
      const name = x.name != null ? x.name : s && s.attributes.friendly_name;
      return name ? `${name}: ${v}` : v;
    }
    _detailRows(o) { return o ? list(o.detail).map((x) => this._detailRow(x)).filter(Boolean) : []; }

    // top: {entities: [{entity, name}], count: 5, min: 5} — the biggest measured loads now (detailed view), always
    // `count` lines (box height stays), then "Other" = the box power minus all measured loads
    _topRows(top, total) {
      if (!top || !list(top.entities).length) return [];
      const n = +top.count || 5, min = top.min != null ? +top.min : 5;
      const all = list(top.entities).map((e) => (typeof e === 'string' ? { entity: e } : e)).filter((e) => e && e.entity)
        .map((e) => {
          const so = this._so(e.entity);
          return { name: e.name || (so && so.attributes.friendly_name) || e.entity, p: this._pw(e.entity) };
        });
      const ok = all.filter((e) => !Number.isNaN(e.p));
      const shown = ok.filter((e) => e.p >= min).sort((a, b) => b.p - a.p).slice(0, n);
      const rows = shown.map((e) => `${e.name} ${this._W(e.p)}`);
      while (rows.length < n) rows.push('');
      const measured = ok.reduce((s, e) => s + Math.max(0, e.p), 0);
      if (!Number.isNaN(total)) rows.push(`${this._t.other} ${this._W(Math.max(0, total - measured))}`);
      return ['', ...rows]; // an empty line separates the list from the lines above
    }

    // detail table: rows [{label, v, a, p}] of entity ids; only configured columns (V, A, W)
    _table(rows, sign = 1) {
      const cols = ['v', 'a', 'p'].filter((k) => rows.some((r) => r[k]));
      if (!rows.length || !cols.length) return null;
      const fmt = (k, e) => {
        if (!e) return '–';
        if (k === 'p') return this._num0(this._pw(e) * sign);
        const v = this._num(e);
        return this._f(v, k === 'a' || Math.abs(v) < 100 ? 1 : 0);
      };
      return { head: cols.map((k) => ({ v: 'V', a: 'A', p: 'W' }[k])),
        rows: rows.map((r) => [r.label, ...cols.map((k) => fmt(k, r[k]))]) };
    }
    // phases L1..Ln from lists: phase_power (or power, if it is a list), voltage, current
    _phaseTable(o, sign = 1) {
      if (!o) return null;
      const P = list(o.phase_power).length ? list(o.phase_power) : list(o.power).length > 1 ? list(o.power) : [];
      const V = list(o.voltage), A = list(o.current);
      const n = Math.max(P.length, V.length, A.length);
      if (n < 2) return null;
      return this._table(Array.from({ length: n }, (_, i) => ({ label: `L${i + 1}`, v: V[i], a: A[i], p: P[i] })), sign);
    }
    // PV strings: [{name, voltage, current, power}]
    _stringTable(s) {
      const st = list(s.strings).filter(Boolean);
      return st.length ? this._table(st.map((x, i) => ({ label: x.name || `S${i + 1}`,
        v: list(x.voltage)[0], a: list(x.current)[0], p: list(x.power)[0] }))) : null;
    }

    // view: compact | detail; the toggle choice (localStorage) wins over `view`
    _getView() {
      const c = this._cfg;
      if (c.view_toggle !== false) {
        if (this._viewSet) return this._viewSet;
        try { const v = window.localStorage.getItem(LS_KEY); if (v === 'compact' || v === 'detail') return v; } catch (e) { /* no storage */ }
      }
      return c.view === 'detail' ? 'detail' : 'compact';
    }
    _setView(v) {
      this._viewSet = v;
      try { window.localStorage.setItem(LS_KEY, v); } catch (e) { /* no storage */ }
      this._render(true);
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
      const D = this._view === 'detail';
      const inv = (o) => (o && o.invert ? -1 : 1);
      const B = {}, F = {};
      const tap = (o, fallback) => (o && o.tap_entity) || fallback;
      // detailed view: phase table instead of the "L1 · L2 · L3 W" line
      const phases = (arr, o, sign = 1) => {
        const tb = D ? this._phaseTable(o, sign) : null;
        if (tb) { arr.push(tb); return; }
        const p = this._phases(o.power); if (p) arr.push(p);
      };

      // grid (+ = import)
      const grid = this._sum(c.grid.power) * inv(c.grid);
      const idleG = Number.isNaN(grid) || Math.abs(grid) < min;
      const gl = [Number.isNaN(grid) ? '–' : idleG ? t.idle : grid > 0 ? t.import : t.export];
      phases(gl, c.grid, inv(c.grid));
      list(c.grid.extra).forEach((x) => gl.push(this._extra(x)));
      if (D) gl.push(...this._detailRows(c.grid));
      // grid.balance: {import, export} (today's kWh) -> "Balance today ±x kWh" = export − import (detailed view)
      const bal = c.grid.balance;
      if (D && bal && bal.import && bal.export) {
        const b = this._num(bal.export) - this._num(bal.import);
        gl.push(`${bal.name || t.balance} ${Number.isNaN(b) ? '–' : (b > 0 ? '+' : '') + this._f(b, this._ed())} kWh`);
      }
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
          const today = s.today ? `${t.today} ${this._f(this._num(s.today), this._ed())} kWh` : '';
          if (D) {
            // detailed view: one value per line (Position: name, Voltage, Current, Today), then strings and detail rows
            const [v, a] = [list(s.voltage).length ? va({ voltage: s.voltage })[0] : '', list(s.current).length ? va({ current: s.current })[0] : ''];
            lines = [s.name ? `${t.position}: ${s.name}` : '', v ? `${t.voltage}: ${v}` : '', a ? `${t.current}: ${a}` : '', today]
              .filter(Boolean);
            const stb = this._stringTable(s); if (stb) lines.push(stb);
            lines.push(...this._detailRows(s));
          } else {
            lines = [[s.name, ...va(s)].filter(Boolean).join(' · '), today].filter(Boolean);
          }
        } else {
          lines = arr.flatMap((s) => {
            const p = this._sum(s.power); if (!Number.isNaN(p)) { tot += p; ok = true; }
            const today = s.today ? `${this._f(this._num(s.today), this._ed())} kWh` : '';
            const out = [`${s.name ? s.name + ' ' : ''}${this._W(p)}${today ? ' · ' + today : ''}`];
            if (D) { const stb = this._stringTable(s); if (stb) out.push(stb); out.push(...this._detailRows(s)); }
            return out;
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
      phases(ll, c.loads, inv(c.loads));
      const loadToday = c.loads.today ? this._num(c.loads.today) : NaN;
      if (c.loads.today) ll.push(`${t.today} ${this._f(loadToday, this._ed())} kWh`);
      list(c.loads.details).forEach((d) => ll.push(`${d.name || d.power} ${this._W(this._sum(d.power))}`));
      list(c.loads.extra).forEach((x) => ll.push(this._extra(x)));
      if (D) ll.push(...this._detailRows(c.loads));
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
        if (x.today || (!list(x.power).length && c.loads.today)) cl.push(`${t.today} ${this._f(today, this._ed())} kWh`);
        list(x.extra).forEach((e) => cl.push(this._extra(e)));
        if (D) {
          const tb = this._phaseTable(x); if (tb) cl.push(tb);
          cl.push(...this._detailRows(x));
          cl.push(...this._topRows(x.top, p));
        }
        const k = 'c' + j;
        B[k] = { label: x.name || `${t.loads} ${j + 1}`, color: x.color || C.loads, textColor: x.text_color, value: this._num0(p), unit: 'W',
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
        if (D) bl.push(...this._detailRows(b));
        const sc = Number.isNaN(soc) ? null : soc < 20 ? '#E5484D' : soc < 50 ? '#F7AB3E' : C.battery;
        B.battery = { label: b.name || t.battery, color: C.battery, value: this._num0(soc), unit: '%', valueColor: sc,
          lines: bl, e: tap(b, b.soc || list(b.power)[0]) };
      }

      // loads (detailed view): self_sufficiency: {import} -> today's share not from the grid (1 − import / loads.today)
      // (loads.sources: after the inverter, it needs the DC bus flow)
      if (D) {
        const ss = c.loads.self_sufficiency;
        if (ss && ss.import && c.loads.today) {
          const imp = this._num(ss.import);
          ll.push(`${t.selfsuff} ${loadToday > 0 && !Number.isNaN(imp) ? Math.round(Math.max(0, (1 - imp / loadToday) * 100)) + ' %' : '–'}`);
        }
      }

      // inverter / charger
      const i = c.inverter;
      const outIds = list(i.power);
      const out = outIds.length ? this._sum(outIds) : load - (Number.isNaN(acT) ? 0 : acT);
      const st = i.state ? this._stateText(i.state) : null;
      const il = [];
      if (outIds.length) il.push(`${t.output} ${this._W(out)}`);
      if (i.mode) il.push(String(this._stateText(i.mode) ?? '–'));
      if (D) {
        // output phases (power list + voltage / current) and the DC side
        const tb = this._phaseTable(i); if (tb) il.push(tb);
        if (i.dc_power) il.push(`DC ${this._W(this._pw(i.dc_power) * (i.invert_dc ? -1 : 1))}`);
      }
      list(i.extra).forEach((x) => il.push(this._extra(x)));
      if (D) il.push(...this._detailRows(i));
      B.inverter = { label: i.name || t.inverter, color: C.inverter, value: st != null ? esc(st) : this._num0(out),
        unit: st != null ? '' : 'W', lines: il, e: tap(i, i.state || outIds[0]) };
      F.out = out;
      // DC bus between inverter and battery: + = inverter charges the battery
      F.dcbus = i.dc_power ? this._pw(i.dc_power) * (i.invert_dc ? -1 : 1) : bat - (Number.isNaN(dcT) ? 0 : dcT);

      // loads.sources (detailed view): where the load comes from now. AC-coupled PV sits on AC-out next to the loads and
      // covers them first; the rest is the inverter output: from the DC side (MPPT first, then the battery) while the
      // inverter inverts (DC bus towards AC), from the grid (pass-through) while it charges; the grid share is at most
      // the measured import, the rest (inverter losses, meter mismatch) stays on the DC side
      if (D && c.loads.sources) {
        const z = (v) => (Number.isNaN(v) ? 0 : Math.max(0, v));
        const L0 = z(load), pvAC = Math.min(L0, z(acT)), R = L0 - pvAC;
        const db = F.dcbus;
        let fromDC = Number.isNaN(db) ? Math.max(0, R - z(grid)) : db > 0 ? 0 : Math.min(R, -db);
        const fromGrid = Math.min(R - fromDC, z(grid));
        fromDC = R - fromGrid;
        const mppt = Math.min(fromDC, z(dcT)), batP = fromDC - mppt, pvAll = pvAC + mppt;
        const sum = pvAll + batP + fromGrid;
        if (sum > 0) {
          const pc = (v) => Math.round(v / sum * 100);
          ll.push(`${t.src_pv} ${pc(pvAll)} % · ${t.src_bat} ${pc(batP)} % · ${t.src_grid} ${pc(fromGrid)} %`);
        } else ll.push('–');
      }
      // loads.peak (detailed view): today's highest 5-minute mean of the loads and when (from the graph data)
      if (D && c.loads.peak) {
        const d0 = dayStart(), sign = c.loads.invert ? -1 : 1;
        const es = list(c.loads.power).map((id) => GRAPH_CACHE.get(id)).filter((e) => e && e.day === d0);
        let best = NaN, bb = -1;
        if (es.length) {
          for (let b = 0; b < GRAPH_BINS; b++) {
            let v = 0, ok = false;
            es.forEach((e) => { if (!Number.isNaN(e.vals[b])) { v += e.vals[b]; ok = true; } });
            if (ok && (Number.isNaN(best) || v * sign > best)) { best = v * sign; bb = b; }
          }
        }
        if (bb < 0) ll.push(`${t.peak} –`);
        else {
          const tm = new Date(d0 + bb * BIN_MS).toLocaleTimeString(this._lang, { hour: '2-digit', minute: '2-digit' });
          const val = best >= 1000 ? `${this._f(best / 1000, 1)} kW` : this._W(best);
          ll.push(`${t.peak} ${val} · ${tm}`);
        }
      }

      // header_extra: values in the box header, right-aligned (e.g. tariff)
      const hx = (k, o) => { if (B[k] && o) B[k].hx = list(o.header_extra).filter(Boolean).map((x) => this._extra(x)).join(' · '); };
      ['grid', 'inverter', 'loads', 'battery'].forEach((k) => hx(k, c[k]));
      c.consumers.forEach((x, j) => hx('c' + j, x));
      // alert: header turns red while alert.entity is not in alert.ok (unknown / unavailable = no alert);
      // text = text_entity (formatted) or text or the formatted state of the entity
      const al = (k, o) => {
        const a = o && o.alert, so = a && this._so(a.entity);
        if (!B[k] || !so || ['unknown', 'unavailable'].includes(so.state)) return;
        if (list(a.ok).map(String).includes(String(so.state))) return;
        B[k].alert = a.text_entity ? this._extra({ entity: a.text_entity }) : a.text || this._extra({ entity: a.entity });
      };
      ['grid', 'inverter', 'loads', 'battery'].forEach((k) => al(k, c[k]));
      c.consumers.forEach((x, j) => al('c' + j, x));
      // mono: accent color per box: tint: {grid, inverter, loads, battery, dc, ac}, consumers: `tint`
      // (title, divider line and graph in the color; surfaces stay gray, dimmed colors would turn muddy)
      // grid: tint.import / tint.export follow the direction (idle: tint.grid), and color the graph above / below zero
      if (this._mono()) {
        const tn = c.tint || {};
        Object.keys(B).forEach((k) => {
          // consumers: their own tint; accent: else the loads color
          let col = B[k].cons ? c.consumers[+k.slice(1)].tint || (c.accent ? tn.loads : null) : tn[k];
          if (k === 'grid' && (tn.import || tn.export) && !idleG) col = (grid > 0 ? tn.import : tn.export) || col;
          if (col) B[k].tint = col;
          if (col && c.tint_header && c.tint_header[k]) B[k].tintHdr = c.tint_header[k];
        });
        // fill: [box, …] — the whole box in its tint color (e.g. the inverter as the center of the flow), white texts
        list(c.fill).forEach((k) => { if (B[k] && B[k].tint) B[k].fill = true; });
      }
      return { B, F };
    }

    // ---------------------------------------------------------------- layout
    // scale: native — the drawing is as wide as the card (1 unit = 1 px), so texts keep their CSS sizes
    // (11 / 26 / 12 px like other cards); box width follows the card width, gaps between columns stay
    _nativeLayout(P0) {
      const W = (this.clientWidth || this.getBoundingClientRect().width || 0) - 24 - 4; // ha-card padding, viewBox margin
      // portrait: narrower gap between the two columns (wider boxes, still room for the line and its dots)
      const n = P0.cols.length, hg = n === 2 ? 40 : P0.cols[1] - P0.bw;
      const bw = Math.floor((W - (n - 1) * hg) / n);
      if (bw < 110) return P0;
      return Object.assign({}, P0, { W, bw, cols: P0.cols.map((_, i) => i * (bw + hg)) });
    }

    _layout(mode, B) {
      const ck = Object.keys(B).filter((k) => B[k].cons);
      const P0 = mode === 'landscape' && ck.length ? LAYOUTS.landscape4 : LAYOUTS[mode];
      const P = this._cfg.scale === 'native' ? this._nativeLayout(P0) : P0;
      const pos = {};
      let y = 0;
      P.rows.forEach((row) => {
        const keys = row.filter((k) => B[k]);
        if (!keys.length) return;
        const h = Math.max(...keys.map((k) => boxH(B[k].lines)));
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
            const hc = Math.max(...rk.map((k) => boxH(B[k].lines)));
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
          const hc = boxH(B[k].lines);
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
      const C = this._cfg.colors, mono = this._mono(), bar = this._cfg.header_style === 'bar', tn = this._cfg.tint || {};
      // mono: flows in the theme text color; header bar 12 %, left stripe 20 % of it (paint servers, so the theme
      // variable works in the fill)
      const paint = (id, op) => `<linearGradient id="${id}"><stop offset="0" style="stop-color:var(--primary-text-color);stop-opacity:${op}"/></linearGradient>`;
      let defs = mono ? paint('vefc-hg', 0.12) + paint('vefc-st', 0.2) : '';
      let boxes = '', lines = '';
      this._flows = [];
      FLOWS.forEach(([a, b, k]) => {
        if (!L.pos[a] || !L.pos[b]) return;
        const p = this._path(L.pos[a], L.pos[b]);
        const col = mono ? 'var(--primary-text-color)' : { grid: C.grid, out: C.loads, ac: C.ac, dcbus: C.battery, dc: C.dc }[k];
        this._flows.push({ k, d: p.d, len: p.len, col });
        lines += `<path class="ln" d="${p.d}"/><path class="la" data-la="${k}" d="${p.d}" style="stroke:${esc(col)}"/><g data-dots="${k}"></g>`;
      });
      const ck = Object.keys(B).filter((k) => B[k].cons);
      const cp = this._consPaths(L, ck);
      ck.filter((k) => cp[k]).forEach((k) => {
        const p = cp[k];
        const col = mono ? 'var(--primary-text-color)' : B[k].color;
        this._flows.push({ k, d: p.d, len: p.len, col });
        lines += `<path class="ln" d="${p.d}"/><path class="la" data-la="${k}" d="${p.d}" style="stroke:${esc(col)}"/><g data-dots="${k}"></g>`;
      });
      Object.entries(L.pos).forEach(([k, p]) => {
        defs += `<clipPath id="c-${k}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12"/></clipPath>`;
        const hf = esc(this._hbFill(B[k]));
        boxes += `<g><rect class="bg" data-e="${esc(B[k].e || '')}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12"`
          // fill_opacity: tone the filled box down (the card background shows through)
          + `${B[k].fill ? ` style="fill:${esc(B[k].tint)};fill-opacity:${+this._cfg.fill_opacity || 1}"` : ''}/>`
          + (bar
            ? `<rect data-hb="${k}" x="${p.x}" y="${p.y}" width="${p.w}" height="${HDR_H}" fill="${hf}" clip-path="url(#c-${k})"/>`
            : `<rect data-hb="${k}" x="${p.x}" y="${p.y}" width="4" height="${p.h}" fill="${hf}" clip-path="url(#c-${k})"/>`)
          // mono + bar: divider under the header
          // (its color follows the tint in _render: the grid tint changes with the direction)
          + (mono && bar ? `<rect class="hl" data-hl="${k}" x="${p.x}" y="${p.y + HDR_H}" width="${p.w}" height="${this._cfg.tint_style === 'line' ? 2 : 1}"/>` : '')
          + (this._graphs[k] && this._graphsOn() ? this._graphEl(k, mono ? 'var(--secondary-text-color)' : B[k].color,
            mono ? (k === 'grid' && tn.import) || tn[k] || B[k].tint : null,
            mono && k === 'grid' ? tn.export || tn.grid : null) : '')
          + `<g data-box="${k}"></g></g>`;
      });
      // header: title (left) and the view toggle (right)
      const D = this._view === 'detail', hasTog = this._cfg.view_toggle !== false;
      const tog = hasTog ? `<button class="tg" title="${esc(D ? this._t.compact : this._t.detail)}" `
        + `aria-label="${esc(D ? this._t.compact : this._t.detail)}"><svg viewBox="0 0 24 24"><path d="${D ? ICON_LESS : ICON_MORE}"/></svg></button>` : '';
      // header text: colors.header_text, or white unless the bar is light
      const hc = this._cfg.colors.header;
      const ht = this._cfg.colors.header_text || onColor(hc, TEXT_L);
      const hdr = this._cfg.title || hasTog
        ? `<div class="hdr${bar ? '' : ' stripe'}${mono ? ' mono' : ''}${this._cfg.icon ? ' ic' : ''}" style="--vefc-hdr:${esc(hc)};--vefc-hdr-text:${esc(ht)}">`
          + (this._cfg.icon ? `<span class="hic"><ha-icon icon="${esc(this._cfg.icon)}"></ha-icon></span>` : '')
          + `<div class="title">${esc(this._cfg.title || '')}</div>${tog}</div>` : '';
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card>${hdr}`
        + `<svg viewBox="-2 -2 ${L.W + 4} ${L.H + 4}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${lines}${boxes}</svg>${this._footerEl()}</ha-card>`;
      if (hasTog) {
        this.shadowRoot.querySelector('.tg').addEventListener('click', () => this._setView(D ? 'compact' : 'detail'));
      }
      this.shadowRoot.querySelectorAll('.chip').forEach((el) => el.addEventListener('click', () => this.dispatchEvent(
        new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: el.dataset.ent } }))));
      this.shadowRoot.querySelector('svg').addEventListener('click', (ev) => {
        const r = ev.composedPath().find((x) => x && x.dataset && x.dataset.e);
        if (!r) return;
        this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: r.dataset.e } }));
      });
      this._flowQ = {};
    }

    // ---------------------------------------------------------------- footer
    _footer() { return list(this._cfg.footer).filter((x) => x && x.entity); }
    _footerEl() {
      const f = this._footer();
      if (!f.length) return '';
      const hc = this._cfg.colors.header, bar = this._cfg.header_style === 'bar';
      const ht = this._cfg.colors.header_text || onColor(hc, TEXT_L);
      return `<div class="ftr${bar ? '' : ' stripe'}${this._mono() ? ' mono' : ''}" style="--vefc-hdr:${esc(hc)};--vefc-hdr-text:${esc(ht)}">`
        + `${f.map((x, i) => `<button class="chip" data-ent="${esc(x.entity)}">`
        + `${x.icon ? `<ha-icon icon="${esc(x.icon)}"></ha-icon>` : this._isToggle(x) ? `<ha-icon class="tgl" data-fi="${i}"></ha-icon>` : ''}`
        + `<span data-ft="${i}"></span></button>`).join('')}</div>`;
    }
    // switch / input_boolean in the footer: a toggle icon showing the state, so the chip reads as an action
    // (tap opens more-info with the toggle — no direct switching by an accidental tap while scrolling)
    _isToggle(x) { return /^(switch|input_boolean)\./.test(x.entity || ''); }
    _renderFooter() {
      // on: the inverter accent (mono / accent); color mode: the footer text color (the bar itself is colored)
      const on = this._mono() ? (this._cfg.tint && this._cfg.tint.inverter) || 'var(--primary-text-color)' : 'currentColor';
      this._footer().forEach((x, i) => {
        const el = this.shadowRoot.querySelector(`[data-ft="${i}"]`);
        if (el) el.textContent = this._extra(x);
        const ic = this.shadowRoot.querySelector(`[data-fi="${i}"]`);
        if (ic) {
          const st = this._st(x.entity) === 'on';
          ic.setAttribute('icon', st ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off-outline');
          ic.style.color = st ? on : 'var(--secondary-text-color)';
        }
      });
    }

    // ---------------------------------------------------------------- graphs
    // line: accent color for the line only (mono tint: gray area, stronger colored line — a dimmed color area turns muddy)
    // line2: line color of the second series (grid: export below zero)
    _graphEl(k, color, line, line2) {
      const C = this._cfg.colors, g = this._graphs[k];
      const pair = (sfx, col, ln) => `<path class="gra" data-gra${sfx}="${k}" style="fill:${esc(col)}"/>`
        + `<path class="grl" data-grl${sfx}="${k}" style="stroke:${esc(ln || col)}${ln ? ';stroke-opacity:.9' : ''}"/>`;
      // colors.<box>_graph overrides the graph color (grid: both import and export); mono: one gray for all
      const gc = this._mono() ? color : C[k + '_graph'];
      // grid: faint dashed zero line between import (above) and export (below)
      return `<g class="gr" clip-path="url(#c-${k})">${g.bi ? pair('', gc || C.import, line) + pair('2', gc || C.export, line2 || line)
        + `<line class="gz" data-gz="${k}"/>` : pair('', gc || color, line)}</g>`;
    }
    _unitK(id) { return ((this._so(id) || {}).attributes || {}).unit_of_measurement === 'kW' ? 1000 : 1; }

    // live values into today's bins; reload history when missing, from yesterday or after a gap
    _graphTick() {
      const now = Date.now(), d0 = dayStart(), need = [];
      const bin = (t) => Math.min(GRAPH_BINS - 1, Math.floor((t - d0) / BIN_MS));
      Object.values(this._graphs).forEach((g) => g.ents.forEach((id) => {
        let e = GRAPH_CACHE.get(id);
        if (!e || e.day !== d0) {
          e = { day: d0, vals: new Float64Array(GRAPH_BINS).fill(NaN), last: 0, loading: false };
          GRAPH_CACHE.set(id, e);
        }
        if (e.loading) return;
        if (now - e.last > GRAPH_REFETCH) { if (!need.includes(id)) need.push(id); return; }
        const v = this._pw(id);
        if (Number.isNaN(v)) return;
        // the state holds until it changes: carry the last value over skipped bins, the current bin follows the state
        const b = bin(now), lb = e.last >= d0 ? bin(e.last) : -1;
        for (let i = lb + 1; i < b; i++) if (lb >= 0 && Number.isNaN(e.vals[i])) e.vals[i] = e.vals[lb];
        e.vals[b] = v;
        e.last = now;
      }));
      if (need.length) this._graphFetch(need, d0);
    }

    // today's 5-minute bins: recorder short-term statistics (5-minute means, small and fast); entities without
    // statistics (no state_class) fall back to the state history, time-weighted per bin
    async _graphFetch(ids, d0) {
      ids.forEach((id) => { GRAPH_CACHE.get(id).loading = true; });
      const start_time = new Date(d0).toISOString();
      let st = {}, hist = {};
      try {
        st = await this._hass.callWS({ type: 'recorder/statistics_during_period', start_time, statistic_ids: ids,
          period: '5minute', types: ['mean'], units: { power: 'W' } }) || {};
      } catch (err) { /* no statistics */ }
      const rest = ids.filter((id) => !(st[id] && st[id].length));
      if (rest.length) {
        try {
          hist = await this._hass.callWS({ type: 'history/history_during_period', start_time, entity_ids: rest,
            minimal_response: true, no_attributes: true, significant_changes_only: false }) || {};
        } catch (err) { /* no history: the graph is built from live values only */ }
      }
      const now = Date.now();
      ids.forEach((id) => {
        const e = GRAPH_CACHE.get(id);
        if (!e) return;
        e.loading = false;
        e.last = now;
        if (e.day !== d0) return;
        const vals = new Float64Array(GRAPH_BINS).fill(NaN);
        if (st[id] && st[id].length) {
          st[id].forEach((x) => {
            const t = typeof x.start === 'number' ? x.start : Date.parse(x.start);
            const b = Math.floor((t - d0) / BIN_MS);
            if (b >= 0 && b < GRAPH_BINS && Number.isFinite(x.mean)) vals[b] = x.mean;
          });
        } else {
          const k = this._unitK(id);
          const pts = (hist[id] || []).map((x) => [Math.max(d0, (x.lu || x.lc || 0) * 1000), parseFloat(x.s) * k]);
          const sum = new Float64Array(GRAPH_BINS), dur = new Float64Array(GRAPH_BINS);
          pts.forEach(([t, v], i) => {
            if (!Number.isFinite(v)) return;
            const t1 = i + 1 < pts.length ? pts[i + 1][0] : now;
            for (let a = t; a < t1;) {
              const b = Math.floor((a - d0) / BIN_MS);
              if (b >= GRAPH_BINS) break;
              const end = Math.min(t1, d0 + (b + 1) * BIN_MS);
              sum[b] += v * (end - a); dur[b] += end - a; a = end;
            }
          });
          for (let b = 0; b < GRAPH_BINS; b++) if (dur[b]) vals[b] = sum[b] / dur[b];
        }
        // statistics end with the last finished 5 minutes: carry the last value up to now, live values follow
        let lv = NaN;
        const cb = Math.min(GRAPH_BINS - 1, Math.floor((now - d0) / BIN_MS));
        for (let b = 0; b <= cb; b++) { if (Number.isNaN(vals[b])) vals[b] = lv; else lv = vals[b]; }
        const v = this._pw(id);
        if (!Number.isNaN(v)) vals[cb] = v;
        e.vals = vals;
      });
      this._render(true);
    }

    // graphs are drawn in the compact view only, unless graphs_view says otherwise
    _graphsOn() {
      const gv = this._cfg.graphs_view;
      return Object.keys(this._graphs).length > 0 && (gv === 'both' || this._view === (gv === 'detail' ? 'detail' : 'compact'));
    }

    // area + line from 00:00 to now, under the box header; power scaled to today's maximum, SoC to 0-100 %;
    // grid: zero line, import above (import color), export below (export color)
    _drawGraphs(L) {
      const root = this.shadowRoot, bar = this._cfg.header_style === 'bar', d0 = dayStart();
      const cur = Math.min(GRAPH_BINS - 1, Math.floor((Date.now() - d0) / BIN_MS));
      Object.entries(this._graphs).forEach(([k, g]) => {
        const p = L.pos[k];
        if (!p) return;
        const es = g.ents.map((id) => GRAPH_CACHE.get(id)).filter((e) => e && e.day === d0);
        const ser = [];
        let prev = NaN;
        for (let b = 0; b <= cur; b++) {
          let s = 0, ok = false;
          es.forEach((e) => { const v = e.vals[b]; if (!Number.isNaN(v)) { s += v; ok = true; } });
          prev = ok ? s * (g.sign || 1) : prev;
          ser.push(prev);
        }
        const valid = ser.filter((v) => !Number.isNaN(v));
        const top = p.y + (bar ? HDR_H : 0) + 4, bot = p.y + p.h, H = bot - top;
        const maxP = Math.max(0, ...valid), maxN = Math.max(0, ...valid.map((v) => -v));
        let k1, base;
        if (g.pct) { k1 = H / 100; base = bot; }
        else {
          // at least 100 W, so idle noise stays flat; 10 % headroom
          k1 = H / (Math.max(100, maxP + (g.bi ? maxN : 0)) * 1.1);
          base = g.bi ? bot - maxN * k1 : bot;
        }
        const X = (b) => (p.x + p.w * (b + 0.5) / GRAPH_BINS).toFixed(1);
        const Y = (v) => Math.max(top, Math.min(bot, base - v * k1)).toFixed(1);
        // power: no line where nothing flows (|value| < 1 W, e.g. PV at night, grid import while exporting) —
        // the line and the area are split into segments; SoC is drawn everywhere
        const draw = (sfx, f) => {
          const a = root.querySelector(`[data-gra${sfx}="${k}"]`), l = root.querySelector(`[data-grl${sfx}="${k}"]`);
          if (!a || !l) return;
          let line = '', area = '', seg = [];
          const flush = () => {
            if (!seg.length) return;
            const pts = seg.map(([b, y]) => `${X(b)},${y}`).join('L');
            line += `M${pts}`;
            area += `M${pts}L${X(seg[seg.length - 1][0])},${base.toFixed(1)}L${X(seg[0][0])},${base.toFixed(1)}Z`;
            seg = [];
          };
          ser.forEach((v, b) => {
            if (Number.isNaN(v) || (!g.pct && Math.abs(f(v)) < 1)) { flush(); return; }
            seg.push([b, Y(f(v))]);
          });
          flush();
          l.setAttribute('d', line);
          a.setAttribute('d', area);
        };
        if (g.bi) {
          draw('', (v) => Math.max(0, v)); draw('2', (v) => Math.min(0, v));
          const z = root.querySelector(`[data-gz="${k}"]`);
          if (z) ['x1', p.x, 'x2', p.x + p.w, 'y1', base.toFixed(1), 'y2', base.toFixed(1)]
            .forEach((v, i, a) => { if (i % 2 === 0) z.setAttribute(v, a[i + 1]); });
        }
        else draw('', (v) => v);
      });
    }

    _render(force) {
      if (!this._cfg || !this._hass) return;
      const mode = this._mode();
      this._view = this._getView();
      const sig = mode + '|' + this._view + '|' + this._ents.map((e) => this._st(e)).join('|') + '|' + this._lang;
      if (!force && sig === this._sig) return;
      this._sig = sig;
      const { B, F } = this._model();
      const L = this._layout(mode, B);
      const key = mode + '|' + this._view + '|' + L.W + '|' + Object.keys(B).map((k) => k + boxH(B[k].lines)).join(',');
      if (key !== this._key) { this._build(L, B); this._key = key; }
      const root = this.shadowRoot;

      // texts (bar: title in the header bar, content moved up a little)
      const bar = this._cfg.header_style === 'bar', mono = this._mono();
      const yL = bar ? 15 : 24, yV = bar ? 52 : 56, yS = bar ? 74 : 78;
      Object.entries(L.pos).forEach(([k, p]) => {
        const b = B[k], x = p.x + (bar ? 12 : 16), mx = p.w - (bar ? 22 : 26);
        const vc = b.valueColor && !mono ? ` style="fill:${b.valueColor}"` : '';
        const small = b.unit === '' && String(b.value).length > 10 ? ' small' : '';
        // box title color: configured (colors.<box>_text, consumer text_color), else white / dark by the header color;
        // mono: theme text color
        // mono: titles in the theme text color (the color is carried by the header wash, line and graph)
        const tc = mono ? (b.fill ? '#fff' : 'var(--primary-text-color)') : b.textColor || this._cfg.colors[k + '_text'];
        // filled box: white value and lines on the color
        const fv = b.fill ? ' style="fill:#fff;stroke:none"' : '', fs = b.fill ? ' style="fill:rgba(255,255,255,.85);stroke:none"' : '';
        const hb = root.querySelector(`[data-hb="${k}"]`);
        if (hb) {
          hb.setAttribute('fill', this._hbFill(b));
          // tinted header bar: a soft wash of the color (tint_header_opacity, default 0.2)
          if (mono && bar && b.tint && !b.fill && !b.alert && this._cfg.tint_style !== 'line') hb.setAttribute('fill-opacity', +this._cfg.tint_header_opacity || 0.2);
          else hb.removeAttribute('fill-opacity');
        }
        const hl = root.querySelector(`[data-hl="${k}"]`);
        if (hl) hl.style.fill = b.fill ? 'rgba(255,255,255,0.35)' : b.tint || '';
        const lc = b.alert && bar ? ' style="fill:#fff"' : bar || tc ? ` style="fill:${esc(tc || onColor(b.color, TEXT_L))}"` : '';
        let s = `<text class="lbl" data-lblk="${k}" x="${x}" y="${p.y + yL}"${lc} data-max="${mx}">${esc(b.label.toLocaleUpperCase(this._lang))}</text>`;
        // header_extra: right-aligned in the box header
        // header_extra (or the alert text, bold) right-aligned in the box header
        const hxt = b.alert || b.hx;
        if (hxt) s += `<text class="lbl" data-hxk="${k}" x="${p.x + p.w - (bar ? 10 : 12)}" y="${p.y + yL}" text-anchor="end"`
          + `${b.alert && !bar ? ` style="fill:${ALERT}"` : lc} font-weight="${b.alert ? 700 : 500}" letter-spacing="0">${esc(hxt)}</text>`;
        s += `<text class="val${small}" x="${x}" y="${p.y + yV}"${vc || fv} data-max="${mx}">${b.value}`
          + (b.unit ? `<tspan class="u" dx="4">${b.unit}</tspan>` : '') + '</text>';
        // compact view: brighter lines over the graphs; mono: secondary text like other cards (value white, lines gray)
        const ong = this._view === 'compact' && !mono ? ' ong' : '';
        let off = 0;
        b.lines.forEach((ln) => {
          const y = p.y + yS + off;
          off += itemH(ln);
          if (typeof ln === 'string') { s += `<text class="sub${ong}" x="${x}" y="${y}"${fs} data-max="${mx}">${esc(ln)}</text>`; return; }
          // table: units in the header, values right-aligned in columns after the row label
          const lw = 24, cx = (i) => (x + lw + (mx - lw) * (i + 1) / ln.head.length).toFixed(1);
          ln.head.forEach((h, i) => { s += `<text class="th" x="${cx(i)}" y="${y}"${fs} text-anchor="end">${esc(h)}</text>`; });
          ln.rows.forEach((r, j) => {
            const ry = y + TR * (j + 1);
            s += `<text class="th" x="${x}" y="${ry}"${fs}>${esc(r[0])}</text>`;
            r.slice(1).forEach((v, i) => { s += `<text class="tc" x="${cx(i)}" y="${ry}"${fv} text-anchor="end">${esc(v)}</text>`; });
          });
        });
        const g = root.querySelector(`[data-box="${k}"]`);
        if (g) g.innerHTML = s;
      });
      // box title next to a header_extra value: only the room left of the value
      root.querySelectorAll('text[data-hxk]').forEach((hx) => {
        const lbl = root.querySelector(`[data-lblk="${hx.dataset.hxk}"]`);
        try { if (lbl) lbl.dataset.max = Math.max(20, +lbl.dataset.max - hx.getComputedTextLength() - 8); } catch (e) { /* not rendered yet */ }
      });
      root.querySelectorAll('text[data-max]').forEach((el) => {
        const max = +el.dataset.max;
        try {
          if (el.getComputedTextLength() > max) { el.setAttribute('textLength', max); el.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
        } catch (e) { /* not rendered yet */ }
      });

      if (Object.keys(this._graphs).length) { this._graphTick(); if (this._graphsOn()) this._drawGraphs(L); }

      this._renderFooter();

      // animated flows (mono + tint: the color of the energy flowing, grid by direction)
      const tn = this._cfg.tint || {};
      const fcol = (f, p) => {
        if (!mono) return f.col;
        const m = { out: tn.loads, ac: tn.ac, dcbus: tn.battery, dc: tn.dc,
          grid: p > 0 ? tn.import || tn.grid : tn.export || tn.grid }[f.k] || (B[f.k] && B[f.k].tint);
        return m || f.col;
      };
      (this._flows || []).forEach((f) => {
        const p = F[f.k];
        const on = !Number.isNaN(p) && Math.abs(p) >= this._cfg.min_flow;
        const dur = on ? Math.round(Math.max(0.6, Math.min(4, 4.6 - Math.log10(Math.abs(p)))) * Math.sqrt(Math.max(f.len, 20) / 60) * 4) / 4 : 0;
        const col = fcol(f, p);
        const q = on ? (p > 0 ? '+' : '-') + dur + col : 'off';
        const la = root.querySelector(`[data-la="${f.k}"]`);
        la.classList.toggle('on', on);
        la.style.stroke = col;
        if (this._flowQ[f.k] === q) return;
        this._flowQ[f.k] = q;
        let s = '';
        if (on) {
          const n = Math.max(2, Math.round(f.len / 28));
          const kp = p > 0 ? '0;1' : '1;0';
          for (let j = 0; j < n; j++) {
            s += `<circle r="3.5" style="fill:${esc(col)}"><animateMotion dur="${dur}s" begin="-${(j * dur / n).toFixed(2)}s" `
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
