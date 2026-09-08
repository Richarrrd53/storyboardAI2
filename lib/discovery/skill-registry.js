const ShortVideoTemplateLab = require('./analyzers/short-video-template-lab');

const skills = new Map([
    ['short-video-template-lab', {
        id: 'short-video-template-lab',
        name: 'Short Video Template Lab',
        description: '依據可取得的影片資訊整理短影音結構，不推論爆紅原因。',
        analyze: video => ShortVideoTemplateLab.analyze(video)
    }]
]);

function listSkills() {
    return [...skills.values()].map(({ analyze, ...skill }) => skill);
}

function getSkill(skillId) {
    return skills.get(skillId);
}

module.exports = { getSkill, listSkills };
