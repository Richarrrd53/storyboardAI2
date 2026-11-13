(async function () {
  'use strict';
  const report = document.getElementById('report');
  const show = value => { report.textContent = JSON.stringify(value, null, 2); };
  let project, operationPending = false;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function json(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}：HTTP ${response.status}`);
    return response.json();
  }
  async function record(result) {
    const log = await json('/audit-log');
    show({ result, project, requests: log.filter(x => x.method !== 'GET'), dialogs: document.querySelectorAll('[role="dialog"]').length,
      backgroundInert: document.querySelector('main').inert, focus: document.activeElement.id });
  }
  async function setup(config = {}) {
    await json('/phase1-control', { method: 'POST', body: JSON.stringify(config) });
    project = (await json('/api/projects')).projects[0];
    ProjectStore.reset(); show({ fixture: config, project });
  }
  function bind(id, action) {
    document.getElementById(id).onclick = async () => {
      if (operationPending) return;
      operationPending = true;
      try { await action(); } catch (error) { show({ error: error.message, hint: '確認 npm run audit:ui 仍在執行；本頁不支援正式 server 或 file://。' }); }
      finally { operationPending = false; }
    };
  }
  try {
    const health = await json('/audit-health');
    if (!health.isolated) throw new Error('不是隔離測試服務');
    await ensureDialogService(); await setup();
    document.querySelectorAll('main button').forEach(button => { button.disabled = false; });
    document.getElementById('health').textContent = `已就緒 · 隔離服務 ${health.port} · ${location.origin}`;
  } catch (error) { document.getElementById('health').textContent = '啟動失敗'; show({ error: error.message, start: 'npm run audit:ui', url: 'http://127.0.0.1:4318/phase1-harness' }); return; }
  bind('reset', () => setup()); bind('deleted', () => setup({ deleted: true }));
  bind('rename-fail', () => setup({ failRename: true })); bind('restore-fail', () => setup({ deleted: true, failRestore: true }));
  bind('delay', () => setup({ delayRename: 2000 }));
  bind('alert', async () => { await alert('這是一則隔離測試訊息。\n<名稱> 必須以文字顯示。'); await record('acknowledged'); });
  bind('confirm', async () => record(await confirm('是否繼續這個操作？', undefined, 'default', '繼續')));
  bind('logout', async () => record({ logoutConfirmed: await confirm('是否確定登出？'), note: '僅確認測試，不登出正式帳戶' }));
  bind('prompt', async () => record(await ProjectActions.renameProject(project)));
  bind('restore', async () => record(await ProjectActions.restoreProject(project)));
  bind('queue', async () => { const a = confirm('第一個確認'); const b = alert('第二個訊息'); await record([await a, await b]); });
  bind('abort', async () => { const c = new AbortController(); const result = DialogService.prompt({ title: '離頁中斷測試', value: '草稿', signal: c.signal }); setTimeout(() => c.abort(), 1000); await record(await result); });
  bind('ime', async () => {
    let calls = 0;
    const result = DialogService.prompt({ title: 'IME 輸入測試', value: '輸入中', onSubmit: () => { calls++; } });
    const input = document.querySelector('.sb-dialog-input');
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event); input.form.requestSubmit(); const during = calls;
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    show({ prevented: event.defaultPrevented, duringCompositionSubmits: during });
    await record({ result: await result, calls, prevented: event.defaultPrevented, duringCompositionSubmits: during });
  });
  bind('checks', async () => {
    const results = [], environment = { width: innerWidth, height: innerHeight, userAgent: navigator.userAgent, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
    const check = (name, passed, details) => { results.push({ name, passed, details }); show({ running: true, results }); if (!passed) throw new Error(name); };
    try {
      await setup();
      let result = DialogService.confirm({ title: '按鈕與動畫檢查' });
      const overlay = document.querySelector('.sb-dialog-overlay'), panel = document.querySelector('.sb-dialog');
      const buttons = Array.from(panel.querySelectorAll('button'));
      const widths = buttons.map(button => button.getBoundingClientRect().width);
      check('雙膠囊等寬', Math.abs(widths[0] - widths[1]) <= 1, widths);
      check('背景 inert', document.querySelector('main').inert);
      check('Modal 高於 Nav', Number(getComputedStyle(overlay).zIndex) > Number(getComputedStyle(document.documentElement).getPropertyValue('--layer-nav')));
      check('Panel scale從0開始', environment.reduced || panel.getAnimations().some(a => a.effect.getKeyframes()[0].transform === 'scale(0)'));
      await pause(450);
      const alphaBefore = getComputedStyle(overlay).backgroundColor;
      buttons[0].click(); await pause(120);
      check('退出 scrim 不淡出', !overlay.isConnected || getComputedStyle(overlay).opacity === '1' && getComputedStyle(overlay).backgroundColor === alphaBefore);
      check('退出有反轉scale', environment.reduced || panel.getAnimations().some(a => a.effect.getKeyframes().at(-1).transform === 'scale(0)'));
      check('Confirm 取消', (await result).confirmed === false);
      check('inert 清理', !document.querySelector('main').inert);
      result = DialogService.prompt({ value: '保留輸入', validate: value => value.trim() ? '' : '不可空白' });
      const input = document.querySelector('.sb-dialog-input'); input.value = ' ';
      input.form.requestSubmit(); await pause(20);
      check('空白驗證', input.getAttribute('aria-invalid') === 'true');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check('Prompt Escape', (await result).reason === 'escape');
      await setup({ deleted: true });
      result = ProjectActions.restoreProject(project); await pause(20);
      check('復原單一確認', document.querySelectorAll('[role="dialog"]').length === 1);
      document.querySelector('.sb-dialog-cancel').click(); await result;
      check('取消無復原API', !(await json('/audit-log')).some(x => x.path.endsWith('/restore')));
      const c = new AbortController(); result = DialogService.prompt({ signal: c.signal }); c.abort();
      check('Abort 清理', (await result).reason === 'abort' && !document.querySelector('.sb-dialog-overlay'));
    } catch (error) { results.push({ name: '回歸中斷', passed: false, error: error.message }); }
    const output = { environment, results, passed: results.every(r => r.passed) };
    show(output);
    await fetch('/audit-results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(output) });
  });
})();
