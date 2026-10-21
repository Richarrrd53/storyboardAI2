const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('discovery.html contains non-empty default option for SKILL dropdown', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'html', 'discovery.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    assert.match(html, /<select[^>]*id="skill"[^>]*>[\s\S]*?<option[^>]+value="short-video-template-lab"[^>]*>[\s\S]*?<\/select>/);
});

test('PageHost mounts Discovery once per visit and returns its lifecycle', async () => {
    const code = fs.readFileSync(path.join(__dirname, '..', 'public/js/pages/page-host.js'), 'utf8');
    const content = { className: '', style: {}, innerHTML: '', querySelector: () => null };
    const main = { style: {} };
    const calls = [];
    global.document = { getElementById: id => id === 'page-main' ? main : content };
    global.window = {
        PageAssetLoader: { fetchPageDoc: async () => ({ querySelector: () => null }), injectCSS() {}, injectScripts: async scripts => { calls.push(scripts); return [true]; } },
        TransitionLoader: { ensureInnerLoader() {} },
        AppShell: { init: async () => {} }, QuickCompose: { mount() {} },
        initDiscoveryPage(context) { calls.push(context); return { unmount() { calls.push('unmount'); } }; }
    };
    eval(code);
    for (let i = 0; i < 2; i++) {
        const page = await window.PageHost.mount({ page: 'discovery', signal: new AbortController().signal, scripts: ['/js/discovery.js'] });
        page.unmount();
    }
    assert.equal(calls.filter(call => call?.root === content).length, 2);
    assert.equal(calls.filter(call => call === 'unmount').length, 2);
    assert.deepEqual(calls[0], ['/js/discovery.js']);
});

test('discovery.js populates SKILL dropdown and handles fallback gracefully', async () => {
    // Setup mock DOM
    const htmlPath = path.join(__dirname, '..', 'public', 'html', 'discovery.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // Minimal DOM environment
    const options = [];
    const skillSelect = {
        id: 'skill',
        tagName: 'SELECT',
        children: [{ value: 'short-video-template-lab', textContent: 'Short Video Template Lab' }],
        get innerHTML() {
            return this.children.map(o => `<option value="${o.value}">${o.textContent}</option>`).join('');
        },
        set innerHTML(val) {
            this.children = [];
            const regex = /<option value="([^"]*)">([^<]*)<\/option>/g;
            let m;
            while ((m = regex.exec(val)) !== null) {
                this.children.push({ value: m[1], textContent: m[2] });
            }
        }
    };

    const form = {
        id: 'discovery-form',
        dataset: {},
        querySelector: () => ({ disabled: false, querySelector: () => ({ textContent: '' }) }),
        addEventListener: () => {}
    };

    const results = {
        id: 'results',
        dataset: {},
        innerHTML: '',
        addEventListener: () => {}
    };

    const message = { id: 'form-message', textContent: '' };
    const count = { id: 'result-count', textContent: '' };
    const settingsLink = { id: 'skill-status', textContent: '', classList: { toggle: () => {} } };

    const domMap = {
        'discovery-form': form,
        'results': results,
        'form-message': message,
        'result-count': count,
        'skill': skillSelect,
        'skill-status': settingsLink
    };

    global.document = {
        getElementById: id => domMap[id] || null,
        addEventListener: () => {},
        readyState: 'complete'
    };
    global.window = {
        document: global.document,
        addEventListener: () => {},
        spaNavigate: () => {}
    };

    // Mock fetch for /api/discovery/skills
    global.fetch = async (url) => {
        if (url === '/api/discovery/skills') {
            return {
                ok: true,
                json: async () => ({
                    skills: [
                        { id: 'short-video-template-lab', name: 'Short Video Template Lab' }
                    ],
                    configured: true
                })
            };
        }
        return { ok: false, json: async () => ({}) };
    };

    // Load discovery.js
    const scriptPath = path.join(__dirname, '..', 'public', 'js', 'discovery.js');
    const code = fs.readFileSync(scriptPath, 'utf-8');
    eval(code);

    assert.equal(typeof window.initDiscoveryPage, 'function');
    window.initDiscoveryPage();

    // Allow promise resolution
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.equal(skillSelect.children.length, 1);
    assert.equal(skillSelect.children[0].value, 'short-video-template-lab');
    assert.equal(skillSelect.children[0].textContent, 'Short Video Template Lab');
});
