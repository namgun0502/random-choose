/* ==========================================
   Cannon & Ladder Draw v4.0 - 통합 최종본
   ========================================== */

// =============================================
// [설정] 수파베이스 연결 정보
// =============================================
const SUPABASE_URL = "https://qzhgsshyhmnczmreagqd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6aGdzc2h5aG1uY3ptcmVhZ3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNzc0NzksImV4cCI6MjA5Nzg1MzQ3OX0.2NZxyClmIpj7WtUuZtexZqAMuTnC7udF5FejwitzvcU";

// =============================================
// [1] 전역 상태 변수
// =============================================
var participants = [];   // { name, number }
var winners      = [];   // 대포 게임 당첨자 목록
var gameState    = 'READY'; // 'READY' | 'PLAYING' | 'GAME_OVER'
var activeTab    = 'cannon'; // 'cannon' | 'ladder'
var soundEnabled = true;
var audioCtx     = null;
var supabase     = null;

// 대포 모드 전용
var totalShots   = 1;
var remainShots  = 0;
var cannon = { x:0, y:0, angle:-Math.PI/2, targetAngle:-Math.PI/2,
               length:50, width:20, isRotating:false, baseRadius:35 };
var targets=[], balls=[], particles=[], confetti=[], aniId=null;
var currentTarget=null, isShooting=false;

// 사다리 모드 전용
var ladderPrizes = [];    // 상품 입력값 배열
var ladderBridges = [];   // 가로 다리 정보
var ladderPlayers = [];   // 사다리 타고 내려가는 말 상태 { x, y, lineIndex, color, path:[], done:false }
var ladderResult = [];    // 최종 매칭 { name, prize }
var ladderColors = ['#ff3366', '#00f2fe', '#ffeb3b', '#a78bfa', '#34d399', '#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#8b5cf6'];

// =============================================
// [2] DOM 요소 (<body> 최하단 로드)
// =============================================
// 공통 요소
var nameInput   = document.getElementById('nameInput');
var addNameBtn  = document.getElementById('addNameBtn');
var partList    = document.getElementById('participantList');
var partCount   = document.getElementById('participantCount');
var soundBtn    = document.getElementById('soundToggleBtn');
var soundIcon   = document.getElementById('soundIcon');
var soundText   = document.getElementById('soundText');

// 탭 제어
var tabCannonBtn = document.getElementById('tabCannonBtn');
var tabLadderBtn = document.getElementById('tabLadderBtn');
var cannonSettings = document.getElementById('cannonSettingsSection');
var ladderSettings = document.getElementById('ladderSettingsSection');

// 대포 설정 및 스테이지
var countInput  = document.getElementById('cannonCountInput');
var countVal    = document.getElementById('cannonCountVal');
var startBtn    = document.getElementById('startGameBtn');
var stepPlay    = document.getElementById('stepPlay');
var cvs         = document.getElementById('gameCanvas');
var ctx         = cvs.getContext('2d');
var shotsEl     = document.getElementById('remainingShots');
var fireBtn     = document.getElementById('fireCannonBtn');
var quitBtn     = document.getElementById('quitGameBtn');
var overlay     = document.getElementById('canvasOverlay');

// 사다리 설정 및 스테이지
var prizeInputsList = document.getElementById('prizeInputsList');
var startLadderBtn  = document.getElementById('startLadderGameBtn');
var stepLadderPlay  = document.getElementById('stepLadderPlay');
var quitLadderBtn   = document.getElementById('quitLadderGameBtn');
var runLadderBtn    = document.getElementById('runLadderBtn');
var ladCvs          = document.getElementById('ladderCanvas');
var ladCtx          = ladCvs.getContext('2d');
var ladOverlay      = document.getElementById('ladderCanvasOverlay');

// 결과 화면들
var stepResult  = document.getElementById('stepResult');
var winnersList = document.getElementById('winnersList');
var restartBtn  = document.getElementById('restartSameBtn');
var resetBtn    = document.getElementById('resetAllBtn');

var stepLadderResult = document.getElementById('stepLadderResult');
var ladderResultList = document.getElementById('ladderResultList');
var resetAllLadBtn   = document.getElementById('resetAllLadderBtn');

// 모달
var hitModal    = document.getElementById('hitModal');
var hitNumEl    = document.getElementById('hitNumber');
var hitNameEl   = document.getElementById('hitName');
var closeModal  = document.getElementById('closeModalBtn');

