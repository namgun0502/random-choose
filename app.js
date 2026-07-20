/* ==========================================
   대포 랜덤 당첨 게임 - Cannon Draw (v2.0 완전 재작성)
   핵심 변경: 모든 DOM 요소 접근을 DOMContentLoaded 내부로 이동하여
   "null 포인터" 오류 원인을 근본적으로 제거
   ========================================== */

// =============================================
// [1] 수파베이스 연결 정보 (여기서만 수정하면 됩니다)
// =============================================
const SUPABASE_URL = "https://qzhgsshyhmnczmreagqd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6aGdzc2h5aG1uY3ptcmVhZ3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNzc0NzksImV4cCI6MjA5Nzg1MzQ3OX0.2NZxyClmIpj7WtUuZtexZqAMuTnC7udF5FejwitzvcU";

// =============================================
// [2] 전역 상태 변수 (DOM과 무관한 순수 데이터만)
// =============================================
let participants = [];      // { name, number } 형태의 참여자 목록
let winners = [];           // 당첨된 참여자 목록
let gameState = 'READY';    // 'READY' | 'PLAYING' | 'GAME_OVER'
let soundEnabled = true;
let audioCtx = null;
let supabase = null;        // 수파베이스 클라이언트 인스턴스

// 게임 진행 추적 변수
let totalShotsSelected = 1;
let remainingShotsVal = 0;

// 캔버스 애니메이션 변수
let canvas = null;
let ctx = null;
let animationFrameId = null;
let cannon = {
    x: 0, y: 0,
    angle: -Math.PI / 2,
    targetAngle: -Math.PI / 2,
    length: 50, width: 20,
    isRotating: false, baseRadius: 35
};
let targets = [];
let cannonBalls = [];
let particles = [];
let confetti = [];
let currentTargetIndex = null;
let isShooting = false;


