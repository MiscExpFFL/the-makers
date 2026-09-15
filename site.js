(function(){
 const nav=document.querySelector('.nav'), hamb=document.querySelector('.hamb'); if(hamb) hamb.addEventListener('click',()=>nav.classList.toggle('open'));
 const here=(location.pathname.split('/').pop()||'index.html'); document.querySelectorAll('.nav a').forEach(a=>{if(a.getAttribute('href')===here)a.classList.add('active')});
 window.fmt=(n)=>Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
 window.gradeClass=(g)=>{let x=(g||'').toLowerCase()[0];return ['a','b','c','d','f'].includes(x)?x:'b'};
 window.esc=(s)=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const data=document.createElement('script');data.src='makers-week1-tuesday-data.js?v=makers-20260915-tuesday1';data.onload=()=>{const patch=document.createElement('script');patch.src='makers-static-tuesday.js?v=makers-20260915-tuesday1';document.body.appendChild(patch)};document.body.appendChild(data);
})();