// =============================================
// [3] 이벤트 리스너 등록
// =============================================
addNameBtn.addEventListener('click', handleAdd);
nameInput.addEventListener('keydown', function(e){ if(e.key==='Enter') handleAdd(); });
soundBtn.addEventListener('click', toggleSound);

// 탭 스위칭
tabCannonBtn.addEventListener('click', function(){ switchTab('cannon'); });
tabLadderBtn.addEventListener('click', function(){ switchTab('ladder'); });

// 대포 이벤트
countInput.addEventListener('input', function(){ totalShots=+countInput.value; countVal.textContent=totalShots+'회'; });
startBtn.addEventListener('click', startGame);
quitBtn.addEventListener('click', quitGame);
fireBtn.addEventListener('click', fireCannon);
closeModal.addEventListener('click', onCloseModal);
restartBtn.addEventListener('click', restartSame);
resetBtn.addEventListener('click', resetAll);

// 사다리 이벤트
startLadderBtn.addEventListener('click', startLadderGame);
quitLadderBtn.addEventListener('click', quitLadderGame);
runLadderBtn.addEventListener('click', runLadderSimulation);
resetAllLadBtn.addEventListener('click', resetAllLadder);

// =============================================
// [4] 탭 스위칭 로직
// =============================================
function switchTab(tab) {
    activeTab = tab;
    if (tab === 'cannon') {
        tabCannonBtn.classList.add('active');
        tabLadderBtn.classList.remove('active');
        cannonSettings.classList.add('active');
        ladderSettings.classList.remove('active');
    } else {
        tabCannonBtn.classList.remove('active');
        tabLadderBtn.classList.add('active');
        cannonSettings.classList.remove('active');
        ladderSettings.classList.add('active');
        updatePrizeInputs();
    }
}

// 사다리 상품 입력 폼 동적 업데이트
function updatePrizeInputs() {
    prizeInputsList.innerHTML = '';
    participants.forEach(function(p, i) {
        var savedVal = ladderPrizes[i] || ''; // 기존에 적어둔 상품명 있으면 기억
        var row = document.createElement('div');
        row.className = 'prize-input-row';
        row.innerHTML = '<span class="prize-label">' + esc(p.name) + '</span>' +
                        '<input type="text" class="prize-field" placeholder="당첨될 상품/벌칙 입력" data-index="' + i + '" value="' + esc(savedVal) + '">';
        
        // 입력 이벤트 걸어서 즉시 배열에 동기화
        var input = row.querySelector('input');
        input.addEventListener('input', function(e) {
            var idx = +e.target.getAttribute('data-index');
            ladderPrizes[idx] = e.target.value.trim();
            checkLadderStartValidation();
        });
        prizeInputsList.appendChild(row);
    });
    checkLadderStartValidation();
}

function checkLadderStartValidation() {
    var count = participants.length;
    // 사다리는 최소 2명 이상일 때 작동
    if (count >= 2) {
        startLadderBtn.disabled = false;
    } else {
        startLadderBtn.disabled = true;
    }
}

// =============================================
// [5] UI 갱신 및 DB 연동
// =============================================
// ⚠️ 필수: 아래 var supabase = null 이 window.supabase를 덮어쓰기 전에
//    CDN이 심어놈은 수파베이스 SDK를 먼저 저장해두기!
var _SDK = window.supabase || null;

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
    
    // 대포 설정 조율
    countInput.disabled = (n===0);
    countInput.max = n||1;
    if(+countInput.value > n){ countInput.value=n||1; totalShots=n||1; }
    countVal.textContent = totalShots+'회';
    startBtn.disabled = (n===0);

    // 사다리 설정 조율
    if (activeTab === 'ladder') {
        updatePrizeInputs();
    } else {
        checkLadderStartValidation();
    }
}
updateUI();

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
    saveToDb(name);
}

