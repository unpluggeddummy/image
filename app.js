/* 외관 자료 메이커 — 데이터는 브라우저(IndexedDB)에 저장됩니다. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const h = (tag, cls, attrs) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (attrs) for (const k in attrs) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    return el;
  };

  /* ---------------- 저장소 ---------------- */
  const DB = {
    db: null, mem: new Map(),
    open() {
      return new Promise(res => {
        try {
          const r = indexedDB.open('appearance-sheet', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('chars', { keyPath: 'id' });
          r.onsuccess = () => { this.db = r.result; res(); };
          r.onerror = () => res();
        } catch (e) { res(); }
      });
    },
    req(mode, fn) {
      if (!this.db) return Promise.resolve(fn(null));
      return new Promise((res, rej) => {
        const st = this.db.transaction('chars', mode).objectStore('chars');
        const r = fn(st);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    all() { return this.db ? this.req('readonly', s => s.getAll()) : Promise.resolve([...this.mem.values()]); },
    put(c) { if (!this.db) { this.mem.set(c.id, c); return Promise.resolve(); } return this.req('readwrite', s => s.put(c)); },
    del(id) { if (!this.db) { this.mem.delete(id); return Promise.resolve(); } return this.req('readwrite', s => s.delete(id)); },
  };

  /* ---------------- 기본 데이터 ---------------- */
  const blankChar = () => ({
    id: uid(), created: Date.now(),
    name: '', profile: '', kwTitle: '', keywords: '',
    accent: '#2b2d33',
    images: { main: null, sub: null, chibi: null },
    colors: [
      { label: '머리', hex: '#26272b' },
      { label: '눈', hex: '#26272b' },
      { label: '피부', hex: '#fbf8f5' },
    ],
    colorNote: '',
    meta: [{ k: '', v: '' }],
    features: [''],
    notesTitle: '특이사항',
    notes: [''],
    details: [],
  });

  const sampleChar = () => Object.assign(blankChar(), {
    name: '최선의',
    profile: '20대 후반 / F / 160.1cm',
    kwTitle: 'KEYWORD — 미친 개',
    keywords: '아킬레우스 · 인셉션:설계사\n신을 거부한 신가물 · 오늘만 산다',
    colors: [
      { label: '머리', hex: '#0e0e10' },
      { label: '눈', hex: '#e9e35c' },
      { label: '피부', hex: '#fdf9f4' },
    ],
    colorNote: '※ 장신구는 실버 톤으로 통일',
    meta: [
      { k: '인상', v: '냉한 고양이상' },
      { k: '분위기', v: '양키, 늘 담배를 문 모습' },
      { k: '헤어 참고', v: '임관주' },
      { k: '분위기 참고', v: '네카 · 스킵비트! 모가미 쿄코' },
    ],
    features: [
      '새까만 긴 생머리 / 황금 올리브색 금안',
      '날카로운 눈매 / 풍성한 속눈썹',
      '부드러워 보이지만 강인하고 냉한 인상의 미인',
      '창백하게 투명한 흰 피부',
      '단단한 실전 압축 근육 / 작은 키에 좋은 비율',
    ],
    notes: [
      '앞머리 없음, 자연스럽게 떨어지는 옆머리',
      '머리 기장: 가슴뼈 아래 ~ 허리',
      '긴 다리와 잘록한 허리, 굴곡 있는 체형',
    ],
    details: [
      { id: uid(), title: '점', wide: false, text: '정면 기준 왼쪽 눈 아래 눈물점 두 개.\n픽크루에서는 밴드에 가려져 안 보이지만 형태는 사진 참고.', images: [null] },
      { id: uid(), title: '흉터', wide: false, text: '팔 전체에 흉터가 가득함.\n스스로 낸 자상, 건설 노동을 하며 생긴 자잘한 흉터와 화상 자국.', images: [null] },
      { id: uid(), title: '반지', wide: true, text: '오른손 중지 1번 · 오른손 엄지 2번 · 왼손 약지 3번 (사진 순서대로)', images: [null, null, null] },
      { id: uid(), title: '피어싱', wide: true, text: '양쪽 귀 피어싱, 실버 톤.', images: [null, null] },
    ],
  });

  const PRESETS = [
    ['흉터', ''], ['점', ''], ['장신구', ''], ['반지', ''], ['피어싱', ''],
    ['문신', ''], ['분위기', ''], ['참고 사진', ''], ['직접 입력', ''],
  ];

  /* ---------------- 상태 ---------------- */
  let chars = [];
  let cur = null;
  const sheet = $('#sheet');
  const imgInput = $('#imgInput');
  const colorInput = $('#colorInput');

  let saveTimer = null;
  const touch = () => {
    clearTimeout(saveTimer);
    const c = cur;
    saveTimer = setTimeout(() => DB.put(c).catch(e => toast('저장 실패: ' + e.message)), 350);
  };

  const toast = (msg) => {
    let t = $('.toast');
    if (!t) { t = h('div', 'toast'); document.body.append(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
  };

  /* ---------------- 글자칸 ---------------- */
  const SUPPORTS_PLAIN = (() => { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; })();

  function readText(el) {
    let t = el.innerText.replace(/ /g, ' ');
    if (t.endsWith('\n') && !t.endsWith('\n\n')) t = t.slice(0, -1);
    return t.trim() === '' ? '' : t;
  }

  /**
   * opts: { multi: 여러 줄 허용, onEnter: Enter 처리, onBackEmpty: 빈 칸 Backspace 처리 }
   */
  function editable(tag, cls, key, ph, get, set, opts = {}) {
    const el = h(tag, cls, { 'data-key': key, 'data-ph': ph, spellcheck: 'false' });
    el.contentEditable = SUPPORTS_PLAIN ? 'plaintext-only' : 'true';
    el.textContent = get() || '';
    el.addEventListener('input', () => { set(readText(el)); touch(); if (opts.onInput) opts.onInput(); });
    el.addEventListener('blur', () => { if (readText(el) === '') el.textContent = ''; });
    el.addEventListener('paste', e => {
      e.preventDefault();
      let t = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!opts.multi) t = t.replace(/\s*\n\s*/g, ' ');
      document.execCommand('insertText', false, t);
    });
    el.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        if (opts.onEnter) { e.preventDefault(); opts.onEnter(); return; }
        if (!opts.multi) { e.preventDefault(); el.blur(); }
      }
      if (e.key === 'Enter' && e.shiftKey && !opts.multi && !opts.onEnter) e.preventDefault();
      if (e.key === 'Backspace' && opts.onBackEmpty && readText(el) === '') {
        e.preventDefault(); opts.onBackEmpty();
      }
    });
    return el;
  }

  function focusKey(key, atEnd = true) {
    requestAnimationFrame(() => {
      const el = sheet.querySelector(`[data-key="${key}"]`);
      if (!el) return;
      el.focus();
      if (atEnd) {
        const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
    });
  }

  /* ---------------- 사진 ---------------- */
  function loadImageFile(file) {
    return new Promise((res, rej) => {
      if (!file || !file.type.startsWith('image/')) return rej(new Error('이미지 파일이 아니에요'));
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1800;
          let w = img.naturalWidth, hgt = img.naturalHeight;
          const k = Math.min(1, MAX / Math.max(w, hgt));
          w = Math.round(w * k); hgt = Math.round(hgt * k);
          const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
          cv.getContext('2d').drawImage(img, 0, 0, w, hgt);
          const keepAlpha = /png|webp|gif/.test(file.type);
          const src = keepAlpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9);
          res({ src, w, h: hgt, x: 50, y: 50, z: 1 });
        };
        img.onerror = () => rej(new Error('이미지를 읽지 못했어요'));
        img.src = fr.result;
      };
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
  }

  function pickImage() {
    return new Promise(res => {
      imgInput.value = '';
      imgInput.onchange = () => res(imgInput.files[0] || null);
      imgInput.click();
    });
  }

  function applyImg(el) {
    const im = el._get();
    if (!im) { el.style.backgroundImage = ''; return; }
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    const base = el._fit === 'contain' ? Math.min(W / im.w, H / im.h) : Math.max(W / im.w, H / im.h);
    const s = base * im.z;
    el.style.backgroundImage = `url("${im.src}")`;
    el.style.backgroundSize = `${im.w * s}px ${im.h * s}px`;
    el.style.backgroundPosition = `${im.x}% ${im.y}%`;
  }
  const layoutImages = () => sheet.querySelectorAll('.slot').forEach(applyImg);

  /**
   * 사진칸. fit: 'cover'(꽉 채우기) | 'contain'(전체 보이기)
   */
  function slot(cls, label, get, set, fit = 'cover') {
    const el = h('div', 'slot ' + cls);
    el._get = get; el._fit = fit;
    const im = get();

    const setFile = async (file) => {
      try { set(await loadImageFile(file)); touch(); render(); }
      catch (e) { toast(e.message); }
    };

    if (!im) {
      el.classList.add('empty');
      el.append(h('div', 'ph', { text: '+ ' + label }));
      el.addEventListener('click', async () => { const f = await pickImage(); if (f) setFile(f); });
    } else {
      el.classList.add('has');
      if (fit === 'contain') el.classList.add('transparent');
      const tools = h('div', 'tools ctl');
      const zoom = (f) => {
        const min = fit === 'contain' ? 0.4 : 1;
        im.z = Math.max(min, Math.min(5, +(im.z * f).toFixed(3)));
        applyImg(el); touch();
      };
      tools.append(
        h('button', '', { text: '－', title: '축소', onclick: e => { e.stopPropagation(); zoom(1 / 1.12); } }),
        h('button', '', { text: '＋', title: '확대', onclick: e => { e.stopPropagation(); zoom(1.12); } }),
        h('button', '', { text: '맞춤', title: '위치·크기 초기화', onclick: e => { e.stopPropagation(); im.x = 50; im.y = 50; im.z = 1; applyImg(el); touch(); } }),
        h('button', '', { text: '교체', onclick: async e => { e.stopPropagation(); const f = await pickImage(); if (f) setFile(f); } }),
        h('button', '', { text: '✕', title: '사진 지우기', onclick: e => { e.stopPropagation(); set(null); touch(); render(); } }),
      );
      tools.addEventListener('pointerdown', e => e.stopPropagation());
      el.append(tools);

      // 드래그로 위치 이동
      let drag = null;
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const W = el.clientWidth, H = el.clientHeight;
        const base = fit === 'contain' ? Math.min(W / im.w, H / im.h) : Math.max(W / im.w, H / im.h);
        const iw = im.w * base * im.z, ih = im.h * base * im.z;
        drag = { sx: e.clientX, sy: e.clientY, x: im.x, y: im.y, dW: W - iw, dH: H - ih };
        el.setPointerCapture(e.pointerId); el.classList.add('dragging');
      });
      el.addEventListener('pointermove', e => {
        if (!drag) return;
        const clamp = v => Math.max(0, Math.min(100, v));
        if (Math.abs(drag.dW) > 1) im.x = clamp(drag.x + (e.clientX - drag.sx) / drag.dW * 100);
        if (Math.abs(drag.dH) > 1) im.y = clamp(drag.y + (e.clientY - drag.sy) / drag.dH * 100);
        applyImg(el);
      });
      const end = () => { if (drag) { drag = null; el.classList.remove('dragging'); touch(); } };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }

    // 파일 끌어다 놓기
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('over');
      const f = e.dataTransfer.files[0]; if (f) setFile(f);
    });
    return el;
  }

  /* ---------------- 목록 (특징 / 특이사항) ---------------- */
  function list(arr, keyBase, ph, marker) {
    const wrap = h('div', 'list');
    arr.forEach((_, i) => {
      const li = h('div', 'li');
      li.append(h('span', marker === 'num' ? 'num' : 'dash', { text: marker === 'num' ? `(${i + 1})` : '-' }));
      li.append(editable('div', 'txt', `${keyBase}.${i}`, ph, () => arr[i], v => { arr[i] = v; }, {
        onEnter: () => { arr.splice(i + 1, 0, ''); touch(); render(); focusKey(`${keyBase}.${i + 1}`); },
        onBackEmpty: () => {
          if (arr.length <= 1) return;
          arr.splice(i, 1); touch(); render(); focusKey(`${keyBase}.${Math.max(0, i - 1)}`);
        },
      }));
      if (arr.length > 1) li.append(h('button', 'del ctl', { text: '✕', title: '줄 삭제', onclick: () => { arr.splice(i, 1); touch(); render(); } }));
      wrap.append(li);
    });
    wrap.append(h('button', 'add ctl', { text: '+ 줄 추가', onclick: () => { arr.push(''); touch(); render(); focusKey(`${keyBase}.${arr.length - 1}`); } }));
    return wrap;
  }

  /* ---------------- 시트 그리기 ---------------- */
  const textColorFor = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1c1c1f' : '#ffffff';
  };

  function render() {
    const c = cur;
    if (!c) return;
    document.documentElement.style.setProperty('--accent', c.accent);
    $('#accent').value = c.accent;
    document.title = (c.name || '새 캐릭터') + ' · 외관 자료';
    sheet.innerHTML = '';

    /* 상단 */
    const top = h('div', 'top');
    top.append(slot('main', '메인 이미지', () => c.images.main, v => { c.images.main = v; }));

    const right = h('div', 'right');
    if (!('sub2' in c.images)) c.images.sub2 = null;
    const subs = h('div', 'subs');
    ['sub', 'sub2'].forEach((key, n) => {
      const f = h('div', 'sub-frame');
      f.dataset.key = key;
      f.append(slot('sub', `서브 이미지 ${n + 1}`, () => c.images[key], v => { c.images[key] = v; }));
      subs.append(f);
    });
    right.append(subs);

    const sw = h('div', 'swatches');
    c.colors.forEach((col, i) => {
      const s = h('div', 'swatch');
      s.style.background = col.hex;
      s.style.color = textColorFor(col.hex);
      s.append(h('span', 'hex', { text: col.hex.toUpperCase() }));
      const lbl = editable('span', 'lbl', `color.${i}`, '이름', () => col.label, v => { col.label = v; });
      lbl.addEventListener('click', e => e.stopPropagation());
      s.append(lbl);
      s.append(h('button', 'del ctl', { text: '✕', title: '색 삭제', onclick: e => { e.stopPropagation(); c.colors.splice(i, 1); touch(); render(); } }));
      s.addEventListener('click', () => {
        colorInput.value = col.hex;
        colorInput.oninput = () => {
          col.hex = colorInput.value;
          s.style.background = col.hex; s.style.color = textColorFor(col.hex);
          s.querySelector('.hex').textContent = col.hex.toUpperCase();
          touch();
        };
        colorInput.click();
      });
      sw.append(s);
    });
    sw.append(h('button', 'swatch-add ctl', { text: '+', title: '색 추가', onclick: () => { c.colors.push({ label: '', hex: '#cccccc' }); touch(); render(); focusKey(`color.${c.colors.length - 1}`); } }));
    right.append(sw);
    right.append(editable('div', 'color-note', 'colorNote', '※ 색상 메모 (예: 색상에 민감하지 않음)', () => c.colorNote, v => { c.colorNote = v; }));
    top.append(right);
    sheet.append(top);

    /* 중단 */
    const mid = h('div', 'mid');
    const left = h('div', 'left-col');
    left.append(slot('chibi', '꼬마 / 픽크루', () => c.images.chibi, v => { c.images.chibi = v; }, 'contain'));
    const meta = h('div', 'meta');
    c.meta.forEach((m, i) => {
      const row = h('div', 'meta-row');
      row.append(editable('span', 'k', `meta.${i}.k`, '항목', () => m.k, v => { m.k = v; }, { onEnter: () => focusKey(`meta.${i}.v`) }));
      row.append(editable('span', 'v', `meta.${i}.v`, '내용', () => m.v, v => { m.v = v; }, {
        onEnter: () => { c.meta.splice(i + 1, 0, { k: '', v: '' }); touch(); render(); focusKey(`meta.${i + 1}.k`); },
      }));
      row.append(h('button', 'del ctl', { text: '✕', onclick: () => { c.meta.splice(i, 1); touch(); render(); } }));
      meta.append(row);
    });
    meta.append(h('button', 'add ctl', { text: '+ 항목 추가', onclick: () => { c.meta.push({ k: '', v: '' }); touch(); render(); focusKey(`meta.${c.meta.length - 1}.k`); } }));
    left.append(meta);
    mid.append(left);

    const body = h('div', 'body');
    const head = h('div', 'head');
    const nameBox = h('div', 'name-box');
    nameBox.append(editable('div', 'name', 'name', '이름', () => c.name, v => { c.name = v; }, { onInput: renderList }));
    nameBox.append(editable('div', 'profile', 'profile', '나이 / 성별 / 키 몸무게', () => c.profile, v => { c.profile = v; }));
    const kw = h('div', 'kw');
    kw.append(editable('div', 'kw-title', 'kwTitle', 'KEYWORD — 대표 키워드', () => c.kwTitle, v => { c.kwTitle = v; }));
    kw.append(editable('div', 'kw-body', 'keywords', '키워드 (Shift+Enter 줄바꿈)', () => c.keywords, v => { c.keywords = v; }, { multi: true }));
    head.append(nameBox, kw);
    body.append(head);

    const cols = h('div', 'cols');
    const feat = h('div', 'features');
    feat.append(list(c.features, 'features', '외형 특징 (예: 웨이브 진 검은 머리 / 검은 눈)', 'num'));
    const notes = h('div', 'notes');
    notes.append(editable('div', 'notes-title', 'notesTitle', '특이사항', () => c.notesTitle, v => { c.notesTitle = v; }));
    notes.append(list(c.notes, 'notes', '특이사항', 'dash'));
    cols.append(feat, notes);
    body.append(cols);
    mid.append(body);
    sheet.append(mid);

    /* 하단 블록 */
    const det = h('div', 'details' + (c.details.length ? '' : ' none'));
    c.details.forEach((d, i) => det.append(card(c, d, i)));
    const adders = h('div', 'adders ctl');
    adders.append(h('span', '', { text: '블록 추가' }));
    PRESETS.forEach(([title]) => {
      adders.append(h('button', 'add', {
        text: '+ ' + title,
        onclick: () => {
          const nd = { id: uid(), title: title === '직접 입력' ? '' : title, wide: title === '참고 사진', text: '', images: title === '분위기' ? [] : [null] };
          c.details.push(nd); touch(); render();
          focusKey(nd.title ? `det.${nd.id}.text` : `det.${nd.id}.title`);
        },
      }));
    });
    det.append(adders);
    sheet.append(det);

    requestAnimationFrame(layoutImages);
  }

  function card(c, d, i) {
    const el = h('div', 'card' + (d.wide ? ' wide' : ''));
    const head = h('div', 'card-head');
    head.append(h('span', 'bar'));
    head.append(editable('div', 'card-title', `det.${d.id}.title`, '제목', () => d.title, v => { d.title = v; }, { onEnter: () => focusKey(`det.${d.id}.text`) }));
    const tools = h('div', 'card-tools ctl');
    const move = (dir) => {
      const j = i + dir; if (j < 0 || j >= c.details.length) return;
      [c.details[i], c.details[j]] = [c.details[j], c.details[i]]; touch(); render();
    };
    tools.append(
      h('button', '', { text: '↑', title: '위로', onclick: () => move(-1) }),
      h('button', '', { text: '↓', title: '아래로', onclick: () => move(1) }),
      h('button', '', { text: d.wide ? '반칸' : '넓게', onclick: () => { d.wide = !d.wide; touch(); render(); } }),
      h('button', 'x', { text: '삭제', onclick: () => { if (d.text || d.images.some(Boolean)) { if (!confirm(`'${d.title || '이 블록'}' 블록을 지울까요?`)) return; } c.details.splice(i, 1); touch(); render(); } }),
    );
    head.append(tools);
    el.append(head);

    if (d.images.length) {
      const grid = h('div', 'card-imgs');
      const perRow = d.wide ? Math.min(Math.max(d.images.length, 3), 5) : Math.min(Math.max(d.images.length, 2), 3);
      grid.style.gridTemplateColumns = `repeat(${perRow}, 1fr)`;
      d.images.forEach((im, k) => {
        const w = h('div', 'imgwrap');
        w.append(slot('', '사진', () => d.images[k], v => { d.images[k] = v; }));
        w.append(h('button', 'del ctl', { text: '✕', title: '사진칸 삭제', onclick: () => { d.images.splice(k, 1); touch(); render(); } }));
        grid.append(w);
      });
      el.append(grid);
    }
    el.append(editable('div', 'card-text', `det.${d.id}.text`, '설명 (Enter로 줄바꿈)', () => d.text, v => { d.text = v; }, { multi: true }));
    el.append(h('button', 'add ctl', { text: '+ 사진칸', onclick: () => { d.images.push(null); touch(); render(); } }));
    return el;
  }

  /* ---------------- 캐릭터 목록 ---------------- */
  function renderList() {
    const box = $('#charList');
    box.innerHTML = '';
    chars.forEach(ch => {
      box.append(h('button', ch === cur ? 'on' : '', {
        text: ch.name || '(이름 없음)',
        onclick: () => select(ch),
      }));
    });
  }

  function select(ch) { cur = ch; try { localStorage.setItem('lastChar', ch.id); } catch (e) {} render(); renderList(); }

  $('#btnNew').onclick = async () => { const c = blankChar(); chars.push(c); await DB.put(c); select(c); focusKey('name'); };
  $('#btnDup').onclick = async () => {
    const c = JSON.parse(JSON.stringify(cur));
    c.id = uid(); c.created = Date.now(); c.name = (c.name || '') + ' 사본';
    c.details.forEach(d => { d.id = uid(); });
    chars.push(c); await DB.put(c); select(c);
  };
  $('#btnDel').onclick = async () => {
    if (!confirm(`'${cur.name || '이름 없음'}' 캐릭터를 지울까요? 되돌릴 수 없어요.`)) return;
    await DB.del(cur.id);
    chars = chars.filter(c => c !== cur);
    if (!chars.length) { const c = blankChar(); chars.push(c); await DB.put(c); }
    select(chars[0]);
  };

  $('#accent').addEventListener('input', e => {
    cur.accent = e.target.value;
    document.documentElement.style.setProperty('--accent', cur.accent);
    touch();
  });

  $('#preview').addEventListener('change', e => {
    if (e.target.checked) cleanOn(); else cleanOff();
  });

  /* ---------------- 내보내기 ---------------- */
  // 빈 칸을 숨기고 번호를 다시 매김
  function cleanOn() {
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    sheet.querySelectorAll('[contenteditable]').forEach(el => { if (readText(el) === '') el.textContent = ''; });
    sheet.classList.add('clean');

    const hide = el => el.classList.add('x-hide');
    sheet.querySelectorAll('.list').forEach(l => {
      let n = 0;
      l.querySelectorAll('.li').forEach(li => {
        if (readText(li.querySelector('.txt')) === '') hide(li);
        else { const num = li.querySelector('.num'); n++; if (num) { num.dataset.orig = num.textContent; num.textContent = `(${n})`; } }
      });
    });
    sheet.querySelectorAll('.meta-row').forEach(r => {
      if (!readText(r.querySelector('.k')) && !readText(r.querySelector('.v'))) hide(r);
    });
    const notes = sheet.querySelector('.notes');
    if (notes && cur.notes.every(t => !t)) hide(notes);
    const subs = sheet.querySelector('.subs');
    if (subs) {
      let filled = 0;
      subs.querySelectorAll('.sub-frame').forEach(f => { if (cur.images[f.dataset.key]) filled++; else hide(f); });
      if (!filled) hide(subs);
      if (filled === 1) subs.classList.add('single');
    }
    sheet.querySelectorAll('.card').forEach((el, i) => {
      const d = cur.details[i];
      if (!d) return;
      if (!d.title && !d.text && !d.images.some(Boolean)) hide(el);
      const grid = el.querySelector('.card-imgs');
      if (grid && !d.images.some(Boolean)) hide(grid);
      if (grid) {
        const n = d.images.filter(Boolean).length;
        const per = d.wide ? Math.min(Math.max(n, 3), 5) : Math.min(Math.max(n, 2), 3);
        grid.dataset.orig = grid.style.gridTemplateColumns;
        grid.style.gridTemplateColumns = `repeat(${per}, 1fr)`;
        grid.querySelectorAll('.imgwrap').forEach(w => { if (w.querySelector('.slot.empty')) hide(w); });
      }
    });
    const det = sheet.querySelector('.details');
    if (det && !cur.details.some(d => d.title || d.text || d.images.some(Boolean))) hide(det);
    layoutImages();
  }

  function cleanOff() {
    sheet.classList.remove('clean');
    sheet.querySelectorAll('.x-hide').forEach(el => el.classList.remove('x-hide'));
    sheet.querySelectorAll('.subs.single').forEach(el => el.classList.remove('single'));
    sheet.querySelectorAll('.num[data-orig]').forEach(n => { n.textContent = n.dataset.orig; delete n.dataset.orig; });
    sheet.querySelectorAll('.card-imgs[data-orig]').forEach(g => { g.style.gridTemplateColumns = g.dataset.orig; delete g.dataset.orig; });
    layoutImages();
  }

  const download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const safeName = s => (s || '캐릭터').replace(/[\\/:*?"<>|]/g, '_');

  $('#btnPng').onclick = async () => {
    if (typeof html2canvas !== 'function') return toast('html2canvas.min.js 파일이 같은 폴더에 있는지 확인해 주세요');
    const btn = $('#btnPng'); btn.disabled = true; btn.textContent = '만드는 중…';
    const wasPreview = $('#preview').checked;
    if (!wasPreview) cleanOn();
    try {
      await document.fonts.ready;
      const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      await new Promise(res => canvas.toBlob(b => { download(b, `${safeName(cur.name)}_외관자료.png`); res(); }, 'image/png'));
      toast('PNG를 저장했어요');
    } catch (e) {
      console.error(e); toast('PNG 저장 실패: ' + e.message);
    } finally {
      if (!wasPreview) cleanOff();
      btn.disabled = false; btn.textContent = 'PNG로 저장';
    }
  };

  $('#btnBackup').onclick = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const blob = new Blob([JSON.stringify({ app: 'appearance-sheet', version: 1, chars }, null, 0)], { type: 'application/json' });
    download(blob, `외관자료_백업_${stamp}.json`);
  };
  $('#btnRestore').onclick = () => { $('#restoreInput').value = ''; $('#restoreInput').click(); };
  $('#restoreInput').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : (data.chars || [data]);
      let n = 0;
      for (const c of list) {
        if (!c || typeof c !== 'object' || !c.images) continue;
        const base = blankChar();
        const merged = Object.assign(base, c);
        const i = chars.findIndex(x => x.id === merged.id);
        if (i >= 0) chars[i] = merged; else chars.push(merged);
        await DB.put(merged); n++;
      }
      chars.sort((a, b) => a.created - b.created);
      toast(`${n}명을 불러왔어요`);
      if (n) select(chars[chars.length - 1]);
    } catch (err) { toast('불러오기 실패: ' + err.message); }
  };

  window.addEventListener('resize', layoutImages);

  /* ---------------- 시작 ---------------- */
  (async () => {
    await DB.open();
    if (!DB.db) toast('브라우저 저장소를 쓸 수 없어 새로고침하면 사라져요. 백업을 꼭 해 주세요.');
    chars = (await DB.all()).sort((a, b) => a.created - b.created);
    if (!chars.length) {
      const s = sampleChar(); const b = blankChar();
      b.created = s.created + 1;
      chars = [s, b];
      await DB.put(s); await DB.put(b);
    }
    let last = null; try { last = localStorage.getItem('lastChar'); } catch (e) {}
    select(chars.find(c => c.id === last) || chars[0]);
    if (document.fonts) document.fonts.ready.then(layoutImages);
  })();
})();
