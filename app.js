/* ==========================================
   Cannon Draw v3.0 - 최종 완성본
   구조: <body> 최하단 스크립트 → DOM 이미 준비됨
         DOMContentLoaded 불필요 → 가장 안전한 방식
   ========================================== */

// =============================================
// [설정] 수파베이스 연결 정보
// =============================================
const SUPABASE_URL = "https://qzhgsshyhmnczmreagqd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6aGdzc2h5aG1uY3ptcmVhZ3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNzc0NzksImV4cCI6MjA5Nzg1MzQ3OX0.2NZxyClmIpj7WtUuZtexZqAMuTnC7udF5FejwitzvcU";

// =============================================
// [1] 상태 변수 (순수 데이터)
// =============================================
var participants = [];   // { name, number }
var winners      = [];
var gameState    = 'READY';
var soundEnabled = true;
var audioCtx     = null;
// ⚠️ 필수: 아래 var supabase = null 이 window.supabase를 덮어쓰기 전에
//    CDN이 심어놈은 수파베이스 SDK를 먼저 저장해두기!
var _SDK = window.supabase || null;

var supabase     = null;  // 우리 프로젝트의 DB 클라이언트 변수
var totalShots   = 1;
var remainShots  = 0;

// 캔버스 관련
var cannon = { x:0, y:0, angle:-Math.PI/2, targetAngle:-Math.PI/2,
               length:50, width:20, isRotating:false, baseRadius:35 };
var targets=[], balls=[], particles=[], confetti=[], aniId=null;
var currentTarget=null, isShooting=false;

// =============================================
// [2] DOM 요소 (스크립트가 <body> 맨 아래 → 이미 준비됨)
// =============================================
var stepReady   = document.getElementById('stepReady');
var stepPlay    = document.getElementById('stepPlay');
var stepResult  = document.getElementById('stepResult');
var nameInput   = document.getElementById('nameInput');
var addNameBtn  = document.getElementById('addNameBtn');
var partList    = document.getElementById('participantList');
var partCount   = document.getElementById('participantCount');
var countInput  = document.getElementById('cannonCountInput');
var countVal    = document.getElementById('cannonCountVal');
var startBtn    = document.getElementById('startGameBtn');
var shotsEl     = document.getElementById('remainingShots');
var fireBtn     = document.getElementById('fireCannonBtn');
var quitBtn     = document.getElementById('quitGameBtn');
var overlay     = document.getElementById('canvasOverlay');
var winnersList = document.getElementById('winnersList');
var restartBtn  = document.getElementById('restartSameBtn');
var resetBtn    = document.getElementById('resetAllBtn');
var sndBtn      = document.getElementById('soundToggleBtn');
var sndIcon     = document.getElementById('soundIcon');
var sndText     = document.getElementById('soundText');
var hitModal    = document.getElementById('hitModal');
var hitNumEl    = document.getElementById('hitNumber');
var hitNameEl   = document.getElementById('hitName');
var closeModal  = document.getElementById('closeModalBtn');
var cvs         = document.getElementById('gameCanvas');
var ctx         = cvs.getContext('2d');

// =============================================
// [3] 이벤트 연결 (DOM 준비됐으니 바로 연결)
// =============================================
addNameBtn.addEventListener('click', handleAdd);
nameInput.addEventListener('keydown', function(e){ if(e.key==='Enter') handleAdd(); });
countInput.addEventListener('input', function(){ totalShots=+countInput.value; countVal.textContent=totalShots+'회'; });
startBtn.addEventListener('click', startGame);
quitBtn.addEventListener('click', quitGame);
fireBtn.addEventListener('click', fireCannon);
closeModal.addEventListener('click', onCloseModal);
restartBtn.addEventListener('click', restartSame);
resetBtn.addEventListener('click', resetAll);
sndBtn.addEventListener('click', toggleSound);