window.removePart = function(name){
    var idx = participants.findIndex(function(p){ return p.name===name; });
    if(idx !== -1) {
        participants.splice(idx, 1);
        ladderPrizes.splice(idx, 1); // 상품도 같이 지움
    }
    shuffle();
    updateUI();
};

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
// [6] 수파베이스 연동 (REST API 직접 통신 방식)
// =============================================
function loadFromDb(){
    fetch(SUPABASE_URL + "/rest/v1/members?select=name&order=id.asc", {
        method: "GET",
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": "Bearer " + SUPABASE_KEY
        }
    })
    .then(function(res) {
        if (!res.ok) {
            throw new Error("서버 응답 오류 (상태코드: " + res.status + ")");
        }
        return res.json();
    })
    .then(function(data) {
        if (!data || !data.length) return;
        var existing = participants.map(function(p){ return p.name; });
        data.forEach(function(row){
            if(!existing.includes(row.name))
                participants.push({ name:row.name, number:0 });
        });
        shuffle(); 
        updateUI();
        console.log("DB 데이터 로드 완료:", data);
    })
    .catch(function(e) {
        console.warn("DB 로드 실패 (로컬 모드로 전환됩니다):", e.message);
    });
}

function saveToDb(name){
    fetch(SUPABASE_URL + "/rest/v1/members", {
        method: "POST",
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": "Bearer " + SUPABASE_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        body: JSON.stringify({ name: name })
    })
    .then(function(res) {
        if (res.ok) {
            console.log("DB 저장 완료:", name);
        } else {
            console.warn("DB 저장 응답 코드 경고:", res.status);
        }
    })
    .catch(function(e) {
        console.error("DB 저장 오류:", e.message);
    });
}

// 시작 시 DB 자동 조회
loadFromDb();


// =============================================
// [7] 대포 게임 플레이 코드
// =============================================
function resizeCanvas(){
    if(!cvs||!cvs.parentNode) return;
    var r = cvs.parentNode.getBoundingClientRect();
    cvs.width  = r.width  || 600;
    cvs.height = r.height || 400;
    cannon.x = cvs.width/2;
    cannon.y = cvs.height - 35;
    if(gameState==='PLAYING' && activeTab === 'cannon') arrangeTargets();
}
window.addEventListener('resize', resizeCanvas);

function startGame(){
    initAudio();
    gameState='PLAYING'; winners=[]; remainShots=totalShots;
    shotsEl.textContent=remainShots;
    
    // 기존 stepReady 대신 공통 세션 및 탭 숨김 처리
    document.getElementById('commonParticipantSection').style.display = 'none';
    document.querySelector('.tab-container').style.display = 'none';
    cannonSettings.classList.remove('active');

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
    
    // 다시 공통 영역 복구
    document.getElementById('commonParticipantSection').style.display = 'flex';
    document.querySelector('.tab-container').style.display = 'flex';
    cannonSettings.classList.add('active');
}

function endGame(){
    gameState='GAME_OVER';
    if(aniId){ cancelAnimationFrame(aniId); aniId=null; }
    stepPlay.classList.remove('active');
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
    
    document.getElementById('commonParticipantSection').style.display = 'flex';
    document.querySelector('.tab-container').style.display = 'flex';
    cannonSettings.classList.add('active');
    
    updateUI(); loadFromDb();
}

function resetAll(){
    participants=[]; winners=[]; gameState='READY';
    if(aniId){ cancelAnimationFrame(aniId); aniId=null; }
    balls=[]; particles=[]; confetti=[]; targets=[];
    nameInput.value=''; countInput.value=1; totalShots=1; countVal.textContent='1회';
    stepPlay.classList.remove('active');
    stepResult.classList.remove('active');
    stepReady.style.display='flex';
    updateUI(); loadFromDb();
}

function toggleSound(){
    soundEnabled=!soundEnabled;
    soundIcon.textContent=soundEnabled?'🔊':'🔇';
    soundText.textContent=soundEnabled?'소리 켬':'소리 끔';
}

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

function confettiLoop(){
    ctx.clearRect(0,0,cvs.width,cvs.height);
    confetti=confetti.filter(function(c){
        c.x+=c.vx; c.y+=c.vy; c.vy+=0.05; c.rotation+=c.spin; c.life-=0.003;
        return c.life>0&&c.y<cvs.height+20;
    });
    confetti.forEach(drawC);
    if(confetti.length>0) aniId=requestAnimationFrame(confettiLoop);
}

// =============================================
// [8] 사더리 게임 플레이 코드
// =============================================
var ladderActive = false;

function resizeLadderCanvas() {
    if(!ladCvs || !ladCvs.parentNode) return;
    var r = ladCvs.parentNode.getBoundingClientRect();
    ladCvs.width = r.width || 600;
    ladCvs.height = r.height || 450;
}
window.addEventListener('resize', resizeLadderCanvas);