// =============================================
// [3] 핵심 진입점: DOM이 완전히 로드된 후 실행
//     모든 document.getElementById() 는 여기서만!
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
  try {

    // --- DOM 요소 가져오기 (DOMContentLoaded 내부라 항상 안전) ---
    const stepReady   = document.getElementById('stepReady');
    const stepPlay    = document.getElementById('stepPlay');
    const stepResult  = document.getElementById('stepResult');

    const nameInput          = document.getElementById('nameInput');
    const addNameBtn         = document.getElementById('addNameBtn');
    const participantList    = document.getElementById('participantList');
    const participantCountEl = document.getElementById('participantCount');
    const cannonCountInput   = document.getElementById('cannonCountInput');
    const cannonCountVal     = document.getElementById('cannonCountVal');
    const startGameBtn       = document.getElementById('startGameBtn');

    const remainingShotsEl = document.getElementById('remainingShots');
    const fireCannonBtn    = document.getElementById('fireCannonBtn');
    const quitGameBtn      = document.getElementById('quitGameBtn');
    const canvasOverlay    = document.getElementById('canvasOverlay');

    const winnersList    = document.getElementById('winnersList');
    const restartSameBtn = document.getElementById('restartSameBtn');
    const resetAllBtn    = document.getElementById('resetAllBtn');

    const soundToggleBtn = document.getElementById('soundToggleBtn');
    const soundIcon      = document.getElementById('soundIcon');
    const soundText      = document.getElementById('soundText');

    const hitModal      = document.getElementById('hitModal');
    const hitNumberEl   = document.getElementById('hitNumber');
    const hitNameEl     = document.getElementById('hitName');
    const closeModalBtn = document.getElementById('closeModalBtn');

    canvas = document.getElementById('gameCanvas');
    ctx    = canvas.getContext('2d');

    // --- 캔버스 초기 설정 ---
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // --- 이벤트 리스너 등록 ---
    addNameBtn.addEventListener('click', handleAddName);
    nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleAddName();
    });

    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
        soundText.textContent = soundEnabled ? '소리 켬' : '소리 끔';
    });

    cannonCountInput.addEventListener('input', () => {
        totalShotsSelected = parseInt(cannonCountInput.value);
        cannonCountVal.textContent = totalShotsSelected + '회';
    });

    startGameBtn.addEventListener('click', startGame);
    quitGameBtn.addEventListener('click', quitGame);
    fireCannonBtn.addEventListener('click', triggerCannonFire);

    closeModalBtn.addEventListener('click', () => {
        hitModal.classList.remove('active');
        canvasOverlay.style.display = 'none';
        if (remainingShotsVal <= 0) {
            endGame();
        } else {
            fireCannonBtn.disabled = false;
        }
    });

    restartSameBtn.addEventListener('click', restartSameMembers);
    resetAllBtn.addEventListener('click', resetAllGame);

    // --- UI 초기 렌더링 ---
    updateUI();

    // --- 수파베이스 연결 및 데이터 로드 ---
    await connectSupabase();

    // =========================================
    // 내부 함수들 (DOM 요소를 클로저로 사용)
    // =========================================

    // 수파베이스 연결
    async function connectSupabase() {
        try {
            // CDN 로드 확인
            const makeClient = (typeof createClient !== 'undefined')
                ? createClient
                : (window.supabase ? window.supabase.createClient : null);

            if (!makeClient) {
                console.error('수파베이스 SDK가 로드되지 않았습니다.');
                return;
            }

            supabase = makeClient(SUPABASE_URL, SUPABASE_KEY);

            // 연결 테스트
            const { error } = await supabase.from('members').select('id').limit(1);
            if (error) throw error;

            console.log('수파베이스 연결 성공!');

            // 데이터 자동 로드
            await loadMembersFromSupabase();

        } catch (err) {
            console.error('수파베이스 연결 실패:', err.message);
            supabase = null;
        }
    }

    // 수파베이스에서 멤버 불러오기
    async function loadMembersFromSupabase() {
        if (!supabase) return;

        try {
            const { data, error } = await supabase
                .from('members')
                .select('name')
                .order('id', { ascending: true });

            if (error) throw error;
            if (!data || data.length === 0) return;

            // 기존 로컬 목록과 합치기 (중복 제거)
            const existingNames = participants.map(p => p.name);
            const newOnes = data
                .filter(item => !existingNames.includes(item.name))
                .map(item => ({ name: item.name, number: 0 }));

            participants = [...participants, ...newOnes];
            shuffleAndAssignNumbers();
            updateUI();

        } catch (err) {
            console.error('데이터 로드 실패:', err.message);
        }
    }

    // 이름 추가 핸들러 (동기 처리 → UI 즉시 반영)
    function handleAddName() {
        const rawName = nameInput.value.trim();

        if (!rawName) {
            alert('이름을 입력해 주세요!');
            nameInput.focus();
            return;
        }

        if (participants.some(p => p.name === rawName)) {
            alert('이미 등록된 이름입니다!');
            nameInput.focus();
            return;
        }

        // 로컬 배열에 즉시 추가 → 화면 즉시 반영
        participants.push({ name: rawName, number: 0 });
        nameInput.value = '';
        nameInput.focus();
        shuffleAndAssignNumbers();
        updateUI();

        // 수파베이스 저장 (백그라운드, UI와 독립)
        saveMemberToSupabase(rawName);
    }

    // 수파베이스에 이름 저장 (비동기, 백그라운드)
    async function saveMemberToSupabase(name) {
        if (!supabase) return;

        try {
            const { error } = await supabase
                .from('members')
                .insert([{ name }]);

            if (error && error.code !== '23505') {
                // 23505: unique violation (이미 있는 이름) - 무시
                console.warn('수파베이스 저장 실패:', error.message);
            }
        } catch (err) {
            console.error('수파베이스 저장 중 오류:', err.message);
        }
    }

    // 참여자 삭제 (이번 게임에서만 임시 제거)
    window.removeParticipant = function(name) {
        participants = participants.filter(p => p.name !== name);
        shuffleAndAssignNumbers();
        updateUI();
    };

    // 번호 무작위 배정 (Fisher-Yates 셔플)
    function shuffleAndAssignNumbers() {
        const len = participants.length;
        if (len === 0) return;

        let nums = Array.from({ length: len }, (_, i) => i + 1);
        for (let i = nums.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [nums[i], nums[j]] = [nums[j], nums[i]];
        }
        participants.forEach((p, i) => { p.number = nums[i]; });
    }

    // UI 전체 갱신
    function updateUI() {
        const count = participants.length;
        participantCountEl.textContent = count;

        if (count === 0) {
            participantList.innerHTML = '<p class="empty-message">등록된 사람이 없습니다. 이름을 추가해 주세요.</p>';
        } else {
            const sorted = [...participants].sort((a, b) => a.number - b.number);
            participantList.innerHTML = sorted.map(p => `
                <span class="chip">
                    ${escapeHTML(p.name)}
                    <span class="num-badge">${p.number}</span>
                    <button type="button" onclick="removeParticipant('${escapeHTML(p.name)}')">&times;</button>
                </span>
            `).join('');
        }

        // 슬라이더 범위 조정
        if (count > 0) {
            cannonCountInput.disabled = false;
            cannonCountInput.max = count;
            if (parseInt(cannonCountInput.value) > count) {
                cannonCountInput.value = count;
                totalShotsSelected = count;
            }
        } else {
            cannonCountInput.disabled = true;
            cannonCountInput.value = 1;
            totalShotsSelected = 1;
        }
        cannonCountVal.textContent = totalShotsSelected + '회';

        // 시작 버튼 활성화
        startGameBtn.disabled = (count === 0);
    }

    // XSS 방지용 HTML 이스케이프
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[c] || c));
    }

    // =========================================
    // 게임 진행 로직
    // =========================================

    function startGame() {
        initAudio();
        gameState = 'PLAYING';
        winners = [];
        remainingShotsVal = totalShotsSelected;
        remainingShotsEl.textContent = remainingShotsVal;

        stepReady.classList.remove('active');
        stepResult.classList.remove('active');
        stepPlay.classList.add('active');

        fireCannonBtn.disabled = false;
        canvasOverlay.style.display = 'none';

        arrangeTargets();
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        gameLoop();
    }

    function quitGame() {
        gameState = 'READY';
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        cannonBalls = []; particles = []; confetti = []; targets = [];

        stepPlay.classList.remove('active');
        stepResult.classList.remove('active');
        stepReady.classList.add('active');
    }

    function endGame() {
        gameState = 'GAME_OVER';
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

        stepPlay.classList.remove('active');
        stepReady.classList.remove('active');
        stepResult.classList.add('active');

        winnersList.innerHTML = winners.map((w, i) => `
            <div class="winner-card">
                <div class="winner-rank">${i + 1}위</div>
                <div class="winner-number">${w.number}번</div>
                <div class="winner-name">${escapeHTML(w.name)}</div>
            </div>
        `).join('');

        spawnConfetti();
    }

    async function restartSameMembers() {
        winners = [];
        gameState = 'READY';
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        cannonBalls = []; particles = []; confetti = []; targets = [];

        shuffleAndAssignNumbers();
        stepResult.classList.remove('active');
        stepPlay.classList.remove('active');
        stepReady.classList.add('active');
        updateUI();

        if (supabase) await loadMembersFromSupabase();
    }

    async function resetAllGame() {
        participants = [];
        winners = [];
        gameState = 'READY';
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        cannonBalls = []; particles = []; confetti = []; targets = [];

        nameInput.value = '';
        cannonCountInput.value = 1;
        totalShotsSelected = 1;
        cannonCountVal.textContent = '1회';

        stepPlay.classList.remove('active');
        stepResult.classList.remove('active');
        stepReady.classList.add('active');
        updateUI();

        if (supabase) await loadMembersFromSupabase();
    }

    // =========================================
    // 캔버스 & 애니메이션
    // =========================================

    function resizeCanvas() {
        if (!canvas || !canvas.parentNode) return;
        const rect = canvas.parentNode.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        cannon.x = canvas.width / 2;
        cannon.y = canvas.height - 35;
        if (gameState === 'PLAYING') arrangeTargets();
    }

    function arrangeTargets() {
        targets = [];
        const nonWinners = participants.filter(p => !winners.some(w => w.name === p.name));
        if (nonWinners.length === 0) return;

        const cols = Math.ceil(Math.sqrt(nonWinners.length));
        const rows = Math.ceil(nonWinners.length / cols);
        const cellW = canvas.width / (cols + 1);
        const cellH = (canvas.height * 0.6) / (rows + 1);

        nonWinners.forEach((p, i) => {
            targets.push({
                x: cellW * ((i % cols) + 1),
                y: cellH * (Math.floor(i / cols) + 1) + 30,
                radius: 28,
                number: p.number,
                name: p.name,
                alive: true,
                opacity: 1,
                scale: 1
            });
        });
    }

    function triggerCannonFire() {
        if (isShooting || remainingShotsVal <= 0) return;
        const aliveTargets = targets.filter(t => t.alive);
        if (aliveTargets.length === 0) return;

        isShooting = true;
        fireCannonBtn.disabled = true;
        canvasOverlay.style.display = 'block';

        currentTargetIndex = Math.floor(Math.random() * aliveTargets.length);
        const target = aliveTargets[currentTargetIndex];

        const dx = target.x - cannon.x;
        const dy = target.y - cannon.y;
        cannon.targetAngle = Math.atan2(dy, dx);
        cannon.isRotating = true;

        setTimeout(() => {
            fireAt(target);
        }, 800);
    }

    function fireAt(target) {
        const angle = cannon.angle;
        cannonBalls.push({
            x: cannon.x + Math.cos(angle) * (cannon.length + cannon.baseRadius),
            y: cannon.y + Math.sin(angle) * (cannon.length + cannon.baseRadius),
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            target,
            radius: 8,
            trail: []
        });
        spawnMuzzleParticles(cannon.x, cannon.y, angle);
        playShootSound();
    }

    function gameLoop() {
        animationFrameId = requestAnimationFrame(gameLoop);
        update();
        draw();
    }

    function update() {
        // 대포 회전
        if (cannon.isRotating) {
            const diff = cannon.targetAngle - cannon.angle;
            cannon.angle += diff * 0.1;
            if (Math.abs(diff) < 0.01) {
                cannon.angle = cannon.targetAngle;
                cannon.isRotating = false;
            }
        }

        // 대포알 이동
        cannonBalls = cannonBalls.filter(ball => {
            ball.trail.push({ x: ball.x, y: ball.y });
            if (ball.trail.length > 10) ball.trail.shift();

            const dx = ball.target.x - ball.x;
            const dy = ball.target.y - ball.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < ball.radius + ball.target.radius) {
                // 명중!
                hitTarget(ball.target);
                return false;
            }

            ball.vx = dx / dist * 12;
            ball.vy = dy / dist * 12;
            ball.x += ball.vx;
            ball.y += ball.vy;
            return true;
        });

        // 파티클 업데이트
        particles = particles.filter(p => {
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.15;
            p.life -= 0.02;
            p.radius *= 0.97;
            return p.life > 0;
        });

        // 꽃가루 업데이트
        confetti = confetti.filter(c => {
            c.x += c.vx; c.y += c.vy;
            c.vy += 0.05;
            c.rotation += c.spin;
            c.life -= 0.005;
            return c.life > 0 && c.y < canvas.height + 20;
        });

        // 과녁 소멸 애니메이션
        targets.forEach(t => {
            if (!t.alive) {
                t.opacity -= 0.05;
                t.scale += 0.05;
            }
        });
    }

    function hitTarget(target) {
        target.alive = false;
        const winner = participants.find(p => p.number === target.number);
        if (winner) winners.push(winner);

        spawnExplosionParticles(target.x, target.y);
        playHitSound();

        remainingShotsVal--;
        remainingShotsEl.textContent = remainingShotsVal;

        isShooting = false;
        cannon.isRotating = false;

        setTimeout(() => {
            // 모달 표시
            hitNumberEl.textContent = target.number;
            hitNameEl.textContent = target.name;
            hitModal.classList.add('active');

            targets = targets.filter(t => t.alive);
            arrangeTargets();
        }, 500);
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawBackground();
        drawConfetti();
        drawTargets();
        drawBallTrails();
        drawCannonBalls();
        drawParticles();
        drawCannon();
    }

    function drawBackground() {
        ctx.fillStyle = 'rgba(10, 11, 25, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawCannon() {
        ctx.save();
        ctx.translate(cannon.x, cannon.y);

        // 포신
        ctx.save();
        ctx.rotate(cannon.angle);
        const grad = ctx.createLinearGradient(0, -cannon.width / 2, 0, cannon.width / 2);
        grad.addColorStop(0, '#9ba3b8');
        grad.addColorStop(0.5, '#d0d5e0');
        grad.addColorStop(1, '#7a8090');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(cannon.baseRadius - 5, -cannon.width / 2, cannon.length, cannon.width, 4);
        ctx.fill();
        ctx.restore();

        // 포대 받침
        const baseGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, cannon.baseRadius);
        baseGrad.addColorStop(0, '#4a5568');
        baseGrad.addColorStop(1, '#2d3748');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.arc(0, 0, cannon.baseRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,242,254,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    function drawTargets() {
        targets.forEach(t => {
            if (t.opacity <= 0) return;
            ctx.save();
            ctx.globalAlpha = t.opacity;
            ctx.translate(t.x, t.y);
            ctx.scale(t.scale, t.scale);

            // 외곽 원
            const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, t.radius);
            grad.addColorStop(0, '#1a1f4e');
            grad.addColorStop(1, '#0d1030');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 번호
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${t.radius * 0.8}px Outfit`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t.number, 0, 0);

            ctx.restore();
        });
    }

    function drawCannonBalls() {
        cannonBalls.forEach(ball => {
            const grad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.radius);
            grad.addColorStop(0, '#fffde7');
            grad.addColorStop(0.5, '#ff9800');
            grad.addColorStop(1, '#e65100');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawBallTrails() {
        cannonBalls.forEach(ball => {
            ball.trail.forEach((pt, i) => {
                ctx.globalAlpha = (i / ball.trail.length) * 0.4;
                ctx.fillStyle = '#ff9800';
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, ball.radius * (i / ball.trail.length), 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        });
    }

    function drawParticles() {
        particles.forEach(p => {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function drawConfetti() {
        confetti.forEach(c => {
            ctx.save();
            ctx.globalAlpha = c.life;
            ctx.translate(c.x, c.y);
            ctx.rotate(c.rotation);
            ctx.fillStyle = c.color;
            ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.5);
            ctx.restore();
        });
    }

    function spawnMuzzleParticles(x, y, angle) {
        for (let i = 0; i < 20; i++) {
            const spread = (Math.random() - 0.5) * 1.2;
            const speed = Math.random() * 5 + 3;
            particles.push({
                x, y,
                vx: Math.cos(angle + spread) * speed,
                vy: Math.sin(angle + spread) * speed,
                radius: Math.random() * 5 + 2,
                color: ['#ff9800', '#ffeb3b', '#ff5722', '#fff'][Math.floor(Math.random() * 4)],
                life: 1
            });
        }
    }

    function spawnExplosionParticles(x, y) {
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 6 + 2,
                color: ['#ff3366', '#ff9800', '#ffeb3b', '#00f2fe', '#fff'][Math.floor(Math.random() * 5)],
                life: 1
            });
        }
    }

    function spawnConfetti() {
        for (let i = 0; i < 120; i++) {
            confetti.push({
                x: Math.random() * canvas.width,
                y: -10,
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 4 + 1,
                size: Math.random() * 10 + 5,
                rotation: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 0.2,
                color: ['#ff3366', '#00f2fe', '#ffeb3b', '#a78bfa', '#34d399'][Math.floor(Math.random() * 5)],
                life: 1
            });
        }
        if (gameState === 'GAME_OVER') {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(function loop() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                confetti = confetti.filter(c => {
                    c.x += c.vx; c.y += c.vy;
                    c.vy += 0.05;
                    c.rotation += c.spin;
                    c.life -= 0.003;
                    return c.life > 0 && c.y < canvas.height + 20;
                });
                drawConfetti();
                if (confetti.length > 0) animationFrameId = requestAnimationFrame(loop);
            });
        }
    }

    // =========================================
    // Web Audio API 사운드
    // =========================================

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playShootSound() {
        if (!soundEnabled || !audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.3);
    }

    function playHitSound() {
        if (!soundEnabled || !audioCtx) return;
        [400, 600, 800].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.3);
            osc.start(audioCtx.currentTime + i * 0.1);
            osc.stop(audioCtx.currentTime + i * 0.1 + 0.3);
        });
    }

  } catch (err) {
    // 초기화 중 오류 발생 시 사용자에게 알림
    alert('앱 초기화 오류: ' + err.message + '\n\n개발자 콘솔(F12)에서 자세한 내용을 확인하세요.');
    console.error('초기화 오류:', err);
  }
}); // DOMContentLoaded 종료
