const fs = require('fs');

const cssToAppend = `
/* Project Management UI */
.projects-management {
    margin-top: 20px;
}

.projects-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
}

.projects-title {
    font-size: 2rem;
    font-weight: 900;
    color: var(--text-dark);
}

.new-project-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: var(--primary);
    color: var(--white);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 1.1rem;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 15px rgba(220, 156, 71, 0.4);
}

.new-project-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(220, 156, 71, 0.6);
    background: #EBB866;
}

.projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 24px;
}

.project-card {
    background: var(--white);
    border: 2px solid var(--card-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: flex;
    flex-direction: column;
}

.project-card:hover {
    border-color: var(--primary);
    transform: translateY(-6px);
    box-shadow: 0 15px 30px rgba(220, 156, 71, 0.15);
}

.project-thumb {
    height: 160px;
    background: linear-gradient(135deg, #2a2a3e, #1a1a2e);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
}

.project-thumb::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%);
}

.project-info {
    padding: 20px;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.project-title {
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--text-dark);
    margin-bottom: 8px;
}

.project-meta {
    font-size: 0.85rem;
    color: var(--text-mid);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.project-tag {
    background: var(--off-white);
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--card-border);
}

.project-date {
    margin-top: auto;
    font-size: 0.8rem;
    color: var(--text-light);
    font-weight: 500;
}

.projects-empty {
    grid-column: 1 / -1;
    text-align: center;
    padding: 60px 20px;
    background: var(--white);
    border: 2px dashed var(--card-border);
    border-radius: var(--radius-lg);
    color: var(--text-mid);
}

.projects-empty h3 {
    font-size: 1.5rem;
    color: var(--text-dark);
    margin-bottom: 12px;
}
`;

fs.appendFileSync('public/css/dashboard.css', cssToAppend);
console.log('Appended dashboard.css');