function startLadderGame() {
    initAudio();
    gameState = 'PLAYING';
    
    // UI 전환
    document.getElementById('commonParticipantSection').style.display = 'none';
    document.querySelector('.tab-container').style.display = 'none';
    ladderSettings.classList.remove('active');
    stepLadderPlay.classList.add('active');

    runLadderBtn.disabled = false;
    ladOverlay.style.display = 'none';

    resizeLadderCanvas();
    
    // 사다리 다리 데이터 구축
    generateLadderStructure();
    
    // 사다리 그리기
    drawLadderInitial();
}

function quitLadderGame() {
    gameState = 'READY';
    ladderActive = false;
    document.getElementById('commonParticipantSection').style.display = 'flex';
    document.querySelector('.tab-container').style.display = 'flex';
    stepLadderPlay.classList.remove('active');
    ladderSettings.classList.add('active');
    
    updateUI();
}

function generateLadderStructure() {
    var count = participants.length;
    ladderBridges = [];
    ladderPlayers = [];
    ladderResult = [];

    var w = ladCvs.width;
    var h = ladCvs.height;
    
    var padding = 50;
    var colWidth = (w - (padding * 2)) / (count - 1);

    var levels = 25; 
    var bridgeCount = count * 5; 
    
    for (var i = 0; i < bridgeCount; i++) {
        var startLine = Math.floor(Math.random() * (count - 1));
        var level = Math.floor(Math.random() * (levels - 2)) + 1;

        var exists = ladderBridges.some(function(b) {
            return b.startLine === startLine && b.level === level;
        });

        var neighbor = ladderBridges.some(function(b) {
            return (b.startLine === startLine - 1 || b.startLine === startLine + 1) && b.level === level;
        });

        if (!exists && !neighbor) {
            ladderBridges.push({
                startLine: startLine,
                level: level
            });
        }
    }

    ladderBridges.sort(function(a, b) { return a.level - b.level; });

    var topY = 60;
    participants.forEach(function(p, i) {
        var startX = padding + (i * colWidth);
        ladderPlayers.push({
            name: p.name,
            color: ladderColors[i % ladderColors.length],
            x: startX,
            y: topY,
            lineIndex: i,
            done: false,
            isMoving: false, // 💡 추가: 현재 주행(이동) 중인지 여부
            path: [{x: startX, y: topY}]
        });
    });
}

function drawLadderInitial() {
    var w = ladCvs.width;
    var h = ladCvs.height;
    var count = participants.length;
    var padding = 50;
    var colWidth = (w - (padding * 2)) / (count - 1);
    
    var topY = 60;
    var bottomY = h - 60;

    ladCtx.clearRect(0, 0, w, h);
    
    ladCtx.fillStyle = '#0a0b16';
    ladCtx.fillRect(0, 0, w, h);

    ladCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ladCtx.lineWidth = 4;
    for (var i = 0; i < count; i++) {
        var x = padding + (i * colWidth);
        ladCtx.beginPath();
        ladCtx.moveTo(x, topY);
        ladCtx.lineTo(x, bottomY);
        ladCtx.stroke();

        var pColor = ladderColors[i % ladderColors.length];
        ladCtx.save();
        ladCtx.fillStyle = pColor;
        // 마우스를 올릴 수 있는 인터랙션 영역임을 알리기 위해 크기를 키움
        ladCtx.font = 'bold 15px Noto Sans KR';
        ladCtx.shadowColor = pColor;
        ladCtx.shadowBlur = 8;
        ladCtx.textAlign = 'center';
        // 아직 타지 않은 사람 이름 위에는 마우스 클릭 유도 아이콘 살짝 배치 가능
        var nameText = participants[i].name;
        var pState = ladderPlayers[i];
        if (pState && !pState.done && !pState.isMoving) {
            nameText += ' 👇'; // 누르면 탈 수 있다는 표시
        }
        ladCtx.fillText(nameText, x, topY - 20);
        ladCtx.restore();

        var prizeText = ladderPrizes[i] || '꽝';
        ladCtx.fillStyle = '#00f2fe';
        ladCtx.font = 'bold 13px Noto Sans KR';
        ladCtx.textAlign = 'center';
        ladCtx.fillText(prizeText, x, bottomY + 25);
    }

    ladCtx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ladCtx.lineWidth = 3;
    var stepH = (bottomY - topY) / 25;
    ladderBridges.forEach(function(b) {
        var x1 = padding + (b.startLine * colWidth);
        var x2 = padding + ((b.startLine + 1) * colWidth);
        var y = topY + (b.level * stepH);

        ladCtx.beginPath();
        ladCtx.moveTo(x1, y);
        ladCtx.lineTo(x2, y);
        ladCtx.stroke();
    });
}