// =============================================
// [4] 캔버스 초기 크기 설정
// =============================================
function resizeCanvas(){
    if(!cvs||!cvs.parentNode) return;
    var r = cvs.parentNode.getBoundingClientRect();
    cvs.width  = r.width  || 600;
    cvs.height = r.height || 400;
    cannon.x = cvs.width/2;
    cannon.y = cvs.height - 35;
    if(gameState==='PLAYING') arrangeTargets();
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// =============================================
// [5] UI 갱신
// =============================================
function updateUI(){
    var n = participants.length;
    partCount.textContent = n;
    if(n===0){
        partList.innerHTML='<p class="empty-message">등록된 사람이 없습니다. 이름을 추가해 주세요.</p>';
    } else {
        var sorted = participants.slice().sort(function(a,b){ return a.number-b.number; });
        partList.innerHTML = sorted.map(function(p){
            return '<span class="chip">'+esc(p.name)+
                   '<span class="num-badge">'+p.number+'</span>'+
                   '<button type="button" onclick="removePart(\''+esc(p.name)+'\')">×</button></span>';
        }).join('');
    }
    countInput.disabled = (n===0);
    countInput.max = n||1;
    if(+countInput.value > n){ countInput.value=n||1; totalShots=n||1; }
    countVal.textContent = totalShots+'회';
    startBtn.disabled = (n===0);
}
updateUI();

// =============================================
// [6] 참여자 추가 / 삭제
// =============================================
function handleAdd(){
    var name = nameInput.value.trim();
    if(!name){ alert('이름을 입력해 주세요!'); nameInput.focus(); return; }
    if(participants.some(function(p){ return p.name===name; })){
        alert('이미 등록된 이름입니다!'); nameInput.focus(); return;
    }
    participants.push({ name:name, number:0 });
    nameInput.value='';
    nameInput.focus();
    shuffle();
    updateUI();
    saveToDb(name); // 수파베이스에 백그라운드 저장
}

window.removePart = function(name){
    participants = participants.filter(function(p){ return p.name!==name; });
    shuffle();
    updateUI();
};

// =============================================
// [7] 번호 무작위 배정 (Fisher-Yates)
// =============================================
function shuffle(){
    var n=participants.length; if(!n) return;
    var arr=[];for(var i=1;i<=n;i++) arr.push(i);
    for(var i=arr.length-1;i>0;i--){
        var j=Math.floor(Math.random()*(i+1));
        var t=arr[i]; arr[i]=arr[j]; arr[j]=t;
    }
    participants.forEach(function(p,i){ p.number=arr[i]; });
}

// =============================================
// [8] 수파베이스 연결 & 데이터
// =============================================
(function initDb(){
    try {
        // 1) 비교적 새로운 방식으로 심어나는 수파베이스 v2 SDK는 window.supabase.createClient
        // 2) 우리가 앞에 _SDK로 미리 저장해두었으니 그걸 사용
        var sdk = _SDK || window.supabase || null;
        var mk  = (typeof createClient !== 'undefined') ? createClient
               : (sdk && sdk.createClient ? sdk.createClient : null);
        if(!mk){ console.warn('수파베이스 SDK 미로드 - 로칼 모드로 작동'); return; }
        supabase = mk(SUPABASE_URL, SUPABASE_KEY);
        console.log('수파베이스 연결 성공!');
        loadFromDb();
    } catch(e){ console.error('수파베이스 초기화 오류:', e.message); }
})();

function loadFromDb(){
    if(!supabase) return;
    supabase.from('members').select('name').order('id',{ascending:true})
        .then(function(res){
            if(res.error){ console.error('로드 실패:', res.error.message); return; }
            if(!res.data||!res.data.length) return;
            var existing = participants.map(function(p){ return p.name; });
            res.data.forEach(function(row){
                if(!existing.includes(row.name))
                    participants.push({ name:row.name, number:0 });
            });
            shuffle(); updateUI();
        }).catch(function(e){ console.error('로드 오류:', e.message); });
}

function saveToDb(name){
    if(!supabase) return;
    supabase.from('members').insert([{name:name}])
        .then(function(res){
            if(res.error&&res.error.code!=='23505')
                console.warn('저장 실패:', res.error.message);
        }).catch(function(e){ console.error('저장 오류:', e.message); });
}

// =============================================
// [9] 게임 진행
// =============================================
function startGame(){
    initAudio();
    gameState='PLAYING'; winners=[]; remainShots=totalShots;
    shotsEl.textContent=remainShots;
    stepReady.classList.remove('active');
    stepResult.classList.remove('active');
    stepPlay.classList.add('active');
    fireBtn.disabled=false; overlay.style.display='none';
    resizeCanvas(); arrangeTargets();
    if(aniId) cancelAnimationFrame(aniId);
    loop();
}

function quitGame(){
    gameState='READY';
    if(aniId){ cancelAnimationFrame(aniId); aniId=null; }
    balls=[]; particles=[]; confetti=[]; targets=[];
    stepPlay.classList.remove('active');
    stepResult.classList.remove('active');
    stepReady.classList.add('active');
}

function endGame(){
    gameState='GAME_OVER';
    if(aniId){ cancelAnimationFrame(aniId); aniId=null; }
    stepPlay.classList.remove('active');
    stepReady.classList.remove('active');
    stepResult.classList.add('active');
    winnersList.innerHTML=winners.map(function(w,i){
        return '<div class="winner-card"><div class="winner-rank">'+(i+1)+'위</div>'+
               '<div class="winner-number">'+w.number+'번</div>'+
               '<div class="winner-name">'+esc(w.name)+'</div></div>';
    }).join('');
    spawnConfetti(); aniId=requestAnimationFrame(confettiLoop);
}

function onCloseModal(){
    hitModal.classList.remove('active');
    overlay.style.display='none';
    if(remainShots<=0) endGame();
    else fireBtn.disabled=false;
}

function restartSame(){
    winners=[]; gameState='READY';
    if(aniId){ cancelAnimationFrame(aniId); aniId=null; }
    balls=[]; particles=[]; confetti=[]; targets=[];
    shuffle();
    stepResult.classList.remove('active');
    stepPlay.classList.remove('active');
    stepReady.classList.add('active');
    updateUI(); loadFromDb();
}

function resetAll(){
    participants=[]; winners=[]; gameState='READY';
    if(aniId){ cancelAnimationFrame(aniId); aniId=null; }
    balls=[]; particles=[]; confetti=[]; targets=[];
    nameInput.value=''; countInput.value=1; totalShots=1; countVal.textContent='1회';
    stepPlay.classList.remove('active');
    stepResult.classList.remove('active');
    stepReady.classList.add('active');
    updateUI(); loadFromDb();
}

function toggleSound(){
    soundEnabled=!soundEnabled;
    sndIcon.textContent=soundEnabled?'🔊':'🔇';
    sndText.textContent=soundEnabled?'소리 켬':'소리 끔';
}

// =============================================
// [10] 캔버스 & 애니메이션
// =============================================
function arrangeTargets(){
    targets=[];
    var rem=participants.filter(function(p){ return !winners.some(function(w){ return w.name===p.name; }); });
    if(!rem.length) return;
    var cols=Math.ceil(Math.sqrt(rem.length));
    var cw=cvs.width/(cols+1), ch=(cvs.height*0.6)/(Math.ceil(rem.length/cols)+1);
    rem.forEach(function(p,i){
        targets.push({ x:cw*((i%cols)+1), y:ch*(Math.floor(i/cols)+1)+30,
                       r:28, number:p.number, name:p.name, alive:true, op:1, sc:1 });
    });
}

function fireCannon(){
    if(isShooting||remainShots<=0) return;
    var alive=targets.filter(function(t){ return t.alive; });
    if(!alive.length) return;
    isShooting=true; fireBtn.disabled=true; overlay.style.display='block';
    var tgt=alive[Math.floor(Math.random()*alive.length)];
    cannon.targetAngle=Math.atan2(tgt.y-cannon.y, tgt.x-cannon.x);
    cannon.isRotating=true;
    setTimeout(function(){ doFire(tgt); }, 800);
}

function doFire(tgt){
    var a=cannon.angle;
    balls.push({ x:cannon.x+Math.cos(a)*(cannon.length+cannon.baseRadius),
                 y:cannon.y+Math.sin(a)*(cannon.length+cannon.baseRadius),
                 vx:Math.cos(a)*10, vy:Math.sin(a)*10,
                 tgt:tgt, r:8, trail:[] });
    muzzleParticles(cannon.x, cannon.y, a);
    playShoot();
}

function loop(){
    aniId=requestAnimationFrame(loop);
    update(); draw();
}

function confettiLoop(){
    ctx.clearRect(0,0,cvs.width,cvs.height);
    confetti=confetti.filter(function(c){
        c.x+=c.vx; c.y+=c.vy; c.vy+=0.05; c.rotation+=c.spin; c.life-=0.003;
        return c.life>0&&c.y<cvs.height+20;
    });
    confetti.forEach(drawC);
    if(confetti.length>0) aniId=requestAnimationFrame(confettiLoop);
}

function update(){
    if(cannon.isRotating){
        var d=cannon.targetAngle-cannon.angle;
        cannon.angle+=d*0.1;
        if(Math.abs(d)<0.01){ cannon.angle=cannon.targetAngle; cannon.isRotating=false; }
    }
    balls=balls.filter(function(b){
        b.trail.push({x:b.x,y:b.y}); if(b.trail.length>10) b.trail.shift();
        var dx=b.tgt.x-b.x, dy=b.tgt.y-b.y, dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<b.r+b.tgt.r){ hitTarget(b.tgt); return false; }
        b.x+=dx/dist*12; b.y+=dy/dist*12; return true;
    });
    particles=particles.filter(function(p){
        p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.life-=0.02; p.r*=0.97; return p.life>0;
    });
    targets.forEach(function(t){ if(!t.alive){ t.op-=0.05; t.sc+=0.05; } });
}

