// Dashboard JS

// Animate stat bar on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const bar = document.querySelector('.stat-bar');
    if (bar) bar.style.width = bar.style.width || '60%';
  }, 400);
  // const railBottom = document.getElementById("rail-bottom");
  // const railTop = document.getElementById("rail-top");
  // const nums = window.innerWidth/28;
  // for (let i = 0; i < nums; i++){
  //   const railHole = document.createElement('div');
  //   railHole.classList.add('rail-hole');
  //   railBottom.appendChild(railHole);
  // }
  // for (let i = 0; i < nums; i++){
  //   const railHole = document.createElement('div');
  //   railHole.classList.add('rail-hole');
  //   railTop.appendChild(railHole);
  // }
});


