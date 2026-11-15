// Isolated localhost fixture server for manual browser QA. No database, real
// credentials, provider calls or production auth changes. Run with Node directly.
const express = require('express');
const path = require('node:path');
const { templateIndex } = require('../../lib/template-recommendations');
const P = require('../../public/js/components/template-presentation');
const root = path.resolve(__dirname, '../..');
const app = express();
app.use(express.json());
const templates = Array.from({ length: 8 }, (_, i) => ({ id: `fixture-${i + 1}`,
    name: i === 0 ? '從一杯咖啡開始的晨間故事：找到城市裡讓自己慢下來的片刻與溫柔力量' : `晨光中的故事 ${i + 1}`,
    category: ['product', 'story', 'twist'][i % 3], tags: ['咖啡', '療癒', '日常'],
    description: '由細節帶出情緒，以晨間咖啡廳、手部動作和人物反應串起故事。',
    narrative: { summary: '從日常中的小細節，走向一個溫柔的轉折。' },
    variables: ['character', 'scene', 'product', 'emotion'],
    structure: ['hook', 'development', 'twist', 'resolution'].map((id, index) => ({ id, action: ['建立日常細節', '展開故事動作', '出現情緒轉折', '回到人物感受'][index], duration: '4s', purpose: id, camera: 'close-up' })),
    source: { title: '本機測試來源摘要，非已觀看影片', channel: 'Fixture studio' },
    thumbnail: '/images/profile/test001.jpg' }));
const calls = [];
app.use('/api', (req, res, next) => { calls.push({ path: req.path, method: req.method, stage: req.body?.discussionStage }); next(); });
app.get('/__test/metrics', (req, res) => res.json(calls));
app.post('/api/auth/login', (req, res) => res.json({ token: 'local-fixture-token' }));
app.get('/api/auth/me', (req, res) => res.json({ user: { id: 'fixture-user', name: '本機測試', email: 'fixture@example.test', aiProvider: 'gemini' } }));
app.get('/api/ai/capabilities', (req, res) => res.json({ providers: { gemini: { available: true }, openai: { available: true } } }));
app.get('/api/get-templates', (req, res) => {
    if (req.query.view !== 'index') return res.json(templates);
    const filtered = P.filter(templates.map(templateIndex), req.query);
    const offset = Number(req.query.offset) || 0;
    res.json({ items: filtered.slice(offset, offset + (Number(req.query.limit) || 50)), total: filtered.length });
});
app.get('/api/templates/:id', (req, res) => res.json(templates.find(template => template.id === req.params.id)));
app.post('/api/templates/recommend', (req, res) => res.json({ recommendations: templates.slice(0, 3).map(template => ({ id: template.id, reason: '從日常細節展開情緒，適合這個故事。', template: templateIndex(template) })) }));
app.post('/api/creation/copilot', (req, res) => {
    const body = req.body, variableStage = body.discussionStage === 'template';
    const ready = body.autoRounds > 0 || body.intent === 'delegate';
    res.json({ requestId: body.requestId, revision: body.revision, action: ready ? 'ready' : 'ask',
        message: variableStage ? '故事裡的大學生與咖啡已經很清楚，我會保留這些設定，再確認晨間場景的情緒。' : '讓咖啡的香氣帶出一個慢下來的早晨。你想讓觀眾感受到哪種情緒？',
        briefPatch: ready ? { baseStyle: 'natural', direction: '從動作細節展開療癒的早晨', duration: 30, ratio: '9:16', styleNotes: '柔和晨光與自然色彩' } : {},
        ...(body.templateId ? { templatePatch: [{ name: 'character', value: '大學生' }, { name: 'scene', value: '晨間咖啡廳' }, { name: 'product', value: '咖啡' }, { name: 'emotion', value: '療癒與放鬆' }] } : {}),
        form: ready ? null : { title: variableStage ? '確認故事裡的情緒' : '故事方向', questions: [{ id: variableStage ? 'template_emotion' : 'story_mood', type: 'single_choice', label: '想留下什麼感受？', recommended: 'calm', options: [{ value: 'calm', label: '安靜療癒', description: '讓動作與細節慢慢帶出情緒。' }, { value: 'joy', label: '輕快驚喜', description: '以明快節奏帶出小小轉折。' }] }] } });
});
app.post('/api/ask-gemini', (req, res) => {
    const body = req.body;
    if (body.type === 'image') return res.json({ image: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6yS0AAAAASUVORK5CYII='] });
    const target = body.duration || 30, count = { 15: 6, 30: 8, 45: 12, 60: 15 }[target];
    res.json({ response: JSON.stringify({ meta: { title: '咖啡的早晨' }, characters: [], shots: Array.from({ length: count }, (_, i) => ({ id: i + 1,
        sourceStructureId: templates[0].structure[Math.min(3, Math.floor(i * 4 / count))].id,
        story: `晨間咖啡的故事動作 ${i + 1}`, camera: 'close-up, slow tracking', duration: `${target / count}s`, emotion: 'calm', purpose: '展開故事細節', dialogue: '', shotPrompt: `A cup of coffee in morning light, detail ${i + 1}, natural composition`, characters: [] })) }) });
});
const savedProjects = new Map();
app.get('/api/projects', (req, res) => res.json({ projects: [...savedProjects.values()] }));
app.post('/api/projects', (req, res) => {
    const shots = (req.body.shots || []).map((shot, i) => ({ ...shot, id: `shot-${shot.order ?? i + 1}`, order: shot.order ?? i + 1, imageUrl: '/images/profile/test001.jpg' }));
    const project = { id: 'fixture-project', title: req.body.title || '咖啡的早晨', story: req.body.story || '', ratio: req.body.ratio || '9:16', duration: req.body.duration || 30, shots };
    savedProjects.set(project.id, project);
    res.json({ project });
});
app.get('/api/projects/:id', (req, res) => {
    const project = savedProjects.get(req.params.id);
    if (!project) return res.status(404).json({ error: '找不到專案' });
    res.json({ project });
});
app.post('/api/projects/:id/shots/:shotId/image-upload', (req, res) => res.json({ uploadUrl: `/__test/upload/${req.params.shotId}`, publicUrl: '/images/profile/test001.jpg' }));
app.put('/__test/upload/:shotId', (req, res) => res.status(200).end());
app.patch('/api/projects/:id/shots/:shotId', (req, res) => res.json({ success: true }));
app.all('/api/{*path}', (req, res) => res.json({}));
app.use(express.static(path.join(root, 'public')));
app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'public/html/index.html')));
if (require.main === module) app.listen(3001, '127.0.0.1', () => console.log('Creation fixture: http://127.0.0.1:3001'));
module.exports = { app, templates };