function hitTarget(tgt){
    tgt.alive=false;
    var w=participants.find(function(p){ return p.number===tgt.number; });
    if(w) winners.push(w);
    explodeParticles(tgt.x,tgt.y); playHit();
    remainShots--; shotsEl.textContent=remainShots;
    isShooting=false; cannon.isRotating=false;
    setTimeout(function(){
        hitNumEl.textContent=tgt.number; hitNameEl.textContent=tgt.name;
        hitModal.classList.add('active');
        targets=targets.filter(function(t){ return t.alive; }); arrangeTargets();
    }, 500);
}

function draw(){
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.fillStyle='rgba(10,11,25,0.3)'; ctx.fillRect(0,0,cvs.width,cvs.height);
    targets.forEach(function(t){
        if(t.op<=0) return;
        ctx.save(); ctx.globalAlpha=t.op; ctx.translate(t.x,t.y); ctx.scale(t.sc,t.sc);
        var g=ctx.createRadialGradient(0,0,5,0,0,t.r);
        g.addColorStop(0,'#1a1f4e'); g.addColorStop(1,'#0d1030');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,t.r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(0,242,254,0.8)'; ctx.lineWidth=2; ctx.stroke();
        ctx.fillStyle='#fff'; ctx.font='bold '+(t.r*0.8)+'px Outfit';
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(t.number,0,0);
        ctx.restore();
    });
    balls.forEach(function(b){
        b.trail.forEach(function(pt,i){
            ctx.globalAlpha=(i/b.trail.length)*0.4; ctx.fillStyle='#ff9800';
            ctx.beginPath(); ctx.arc(pt.x,pt.y,b.r*(i/b.trail.length),0,Math.PI*2); ctx.fill();
        }); ctx.globalAlpha=1;
        var g=ctx.createRadialGradient(b.x-2,b.y-2,1,b.x,b.y,b.r);
        g.addColorStop(0,'#fffde7'); g.addColorStop(0.5,'#ff9800'); g.addColorStop(1,'#e65100');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
    });
    particles.forEach(function(p){
        ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    }); ctx.globalAlpha=1;
    // 대포 포대
    ctx.save(); ctx.translate(cannon.x,cannon.y);
    ctx.save(); ctx.rotate(cannon.angle);
    ctx.fillStyle='#b0b8cc';
    ctx.fillRect(cannon.baseRadius-5,-cannon.width/2,cannon.length,cannon.width);
    ctx.restore();
    var bg=ctx.createRadialGradient(0,0,5,0,0,cannon.baseRadius);
    bg.addColorStop(0,'#4a5568'); bg.addColorStop(1,'#2d3748');
    ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(0,0,cannon.baseRadius,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(0,242,254,0.4)'; ctx.lineWidth=2; ctx.stroke();
    ctx.restore();
}

function drawC(c){
    ctx.save(); ctx.globalAlpha=c.life; ctx.translate(c.x,c.y); ctx.rotate(c.rotation);
    ctx.fillStyle=c.color; ctx.fillRect(-c.sz/2,-c.sz/2,c.sz,c.sz*0.5); ctx.restore();
}

function muzzleParticles(x,y,a){
    for(var i=0;i<20;i++){
        var sp=(Math.random()-0.5)*1.2, sp2=Math.random()*5+3;
        particles.push({x:x,y:y,vx:Math.cos(a+sp)*sp2,vy:Math.sin(a+sp)*sp2,
                         r:Math.random()*5+2,color:['#ff9800','#ffeb3b','#ff5722','#fff'][Math.floor(Math.random()*4)],life:1});
    }
}
function explodeParticles(x,y){
    for(var i=0;i<40;i++){
        var a=Math.random()*Math.PI*2, s=Math.random()*8+2;
        particles.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
                         r:Math.random()*6+2,color:['#ff3366','#ff9800','#ffeb3b','#00f2fe','#fff'][Math.floor(Math.random()*5)],life:1});
    }
}
function spawnConfetti(){
    var cols=['#ff3366','#00f2fe','#ffeb3b','#a78bfa','#34d399'];
    for(var i=0;i<120;i++){
        confetti.push({x:Math.random()*cvs.width,y:-10,vx:(Math.random()-0.5)*4,vy:Math.random()*4+1,
                        sz:Math.random()*10+5,rotation:Math.random()*Math.PI*2,
                        spin:(Math.random()-0.5)*0.2,color:cols[Math.floor(Math.random()*5)],life:1});
    }
}

// =============================================
// [11] 사운드 (Web Audio API)
// =============================================
function initAudio(){
    if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
}
function playShoot(){
    if(!soundEnabled||!audioCtx) return;
    var o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type='sawtooth'; o.frequency.setValueAtTime(200,audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(50,audioCtx.currentTime+0.3);
    g.gain.setValueAtTime(0.3,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.3);
    o.start(audioCtx.currentTime); o.stop(audioCtx.currentTime+0.3);
}
function playHit(){
    if(!soundEnabled||!audioCtx) return;
    [400,600,800].forEach(function(freq,i){
        var o=audioCtx.createOscillator(), g=audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination); o.type='sine'; o.frequency.value=freq;
        g.gain.setValueAtTime(0.2,audioCtx.currentTime+i*0.1);
        g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+i*0.1+0.3);
        o.start(audioCtx.currentTime+i*0.1); o.stop(audioCtx.currentTime+i*0.1+0.3);
    });
}

// =============================================
// [12] 유틸
// =============================================
function esc(s){
    return String(s).replace(/[&<>'"]/g,function(c){
        return({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]||c);
    });
}
