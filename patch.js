const fs = require('fs');
let c = fs.readFileSync('public/html/dashboard.html', 'utf8');
let start = c.indexOf('<section class="hero-input-section anim-fadeInUp">');
let endMatch = '</div>\r\n\r\n    </main>';
let end = c.indexOf(endMatch, start);

if (end === -1) {
    endMatch = '</div>\n\n    </main>';
    end = c.indexOf(endMatch, start);
}

if(start!==-1 && end!==-1){ 
    let replace = `
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
    c = c.substring(0, start) + replace + c.substring(end); 
    fs.writeFileSync('public/html/dashboard.html', c); 
    console.log('success'); 
} else { 
    console.log('not found', start, end); 
}
