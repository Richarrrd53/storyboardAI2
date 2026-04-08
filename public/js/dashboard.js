// Dashboard JS

// Animate stat bar on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const bar = document.querySelector('.stat-bar');
    if (bar) bar.style.width = bar.style.width || '60%';
  }, 400);
});
