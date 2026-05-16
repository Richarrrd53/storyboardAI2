const fs = require('fs');
let content = fs.readFileSync('public/html/dashboard.html', 'utf8');

// Find the start of the <main class="dash-main"> inner content
const startIndex = content.indexOf('<section class="hero-input-section anim-fadeInUp">');
// Find the end of the <section class="dash-two-col anim-fadeInUp"
const endTarget = '</section>';
const dashTwoColIndex = content.indexOf('<section class="dash-two-col anim-fadeInUp"');
const endIndex = content.indexOf(endTarget, dashTwoColIndex) + endTarget.length;

if (startIndex !== -1 && dashTwoColIndex !== -1 && endIndex !== -1) {
    const replacement = `
        <!-- Project Management Section -->
        <section class="projects-management anim-fadeInUp">
            <div class="projects-header">
                <h1 class="projects-title">我的專案</h1>
                <button class="new-project-btn" onclick="navigate('generate')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    新增專案
                </button>
            </div>
            
            <div class="projects-grid" id="projects-grid">
                <!-- Projects will be dynamically rendered here -->
            </div>
        </section>
`;
    content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
    fs.writeFileSync('public/html/dashboard.html', content);
    console.log("Successfully replaced content.");
} else {
    console.error("Could not find the target sections.", startIndex, dashTwoColIndex, endIndex);
}