// 💡 캔버스에서 사람이름 클릭 시 개별 타기 이벤트 처리기
ladCvs.addEventListener('click', function(e) {
    if (gameState !== 'PLAYING' || activeTab !== 'ladder') return;
    
    var rect = ladCvs.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;
    
    var count = participants.length;
    var padding = 50;
    var colWidth = (ladCvs.width - (padding * 2)) / (count - 1);
    var topY = 60;
    
    // 상단 이름 터치 영역 (Y축 범위 체크)
    if (mouseY >= topY - 45 && mouseY <= topY + 5) {
        for (var i = 0; i < count; i++) {
            var lineX = padding + (i * colWidth);
            // 클릭 가로 폭 편차 +-35px 허용
            if (mouseX >= lineX - 35 && mouseX <= lineX + 35) {
                var p = ladderPlayers[i];
                if (p && !p.done && !p.isMoving) {
                    p.isMoving = true;
                    playShoot(); // 출발음 효과
                    
                    // 💡 개별 출발 시에는 투명 방어막(ladOverlay)을 켜지 않음!
                    // 다른 사람의 이름도 여전히 눌러서 동시 출발할 수 있게 개방해둡니다.
                    if (!ladderActive) {
                        ladderActive = true;
                        runLadderBtn.disabled = true;
                        animLoop();
                    }
                }
                break;
            }
        }
    }
});

function runLadderSimulation() {
    runLadderBtn.disabled = true;
    // 💡 전체 출발 시에는 마우스 클릭 혼선 방지를 위해 방어막 노출
    ladOverlay.style.display = 'block';
    ladderActive = true;

    // 모든 플레이어 동시 출발
    ladderPlayers.forEach(function(p) {
        if (!p.done) p.isMoving = true;
    });

    animLoop();
}

function animLoop() {
    if (!ladderActive) return;

    var w = ladCvs.width;
    var h = ladCvs.height;
    var count = participants.length;
    var padding = 50;
    var colWidth = (w - (padding * 2)) / (count - 1);
    var topY = 60;
    var bottomY = h - 60;
    var stepH = (bottomY - topY) / 25;

    // 💡 세로로 기어 내려가는 속도 (2px)
    var stepSize = 2; 
    // 💡 가로 다리를 건너가는 속도 (2px)
    var horizStep = 2; 

    var allDone = true;
    ladCtx.clearRect(0, 0, w, h);
    
    drawLadderInitial();

    ladderPlayers.forEach(function(p, pIdx) {
        ladCtx.save();
        
        // 지나온 궤적 그리기 (네온 발광 효과)
        ladCtx.strokeStyle = p.color;
        ladCtx.lineWidth = 5;
        ladCtx.shadowColor = p.color;
        ladCtx.shadowBlur = 10;
        ladCtx.lineCap = 'round';
        ladCtx.lineJoin = 'round';
        
        ladCtx.beginPath();
        ladCtx.moveTo(p.path[0].x, p.path[0].y);
        for (var k = 1; k < p.path.length; k++) {
            ladCtx.lineTo(p.path[k].x, p.path[k].y);
        }
        ladCtx.stroke();
        
        var lastPt = p.path[p.path.length - 1];

        // 플레이어 머리 (화이트 글로우)
        ladCtx.fillStyle = '#ffffff';
        ladCtx.shadowColor = '#ffffff';
        ladCtx.shadowBlur = 15;
        ladCtx.beginPath();
        ladCtx.arc(lastPt.x, lastPt.y, 7, 0, Math.PI*2);
        ladCtx.fill();
        
        ladCtx.restore();

        // 주행 물리 업데이트
        if (p.isMoving && !p.done) {
            allDone = false;
            
            // 💡 [가로로 타는 속도도 스무스하게 조정]
            if (p.isMovingHorizontal) {
                var dx = p.horizontalDestX - lastPt.x;
                var dist = Math.abs(dx);
                
                if (dist <= horizStep) {
                    // 가로 목표 지점에 거의 도달했으면 위치 확정하고 가로 모드 해제
                    p.path.push({ x: p.horizontalDestX, y: lastPt.y });
                    p.isMovingHorizontal = false;
                } else {
                    // 목표 X좌표를 향해 프레임당 2픽셀씩 스무스하게 이동
                    var nextStepX = lastPt.x + Math.sign(dx) * horizStep;
                    p.path.push({ x: nextStepX, y: lastPt.y });
                }
            } else {
                // 일반 세로 하강 모드
                var newY = lastPt.y + stepSize;
                var crossedBridge = null;

                ladderBridges.forEach(function(b) {
                    var bY = topY + (b.level * stepH);
                    if (lastPt.y < bY && newY >= bY) {
                        if (p.lineIndex === b.startLine) {
                            crossedBridge = { bridge: b, direction: 1 };
                        } else if (p.lineIndex === b.startLine + 1) {
                            crossedBridge = { bridge: b, direction: -1 };
                        }
                    }
                });

                if (crossedBridge) {
                    var bY = topY + (crossedBridge.bridge.level * stepH);
                    p.path.push({ x: lastPt.x, y: bY });

                    // 가로 이동 목표 설정 및 모드 온
                    p.lineIndex += crossedBridge.direction;
                    var nextX = padding + (p.lineIndex * colWidth);
                    p.isMovingHorizontal = true;
                    p.horizontalDestX = nextX;

                    playShoot(); // 꺾일 때 소리
                } else {
                    if (newY >= bottomY) {
                        p.path.push({ x: lastPt.x, y: bottomY });
                        p.done = true;
                        
                        var resultPrize = ladderPrizes[p.lineIndex] || '꽝';
                        ladderResult.push({
                            name: p.name,
                            prize: resultPrize
                        });
                        playHit();
                    } else {
                        p.path.push({ x: lastPt.x, y: newY });
                    }
                }
            }
        } else if (!p.done) {
            // 대기 중인 인원이 한 명이라도 있으면 아직 완료 안 됨
            allDone = false;
        }
    });

    if (allDone) {
        ladderActive = false;
        // 최종 종료 시 방어막과 오프닝 결과 화면 준비
        ladOverlay.style.display = 'block';
        setTimeout(showLadderResult, 1200);
    } else {
        requestAnimationFrame(animLoop);
    }
}





