/* Story-derived inspiration overlay. Never owns AI progress or the central math curve. */
(function (root) {
  'use strict';
  const ignored = new Set('一個 一些 這個 那個 這些 那些 然後 接著 最後 開始 結束 以及 並且 或是 可以 需要 使用 透過 進行 正在 畫面 鏡頭 故事 影片 分鏡 角色 情緒 光影 主題 描述 整個 其中 自己 我們 他們 她們 他 她 它 的 了 和 與 在 是 有 將 把 讓 為 到 從 向 再 並 第 the and with from into then this that for are was shot scene'.split(' '));
  for (const word of '人的 直接 其他 進行 希望 想要 想 想拍 拍攝 比較 不要 不是 不用 避免 選擇 確認 決定 調整 已經 希望 可能 這樣 那樣 因為 所以 但是 不過 還有 一起 主要 方式 內容 呈現 提供 說明 感覺 適合 進入 完成 實際 使用者 觀眾 需求 企劃 的人 讓人 這裡 那裡 廣告 介紹 產品 方向 視角 形式 創作 敘事 建議 比例 時長'.split(' ')) ignored.add(word);
  function extract(source) {
    let segments;
    if (typeof Intl.Segmenter === 'function') {
      const parts = [...new Intl.Segmenter('zh-Hant', { granularity: 'word' }).segment(source)];
      segments = parts.filter(part => part.isWordLike).map(part => part.segment);
      // ICU dictionaries can split nouns such as 窗邊 or 咖啡師 into single characters.
      // Join only adjacent source words, preserving the user's exact wording.
      parts.forEach((part, i) => {
        const previous = parts[i - 1];
        if (previous?.isWordLike && part.isWordLike && previous.index + previous.segment.length === part.index &&
            (previous.segment.length === 1 || part.segment.length === 1) &&
            /^[\u3400-\u9fff]+$/.test(previous.segment + part.segment) &&
            !ignored.has(previous.segment) && !ignored.has(part.segment) &&
            /[師店邊杯壺桌椅窗門手光水花]$/.test(previous.segment + part.segment)) segments.push(previous.segment + part.segment);
      });
    } else segments = source.match(/[\u3400-\u9fff]{2,10}|[a-z][a-z'-]{2,}/gi) || [];
    return segments.filter(word => word.length >= 2 && word.length <= 12 && /[\p{L}]/u.test(word) && !ignored.has(word.toLowerCase()) && !/[的了是這那]$/.test(word) && !/不要|避免|進行|直接/.test(word));
  }
  function keywords(story, storyboard, brief) {
    const b = brief?.confirmed || {}, blocked = new Set((b.avoid || []).flatMap(extract));
    const answerText = (brief?.answers || []).flatMap(a => [...(a.values || []).map(v => v.label), a.other || '']).join('。');
    const sources = [extract([b.subject, ...(b.constraints || [])].filter(Boolean).join('。')), extract(answerText),
      (b.visualKeywords || []).filter(t => typeof t === 'string' && t.length >= 2 && t.length <= 12 && !ignored.has(t)),
      extract((storyboard?.shots || []).map(shot => [shot.beat, shot.story].filter(Boolean).join('。')).join('。'))];
    // Once choices/revisions exist, avoid resurrecting rejected directions from the original input.
    if (!brief?.answers?.length && !brief?.requirements?.length) sources.push(extract(typeof story === 'string' ? story : ''));
    return [...new Set(sources.flat().filter(word => !blocked.has(word)))].slice(0, 32);
  }
  const icons = [
    '<circle cx="12" cy="12" r="8"/><path d="m14 4-3 5m9 1h-6m3 9-3-5m-4 6 3-5m-9-1h6M7 5l3 5"/>',
    '<path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h3"/>',
    '<path d="M3 5h18v14H3zM3 10h18M9 5v14"/>',
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>'
  ];
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const bezier = (a, b, c, d, t) => (1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d;
  let instance = 0;
  function mount({ root: stage, signal, story, storyboard, brief } = {}) {
    if (!stage || signal?.aborted) return null;
    const document = stage.ownerDocument;
    const media = root.matchMedia('(prefers-reduced-motion: reduce)');
    const field = document.createElement('div');
    field.className = 'inspiration-field'; field.setAttribute('aria-hidden', 'true');
    const filterId = `inspiration-goo-${++instance}`;
    field.innerHTML = `<svg class="inspiration-filter" width="0" height="0" aria-hidden="true"><defs><filter id="${filterId}" x="-55%" y="-55%" width="210%" height="210%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="5.2" result="blur"/><feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo"/><feComposite in="SourceGraphic" in2="goo" operator="atop"/></filter></defs></svg><div class="inspiration-droplets"><i class="inspiration-core-drop"></i></div>`;
    const liquid = field.querySelector('.inspiration-droplets');
    liquid.style.filter = `url(#${filterId})`;
    stage.prepend(field);
    let pool = keywords(story, storyboard, brief), signature = '', cursor = 0, active = [], frameId = null;
    let stopped = false, visible = true, elapsed = 0, previous = 0, nextSpawn = 150;
    const position = (node, t) => ({ x: bezier(node.x, node.c1.x, node.c2.x, node.cx, t), y: bezier(node.y, node.c1.y, node.c2.y, node.cy, t) });
    const place = (element, point, extra = '') => { element.style.transform = `translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0) translate(-50%,-50%) ${extra}`; };
    function dispose(node) { node.element.remove(); node.drops.forEach(drop => drop.remove()); }
    function clear() { active.forEach(dispose); active = []; }
    function spawn(now) {
      const { width, height } = field.getBoundingClientRect();
      if (!width || !height) return;
      const index = cursor++, side = index % 2 ? 1 : -1, mobile = width < 500;
      const cx = width / 2, cy = height / 2;
      let x = width * (side < 0 ? .19 : .81);
      const y = height * [.26, .68, .75, .28, .46, .49][index % 6];
      const element = document.createElement('div'); element.className = `inspiration-fragment inspiration-tone-${index % 4}`;
      element.innerHTML = `<span class="inspiration-token"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[index % icons.length]}</svg><span></span></span>`;
      const word = pool.length ? pool[index % pool.length] : '';
      element.querySelector('span > span').textContent = word;
      if (!word) element.classList.add('inspiration-fragment-liquid');
      field.appendChild(element);
      const half = Math.min(element.getBoundingClientRect().width / 2, width / 2 - 8);
      x = Math.max(half + 8, Math.min(width - half - 8, x));
      const dx = cx - x, dy = cy - y, length = Math.hypot(dx, dy) || 1, sway = (mobile ? 20 : 42) * side;
      const drops = [22, 13, 16].map(size => {
        const drop = document.createElement('i'); drop.className = `inspiration-drop inspiration-tone-${index % 4}`;
        drop.style.width = drop.style.height = `${size}px`; liquid.appendChild(drop); return drop;
      });
      active.push({ element, drops, x, y, cx, cy, side, born: now, duration: 3100 + index % 3 * 180,
        c1: { x: x + dx * .27 - dy / length * sway, y: y + dy * .24 + dx / length * sway },
        c2: { x: x + dx * .79 + dy / length * sway * .67, y: y + dy * .82 - dx / length * sway * .67 } });
    }
    function update(node, now) {
      const progress = clamp((now - node.born) / node.duration);
      const travel = smooth((progress - .27) / .69), melt = smooth((travel - .5) / .39);
      const stretch = 1 + Math.sin(Math.PI * travel) * .095;
      place(node.element, position(node, travel), `rotate(${node.side * Math.sin(Math.PI * travel) * 7}deg) scale(${(1 - .53 * travel) * stretch},${(1 - .52 * travel) / stretch})`);
      node.element.style.opacity = smooth(progress / .2) * (1 - smooth((travel - .60) / .36));
      node.element.style.filter = `blur(${melt * 9}px)`;
      node.drops.forEach((drop, i) => {
        const t = clamp(travel - i * .07);
        place(drop, position(node, t), `scale(${(i ? .63 : 1) * (.76 + Math.sin(Math.PI * t) * .38)})`);
        drop.style.opacity = smooth((travel - .43) / .22) * (1 - smooth((travel - .84) / .16)) * (i ? .45 : .74);
      });
      return progress >= 1;
    }
    function frame(now) {
      frameId = null;
      if (stopped || !field.isConnected || document.hidden || !visible || media.matches) return;
      elapsed += previous ? Math.min(now - previous, 48) : 16; previous = now;
      for (let i = active.length - 1; i >= 0; i--) if (update(active[i], elapsed)) { dispose(active[i]); active.splice(i, 1); }
      if (elapsed >= nextSpawn && active.length < 2) { spawn(elapsed); nextSpawn = elapsed + 1450 + cursor % 3 * 130; }
      frameId = root.requestAnimationFrame(frame);
    }
    function resume() {
      if (frameId !== null) root.cancelAnimationFrame(frameId);
      frameId = null; previous = 0;
      field.dataset.reducedMotion = String(media.matches);
      if (media.matches) clear();
      if (!stopped && !document.hidden && visible && !media.matches) frameId = root.requestAnimationFrame(frame);
    }
    function resize() { clear(); nextSpawn = elapsed + 150; }
    const observer = typeof root.IntersectionObserver === 'function' ? new root.IntersectionObserver(entries => { visible = entries[0].isIntersecting; resume(); }) : null;
    observer?.observe(stage);
    document.addEventListener('visibilitychange', resume);
    media.addEventListener('change', resume);
    root.addEventListener('resize', resize);
    function stop() {
      if (stopped) return; stopped = true;
      if (frameId !== null) root.cancelAnimationFrame(frameId);
      observer?.disconnect(); clear(); field.remove();
      document.removeEventListener('visibilitychange', resume); media.removeEventListener('change', resume);
      root.removeEventListener('resize', resize); signal?.removeEventListener('abort', stop);
    }
    signal?.addEventListener('abort', stop, { once: true });
    resume();
    return { stop, update(story, storyboard, brief) {
      const next = JSON.stringify([story, storyboard?.shots, brief]);
      if (next !== signature) { signature = next; pool = keywords(story, storyboard, brief); }
    } };
  }
  const api = { keywords, mount };
  root.InspirationField = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