function showLadderResult() {
    // 결과 화면 노출
    stepLadderPlay.classList.remove('active');
    stepLadderResult.classList.add('active');

    // 결과 데이터 노출
    ladderResultList.innerHTML = ladderResult.map(function(r) {
        return '<div class="winner-card"><div class="winner-rank">결과</div>'+
               '<div class="winner-name" style="margin-left: 20px;">' + esc(r.name) + '</div>'+
               '<div class="winner-number" style="margin-left: auto; width: auto; padding: 5px 15px; border-radius: 8px; font-size: 0.95rem;">' + esc(r.prize) + '</div></div>';
    }).join('');

    spawnConfetti();
    if (aniId) cancelAnimationFrame(aniId);
    aniId = requestAnimationFrame(confettiLoopLadder);
}

function confettiLoopLadder(){
    ladCtx.clearRect(0,0,ladCvs.width,ladCvs.height);
    confetti=confetti.filter(function(c){
        c.x+=c.vx; c.y+=c.vy; c.vy+=0.05; c.rotation+=c.spin; c.life-=0.003;
        return c.life>0&&c.y<ladCvs.height+20;
    });
    // 꽃가루 배경 렌더
    confetti.forEach(function(c) {
        ladCtx.save(); ladCtx.globalAlpha=c.life; ladCtx.translate(c.x,c.y); ladCtx.rotate(c.rotation);
        ladCtx.fillStyle=c.color; ladCtx.fillRect(-c.sz/2,-c.sz/2,c.sz,c.sz*0.5); ladCtx.restore();
    });
    if(confetti.length>0) aniId=requestAnimationFrame(confettiLoopLadder);
}

function resetAllLadder() {
    stepLadderResult.classList.remove('active');
    document.getElementById('commonParticipantSection').style.display = 'flex';
    document.querySelector('.tab-container').style.display = 'flex';
    
    // 첫 준비 화면으로 초기화
    if(aniId){ cancelAnimationFrame(aniId); aniId=null; }
    balls=[]; particles=[]; confetti=[]; targets=[];
    
    // 첫 화면
    switchTab('ladder');
}

// =============================================
// [9] Web Audio API 사운드 및 유틸
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

function esc(s){
    return String(s).replace(/[&<>'"]/g,function(c){
        return({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]||c);
    });
}
