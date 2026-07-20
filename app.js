/* ==========================================
   대포 랜덤 당첨 게임 - Cannon Draw JavaScript
   작성자: Antigravity
   기능: 참여자 관리, 실시간 셔플, Canvas 애니메이션, Web Audio API 사운드 합성
   ========================================== */

// 1. 전역 상태 관리 변수들
let participants = []; // { name: 이름, number: 배정 번호 }
let winners = [];       // 당첨된 참여자들의 목록
let soundEnabled = true; // 사운드 재생 활성화 여부
let audioCtx = null;     // Web Audio Context 객체

// 게임 상태: 'READY' (준비), 'PLAYING' (플레이 중), 'GAME_OVER' (결과화면)
let gameState = 'READY';

// Supabase 클라이언트 및 설정 상태 변수들
let supabase = null;
let supabaseUrl = '';
let supabaseKey = '';

// ==========================================
// ⚠️ [기본 Supabase 설정] 항상 연동되도록 여기에 적어둡니다! (v1.3)
// ==========================================
const DEFAULT_SUPABASE_URL = "https://qzhgsshyhmnczmreagqd.supabase.co"; 
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6aGdzc2h5aG1uY3ptcmVhZ3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNzc0NzksImV4cCI6MjA5Nzg1MzQ3OX0.2NZxyClmIpj7WtUuZtexZqAMuTnC7udF5FejwitzvcU";

// Canvas 관련 변수 (null 체크로 스크립트 충돌 방지)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let animationFrameId = null;

// 게임 애니메이션 객체들
let cannon = {
    x: 0,
    y: 0,
    angle: -Math.PI / 2, // 90도 (위쪽 방향)
    targetAngle: -Math.PI / 2,
    length: 50,
    width: 20,
    isRotating: false,
    baseRadius: 35
};

let targets = []; // 캔버스 위에 그려질 숫자 과녁들
let cannonBalls = []; // 쏘아 올려진 대포알 목록
let particles = []; // 대포 발사 화염 및 폭발 불꽃/연기 파티클
let confetti = []; // 최종 당첨 시 휘날릴 꽃가루 파티클

// 사격 타겟 추적 변수
let currentTargetIndex = null;
let isShooting = false;
let totalShotsSelected = 1;
let remainingShotsVal = 0;

// 2. DOM 요소들 가져오기
const stepReady = document.getElementById('stepReady');
const stepPlay = document.getElementById('stepPlay');
const stepResult = document.getElementById('stepResult');

const nameInput = document.getElementById('nameInput');
const addNameBtn = document.getElementById('addNameBtn');
const participantList = document.getElementById('participantList');
const participantCountSpan = document.getElementById('participantCount');
const cannonCountInput = document.getElementById('cannonCountInput');
const cannonCountVal = document.getElementById('cannonCountVal');
const startGameBtn = document.getElementById('startGameBtn');

const remainingShotsSpan = document.getElementById('remainingShots');
const fireCannonBtn = document.getElementById('fireCannonBtn');
const quitGameBtn = document.getElementById('quitGameBtn');
const canvasOverlay = document.getElementById('canvasOverlay');

const winnersList = document.getElementById('winnersList');
const restartSameBtn = document.getElementById('restartSameBtn');
const resetAllBtn = document.getElementById('resetAllBtn');

const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundIcon = document.getElementById('soundIcon');
const soundText = document.getElementById('soundText');

const hitModal = document.getElementById('hitModal');
const hitNumber = document.getElementById('hitNumber');
const hitName = document.getElementById('hitName');
const closeModalBtn = document.getElementById('closeModalBtn');


// 3. 초기화 설정 및 이벤트 바인딩
async function initializeApp() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupEvents();
    updateUI();

    // 페이지 접속 시 자동 연결 및 인원 로드
    await initSupabase();
    if (supabase) {
        // silent=false로 설정하여 접속 성공/실패 여부를 팝업으로 사용자에게 명시적으로 알립니다.
        await fetchSupabaseMembers(false); 
    }
}

// DOM 로딩 완료 상태에 맞춰 안전하게 초기화 실행
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Canvas 크기 조절 함수 (반응형 16:10 비율 유지)
function resizeCanvas() {
    const rect = canvas.parentNode.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // 대포 위치 리셋 (하단 중앙)
    cannon.x = canvas.width / 2;
    cannon.y = canvas.height - 35;
    
    // 플레이 중일 때 캔버스 크기가 바뀌면 과녁 좌표도 재조정
    if (gameState === 'PLAYING') {
        arrangeTargets();
    }
}

// 이벤트 핸들러 등록
function setupEvents() {
    // 이름 등록 이벤트 (엔터 키 지원)
    addNameBtn.addEventListener('click', handleAddName);
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleAddName();
        }
    });

    // 사운드 토글
    soundToggleBtn.addEventListener('click', toggleSound);

    // 대포 발사 횟수 슬라이더 조절
    cannonCountInput.addEventListener('input', () => {
        totalShotsSelected = parseInt(cannonCountInput.value);
        cannonCountVal.textContent = totalShotsSelected + '회';
    });

    // 게임 시작 버튼
    startGameBtn.addEventListener('click', startGame);

    // 게임 중단 버튼
    quitGameBtn.addEventListener('click', quitGame);

    // 대포 발사 버튼
    fireCannonBtn.addEventListener('click', triggerCannonFire);

    // 모달 닫기 버튼 (당첨자 확인 완료)
    closeModalBtn.addEventListener('click', () => {
        hitModal.classList.remove('active');
        canvasOverlay.style.display = 'none'; // 차단 해제
        
        // 남은 발사 횟수가 없으면 최종 결과 화면으로 이동
        if (remainingShotsVal <= 0) {
            endGame();
        } else {
            // 아직 남았으면 대포 발사 버튼 활성화
            fireCannonBtn.disabled = false;
        }
    });

    // 결과 화면 제어 버튼들
    restartSameBtn.addEventListener('click', restartSameMembers);
    resetAllBtn.addEventListener('click', resetAllGame);
}

// 4. 사운드 효과음 합성 엔진 (Web Audio API 사용)
function initAudio() {
    if (!audioCtx) {
        // 브라우저의 오디오 맥락 생성 (크롬 등 보안 차단 우회용)
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
        soundIcon.textContent = '🔊';
        soundText.textContent = '소리 켬';
    } else {
        soundIcon.textContent = '🔇';
        soundText.textContent = '소리 끔';
    }
}

// 대포 발사 효과음 (Low synth sweep + White noise)
function playFireSound() {
    if (!soundEnabled) return;
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    
    // 웅장한 베이스 포성을 만드는 사인파 오실레이터
    const osc = audioCtx.createOscillator();
    const gainOsc = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(10, t + 0.4); // 주파수 급락 (쿵!)
    
    gainOsc.gain.setValueAtTime(0.6, t);
    gainOsc.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
    
    // 폭발적인 찰나의 노이즈
    const noiseBufferSize = audioCtx.sampleRate * 0.3; // 0.3초 화이트 노이즈
    const buffer = audioCtx.createBuffer(1, noiseBufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseBufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(800, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    
    const gainNoise = audioCtx.createGain();
    gainNoise.gain.setValueAtTime(0.4, t);
    gainNoise.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    
    // 노드 연결
    osc.connect(gainOsc);
    gainOsc.connect(audioCtx.destination);
    
    noiseNode.connect(noiseFilter);
    noiseFilter.connect(gainNoise);
    gainNoise.connect(audioCtx.destination);
    
    // 재생 시작
    osc.start(t);
    osc.stop(t + 0.5);
    noiseNode.start(t);
    noiseNode.stop(t + 0.35);
}

// 과녁 폭발 효과음 (강한 White noise decay + bandpass filter)
function playExplodeSound() {
    if (!soundEnabled) return;
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    
    // 화이트 노이즈 버퍼 생성 (0.7초)
    const noiseBufferSize = audioCtx.sampleRate * 0.7;
    const buffer = audioCtx.createBuffer(1, noiseBufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseBufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    
    // 로우패스 필터로 화염 터지는 둔탁한 소리 표현
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.65);
    
    // 디스토션과 배음용 밴드패스
    const bandFilter = audioCtx.createBiquadFilter();
    bandFilter.type = 'bandpass';
    bandFilter.frequency.setValueAtTime(300, t);
    bandFilter.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    bandFilter.Q.value = 1.0;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);
    
    // 연결
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noiseNode.connect(bandFilter);
    bandFilter.connect(gain);
    
    noiseNode.start(t);
    noiseNode.stop(t + 0.75);
}

// 🏆 최종 승리 축하 팡파레 효과음 (경쾌한 사인파 음계 연주)
function playVictorySound() {
    if (!soundEnabled) return;
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // 도 미 솔 도 미 솔 도
    const duration = 0.12;

    notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * duration);
        
        gain.gain.setValueAtTime(0.3, t + idx * duration);
        gain.gain.exponentialRampToValueAtTime(0.01, t + idx * duration + 0.15);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(t + idx * duration);
        osc.stop(t + idx * duration + 0.2);
    });
}


// 5. 비즈니스 로직 (참여자 관리 및 셔플 알고리즘)

// 참여자 추가 핸들러 (동기 처리 - UI 즉시 반영)
function handleAddName() {
    try {
        const rawName = nameInput.value.trim();
        if (!rawName) {
            alert("이름을 입력해 주세요!");
            nameInput.focus();
            return;
        }

        if (participants.some(p => p.name === rawName)) {
            alert("이미 등록된 이름입니다. 다른 이름이나 구분 가능한 표시를 넣어주세요!");
            nameInput.focus();
            return;
        }

        // ① 로컬 배열에 추가
        participants.push({ name: rawName, number: 0 });
        nameInput.value = "";
        nameInput.focus();
        shuffleAndAssignNumbers();
        updateUI();

        // ② Supabase 저장 (백그라운드 동작 - UI와 독립)
        saveNameToSupabase(rawName);

    } catch (err) {
        // 숨겨진 에러가 있으면 화면에 알려드립니다
        alert("오류 발생: " + err.message + "\n\nF12 → Console 탭에서 자세한 내용을 확인하세요.");
        console.error("handleAddName 에러:", err);
    }
}

// Supabase DB에 이름을 영구 저장하는 비동기 함수 (handleAddName과 분리)
async function saveNameToSupabase(name) {
    if (!supabase) {
        alert("수파베이스에 연결되어 있지 않아 서버에 저장할 수 없습니다.\n화면에는 임시로 추가되지만, 새로고침 시 사라집니다.");
        return;
    }

    try {
        const { error } = await supabase
            .from('members')
            .insert([{ name: name }]);

        if (error) {
            if (error.code === '23505') {
                // 이미 존재함
                console.warn("Supabase 중복 데이터:", name);
            } else {
                alert("수파베이스에 이름을 저장하지 못했습니다.\n오류 내용: " + error.message + " (코드: " + error.code + ")");
            }
        } else {
            console.log(`Supabase 저장 완료: ${name}`);
        }
    } catch (err) {
        alert("수파베이스 전송 중 네트워크 오류가 발생했습니다: " + err.message);
        console.error("Supabase 저장 중 오류:", err);
    }
}

// 참여자 삭제 핸들러 - 이번 게임에서만 임시 제외 (Supabase DB에는 영향 없음)
function removeParticipant(name) {
    participants = participants.filter(p => p.name !== name);
    shuffleAndAssignNumbers();
    updateUI();
}

// 1부터 N까지의 고유 번호를 셔플하여 각 참여자에게 겹치지 않게 배정하는 알고리즘
function shuffleAndAssignNumbers() {
    const len = participants.length;
    if (len === 0) return;

    // 1부터 N까지의 번호 배열 생성
    let numberList = Array.from({ length: len }, (_, idx) => idx + 1);

    // Fisher-Yates 셔플 알고리즘으로 무작위 믹스
    for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = numberList[i];
        numberList[i] = numberList[j];
        numberList[j] = temp;
    }

    // 각각 매핑
    participants.forEach((p, idx) => {
        p.number = numberList[idx];
    });
}

// 상태에 맞추어 DOM 인터페이스를 변경하는 함수
function updateUI() {
    // 1. 등록 인원 수 업데이트
    const count = participants.length;
    participantCountSpan.textContent = count;

    // 2. 칩 목록 다시 그리기
    if (count === 0) {
        participantList.innerHTML = `<p class="empty-message">등록된 사람이 없습니다. 이름을 입력하여 추가해 주세요.</p>`;
    } else {
        // 번호 순서대로 정렬하여 칩을 보여주면 보기에 좋습니다.
        const sorted = [...participants].sort((a, b) => a.number - b.number);
        participantList.innerHTML = sorted.map(p => `
            <span class="chip">
                ${escapeHTML(p.name)} 
                <span class="num-badge">${p.number}</span>
                <button type="button" onclick="removeParticipant('${escapeHTML(p.name)}')">&times;</button>
            </span>
        `).join('');
    }

    // 3. 대포 발사 횟수 슬라이더 범위 제어
    if (count > 0) {
        cannonCountInput.disabled = false;
        cannonCountInput.max = count;
        
        // 현재 슬라이더 값이 최댓값을 넘으면 최댓값으로 축소 조정
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

    // 4. 게임 시작 버튼 활성화/비활성화
    // 최소 1명 이상 등록 시 게임 시작 가능
    if (count > 0) {
        startGameBtn.disabled = false;
    } else {
        startGameBtn.disabled = true;
    }
}

// HTML 이스케이프 유틸리티 (XSS 방지)
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}


// 6. 게임 구동 및 Canvas 제어

// 게임 시작
function startGame() {
    // 오디오 컨텍스트 활성화
    initAudio();

    gameState = 'PLAYING';
    winners = [];
    remainingShotsVal = totalShotsSelected;
    remainingShotsSpan.textContent = remainingShotsVal;
    
    // UI 섹션 전환
    stepReady.classList.remove('active');
    stepResult.classList.remove('active');
    stepPlay.classList.add('active');

    fireCannonBtn.disabled = false;
    canvasOverlay.style.display = 'none';

    // Canvas 초기 세팅
    resizeCanvas();
    arrangeTargets();
    
    // 애니메이션 초기화
    cannonBalls = [];
    particles = [];
    confetti = [];
    isShooting = false;
    currentTargetIndex = null;
    cannon.angle = -Math.PI / 2;
    cannon.targetAngle = -Math.PI / 2;

    // 렌더링 루프 시작
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    gameLoop();
}

// 게임 중단
function quitGame() {
    if (confirm("정말로 게임을 중단하고 설정 화면으로 돌아가시겠습니까?")) {
        gameState = 'READY';
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        
        stepPlay.classList.remove('active');
        stepResult.classList.remove('active');
        stepReady.classList.add('active');
        
        updateUI();
    }
}

// 과녁 배치 로직 (격자형 또는 줄바꿈 최적화 배치)
function arrangeTargets() {
    targets = [];
    const len = participants.length;
    if (len === 0) return;

    // 한 줄에 최대 배치할 과녁의 수 지정
    let cols = 5;
    if (len <= 4) cols = len;
    else if (len <= 8) cols = Math.ceil(len / 2);
    else cols = Math.ceil(len / 3);

    const rows = Math.ceil(len / cols);
    const cellWidth = canvas.width / (cols + 1);
    const cellHeight = 70; // 세로 간격
    const startY = 60;     // 시작 Y 좌표

    // 참여자 번호 역추적을 편하게 하기 위해 정렬
    const sorted = [...participants].sort((a, b) => a.number - b.number);

    // 과녁 색상 리스트 (다채로운 네온 컬러)
    const colorPalette = [
        '#ff3366', '#00f2fe', '#ffd200', '#4facfe', '#00ff66', 
        '#d5006d', '#ab47bc', '#ff9100', '#2979ff', '#00e5ff'
    ];

    sorted.forEach((p, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        
        // 현재 행의 실제 컬럼 수 계산 (마지막 줄 보정용)
        const itemsInThisRow = (row === rows - 1) ? (len - row * cols) : cols;
        const rowOffset = (canvas.width - (itemsInThisRow - 1) * cellWidth) / 2;

        targets.push({
            x: rowOffset + col * cellWidth,
            y: startY + row * cellHeight,
            number: p.number,
            name: p.name,
            isHit: false,
            radius: 24,
            pulse: 0,
            pulseDir: 1,
            color: colorPalette[idx % colorPalette.length]
        });
    });
}

// 대포 발사 트리거 버튼 클릭 시 실행
function triggerCannonFire() {
    if (isShooting || remainingShotsVal <= 0) return;

    // 1. 아직 맞지 않은 과녁 리스트 추출
    const aliveTargets = targets.filter(t => !t.isHit);
    if (aliveTargets.length === 0) return;

    isShooting = true;
    fireCannonBtn.disabled = true; // 대포 발사 버튼 비활성화 (다발 방지)
    canvasOverlay.style.display = 'block'; // 클릭 차단 오버레이 가동

    // 2. 생존 타겟 중에서 랜덤으로 한 명의 당첨자 선택
    const luckyTarget = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
    
    // 전체 과녁 배열에서의 인덱스 찾기
    currentTargetIndex = targets.findIndex(t => t.number === luckyTarget.number);
    
    // 3. 대포 각도 조준 각도 계산
    const dx = luckyTarget.x - cannon.x;
    const dy = luckyTarget.y - cannon.y;
    cannon.targetAngle = Math.atan2(dy, dx);
    cannon.isRotating = true;
}

// 대포알 진짜 발사!
function fireProjectile() {
    playFireSound();
    
    const angle = cannon.angle;
    // 대포 포신 끝 좌표 계산
    const barrelX = cannon.x + Math.cos(angle) * cannon.length;
    const barrelY = cannon.y + Math.sin(angle) * cannon.length;

    // 포탄 생성
    const speed = 12;
    cannonBalls.push({
        x: barrelX,
        y: barrelY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 10,
        color: '#ffffff',
        targetIdx: currentTargetIndex
    });

    // 대포 발사 화염 파티클 뿜뿜!
    createMuzzleFlash(barrelX, barrelY, angle);
}

// 대포 구멍에서 불꽃 연기 발사 연출
function createMuzzleFlash(x, y, angle) {
    // 화염 스파크 파티클 생성
    for (let i = 0; i < 20; i++) {
        const pAngle = angle + (Math.random() - 0.5) * 0.6; // 각도 분산
        const speed = 3 + Math.random() * 6;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(pAngle) * speed,
            vy: Math.sin(pAngle) * speed,
            radius: 3 + Math.random() * 5,
            color: Math.random() > 0.4 ? '#ff3366' : '#ffd200',
            alpha: 1.0,
            decay: 0.04 + Math.random() * 0.05,
            type: 'fire'
        });
    }

    // 연기 파티클 생성
    for (let i = 0; i < 10; i++) {
        const pAngle = angle + (Math.random() - 0.5) * 0.8;
        const speed = 1 + Math.random() * 3;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(pAngle) * speed,
            vy: Math.sin(pAngle) * speed,
            radius: 8 + Math.random() * 12,
            color: 'rgba(150, 150, 160, 0.4)',
            alpha: 0.8,
            decay: 0.02 + Math.random() * 0.03,
            type: 'smoke'
        });
    }
}

// 과녁 폭파 연출
function createExplosion(x, y, color) {
    playExplodeSound();

    // 1. 파편 스파크 효과
    for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 8;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 2 + Math.random() * 4,
            color: color,
            alpha: 1.0,
            decay: 0.02 + Math.random() * 0.03,
            gravity: 0.1, // 중력 하강 효과
            type: 'spark'
        });
    }

    // 2. 잔흔 연기 서클 효과
    for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 2;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 12 + Math.random() * 15,
            color: 'rgba(255, 100, 100, 0.2)',
            alpha: 0.7,
            decay: 0.015 + Math.random() * 0.01,
            type: 'smoke'
        });
    }
}

// 당첨자 모달 노출 및 기록
function handleHit(target) {
    target.isHit = true;
    remainingShotsVal--;
    remainingShotsSpan.textContent = remainingShotsVal;

    // 당첨 배열에 기록 저장
    winners.push({
        rank: winners.length + 1,
        name: target.name,
        number: target.number
    });

    // 팝업 정보 업데이트 및 노출
    hitNumber.textContent = target.number;
    hitName.textContent = target.name;
    hitModal.classList.add('active');

    isShooting = false;
}

// 7. 게임 프레임 드로잉 및 업데이트 루프
function gameLoop() {
    if (gameState !== 'PLAYING') return;

    // 캔버스 잔상 지우기
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updatePhysics();
    drawGame();

    animationFrameId = requestAnimationFrame(gameLoop);
}

// 물리 상태 변경 및 조준/충돌 처리
function updatePhysics() {
    // 1. 대포 조준 각도 회전
    if (cannon.isRotating) {
        const angleDiff = cannon.targetAngle - cannon.angle;
        // 각도 최단거리 회전 보정
        const step = 0.08;
        if (Math.abs(angleDiff) > step) {
            cannon.angle += Math.sign(angleDiff) * step;
        } else {
            cannon.angle = cannon.targetAngle;
            cannon.isRotating = false;
            // 회전 완료 후 대포알 발사!
            fireProjectile();
        }
    }

    // 2. 포탄 이동 및 명중 검사
    for (let i = cannonBalls.length - 1; i >= 0; i--) {
        const ball = cannonBalls[i];
        ball.x += ball.vx;
        ball.y += ball.vy;

        // 화면 밖으로 벗어난 탄환 제거
        if (ball.x < 0 || ball.x > canvas.width || ball.y < 0 || ball.y > canvas.height) {
            cannonBalls.splice(i, 1);
            continue;
        }

        // 대상 과녁과의 충돌 여부 감증
        const target = targets[ball.targetIdx];
        if (target && !target.isHit) {
            const dx = ball.x - target.x;
            const dy = ball.y - target.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 포탄 반경 + 과녁 반경 이내 도달 시
            if (dist <= target.radius + ball.radius) {
                // 폭발 스파크 스폰
                createExplosion(target.x, target.y, target.color);
                // 모달 띄우기 및 당첨 처리
                handleHit(target);
                // 포탄 파괴
                cannonBalls.splice(i, 1);
            }
        }
    }

    // 3. 파티클 수명 감쇠 및 제거
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        
        // 중력 작용 파티클
        if (p.gravity) {
            p.vy += p.gravity;
        }
        
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }

    // 4. 과녁 둥둥 뜨는 펄스 옥션 효과
    targets.forEach(t => {
        if (!t.isHit) {
            t.pulse += 0.05 * t.pulseDir;
            if (t.pulse > 3) {
                t.pulse = 3;
                t.pulseDir = -1;
            } else if (t.pulse < -3) {
                t.pulse = -3;
                t.pulseDir = 1;
            }
        }
    });

    // 5. 폭죽(꽃가루) 효과 물리 연출 (상시 구동)
    for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.x += c.vx;
        c.y += c.vy;
        c.vy += c.gravity; // 중력
        c.rotation += c.rotationSpeed;
        c.life -= 1;

        if (c.life <= 0 || c.y > canvas.height) {
            confetti.splice(i, 1);
        }
    }
}

// 캔버스 내부 요소 직접 드로잉
function drawGame() {
    // 1. 등록된 모든 번호판 과녁 그리기
    targets.forEach(t => {
        if (t.isHit) return; // 이미 깨진 과녁은 숨김

        ctx.save();
        ctx.translate(t.x, t.y + t.pulse);

        // 네온 글로우 스타일 광채 추가
        ctx.shadowBlur = 15;
        ctx.shadowColor = t.color;

        // 원형 과녁 그리기
        ctx.beginPath();
        ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(26, 29, 54, 0.95)';
        ctx.fill();
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 3;
        ctx.stroke();

        // 내부 서브 링 그리기
        ctx.beginPath();
        ctx.arc(0, 0, t.radius - 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 숫자 텍스트 표시
        ctx.shadowBlur = 0; // 텍스트 번짐 방지
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 16px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.number, 0, -2);

        // 아래 조그맣게 이름 레이블 표시
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '500 9px "Noto Sans KR", sans-serif';
        ctx.fillText(t.name, 0, t.radius + 15);

        ctx.restore();
    });

    // 2. 대포알 드로잉
    cannonBalls.forEach(b => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        
        // 포탄 광채
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00f2fe';
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        
        ctx.restore();
    });

    // 3. 발사/폭발 파티클 드로잉
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        
        if (p.type === 'smoke') {
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        } else {
            // 불꽃은 번짐 추가
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        ctx.restore();
    });

    // 4. 대포 그리기 (회전 고려)
    ctx.save();
    ctx.translate(cannon.x, cannon.y);
    ctx.rotate(cannon.angle);

    // 대포 포신 그림자 및 조준선 궤적 유도
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255, 51, 102, 0.4)';

    // 대포 포신
    ctx.fillStyle = 'linear-gradient(to right, #2a2e4f, #181b33)';
    // 실제 다크 그라데이션 선언
    const barrelGrad = ctx.createLinearGradient(0, -cannon.width/2, 0, cannon.width/2);
    barrelGrad.addColorStop(0, '#3f477a');
    barrelGrad.addColorStop(0.5, '#1e2242');
    barrelGrad.addColorStop(1, '#0e1022');
    
    ctx.fillStyle = barrelGrad;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(0, -cannon.width / 2, cannon.length, cannon.width);
    ctx.fill();
    ctx.stroke();

    // 대포 머리 입구 장식 림(Rim)
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.rect(cannon.length - 4, -cannon.width / 2 - 2, 4, cannon.width + 4);
    ctx.fill();

    ctx.restore();

    // 5. 대포 스탠드 (고정형 베이스)
    ctx.save();
    ctx.translate(cannon.x, cannon.y);
    
    // 원형 기어
    ctx.beginPath();
    ctx.arc(0, 0, cannon.baseRadius, Math.PI, 0); // 반원
    const baseGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, cannon.baseRadius);
    baseGrad.addColorStop(0, '#4facfe');
    baseGrad.addColorStop(1, '#121424');
    ctx.fillStyle = baseGrad;
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(79, 172, 254, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 중앙 코어 조인트
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3366';
    ctx.fill();

    ctx.restore();

    // 6. 폭죽(Confetti) 드로잉 (꽃가루 날림)
    confetti.forEach(c => {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rotation);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.width / 2, -c.height / 2, c.width, c.height);
        ctx.restore();
    });
}


// 8. 게임 종료 및 최종 결과 페이지 연동

// 게임 완주 (모든 탄수 소비 시 호출)
function endGame() {
    gameState = 'GAME_OVER';
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    // 결과 팡파레 재생
    playVictorySound();

    // UI 변경
    stepPlay.classList.remove('active');
    stepReady.classList.remove('active');
    stepResult.classList.add('active');

    // 당첨자 리스트 돔에 렌더링
    winnersList.innerHTML = winners.map(w => `
        <div class="winner-card" style="animation-delay: ${w.rank * 0.15}s">
            <div class="winner-rank-info">
                <span class="winner-rank">#${w.rank}</span>
                <span class="winner-name">${escapeHTML(w.name)}</span>
            </div>
            <span class="winner-number">${w.number}번</span>
        </div>
    `).join('');

    // 백그라운드 캔버스 드로잉 유지 및 화려한 폭죽 세례 살리기
    runVictoryCelebration();
}

// 꽃가루(Confetti) 파티클 생성기
function triggerConfettiBurst() {
    const colors = ['#ff3366', '#00f2fe', '#ffd200', '#4facfe', '#ff00ff', '#ffffff'];
    for (let i = 0; i < 15; i++) {
        confetti.push({
            x: Math.random() * canvas.width,
            y: -10,
            vx: (Math.random() - 0.5) * 4,
            vy: 2 + Math.random() * 5,
            width: 8 + Math.random() * 8,
            height: 4 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            gravity: 0.05 + Math.random() * 0.05,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.2,
            life: 200 + Math.random() * 100
        });
    }
}

// 최종 당첨 축하 렌더 루프
function runVictoryCelebration() {
    if (gameState !== 'GAME_OVER') return;

    // 잔상 클리어
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 일정 빈도로 꽃가루 떨어뜨리기
    if (Math.random() < 0.15) {
        triggerConfettiBurst();
    }

    // 물리 업데이트 및 그리기
    for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.x += c.vx;
        c.y += c.vy;
        c.vy += c.gravity;
        c.rotation += c.rotationSpeed;
        c.life -= 1;

        if (c.life <= 0 || c.y > canvas.height) {
            confetti.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rotation);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.width / 2, -c.height / 2, c.width, c.height);
        ctx.restore();
    }

    requestAnimationFrame(runVictoryCelebration);
}

// 같은 멤버로 번호만 섞어서 리플레이
function restartSameMembers() {
    if (participants.length === 0) return;
    
    // 번호 재셔플
    shuffleAndAssignNumbers();
    
    // 게임 시작
    startGame();
}

// 완전 초기화 및 새 판 짜기
async function resetAllGame() {
    participants = [];
    winners = [];
    gameState = 'READY';
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    // UI 초기화
    nameInput.value = "";
    cannonCountInput.value = 1;
    totalShotsSelected = 1;
    cannonCountVal.textContent = '1회';
    
    stepPlay.classList.remove('active');
    stepResult.classList.remove('active');
    stepReady.classList.add('active');
    
    updateUI();

    // Supabase가 연결되어 있으면 다시 깨끗하게 원본 데이터를 채워줍니다.
    if (supabase) {
        await fetchSupabaseMembers(true);
    }
}

// ==========================================
// Supabase 클라이언트 초기화 및 데이터 연동 함수
// ==========================================

// Supabase 초기화 함수
async function initSupabase() {
    // 1. 코드 상단의 기본값(DEFAULT)이 먼저 입력되어 있는지 확인합니다.
    if (DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_KEY) {
        supabaseUrl = DEFAULT_SUPABASE_URL;
        supabaseKey = DEFAULT_SUPABASE_KEY;
    } else {
        // 2. 기본값이 비어있다면, 기존처럼 브라우저 저장소(localStorage)에서 읽어옵니다.
        supabaseUrl = localStorage.getItem('supabaseUrl') || '';
        supabaseKey = localStorage.getItem('supabaseKey') || '';
    }

    // 3. 값 확인
    if (!supabaseUrl || !supabaseKey) {
        setSupabaseStatus('disconnected');
        return;
    }

    setSupabaseStatus('loading');

    try {
        // CDN으로 로드된 supabase 클라이언트가 준비되었는지 확인
        if (typeof createClient === 'undefined' && typeof window.supabase === 'undefined') {
            throw new Error("Supabase SDK가 제대로 로드되지 않았습니다. 인터넷 상태를 확인해 주세요.");
        }

        // 글로벌 변수 createClient는 window.supabase.createClient를 가리킬 수도 있음
        const makeClient = (typeof createClient !== 'undefined') ? createClient : window.supabase.createClient;
        
        // 3. 클라이언트 객체 생성
        supabase = makeClient(supabaseUrl, supabaseKey);
        
        // 4. 간단한 테스트 쿼리로 연결성 확인 (members 테이블 정보 1개만 조회)
        const { data, error } = await supabase.from('members').select('id').limit(1);
        
        if (error) throw error;

        setSupabaseStatus('connected');
        console.log("Supabase 연결 성공!");
    } catch (err) {
        console.error("Supabase 연결 실패:", err);
        setSupabaseStatus('disconnected');
        supabase = null; // 연결 실패 시 인스턴스 해제
        alert("수파베이스 연결에 실패했습니다: " + err.message + "\n인터넷 연결 상태나 수파베이스 설정을 확인해 주세요.");
    }
}

// 연결 상태를 콘솔에만 기록하는 내부 헬퍼 함수 (UI 표시 없이 백그라운드에서만 동작)
function setSupabaseStatus(status) {
    // 연결 상태 변경 시 브라우저 개발자 콘솔에서만 확인 가능합니다.
    console.log('[Supabase 상태]', status);
}

// Supabase 데이터베이스로부터 인원 정보를 가져오는 함수
async function fetchSupabaseMembers(silent = false) {
    if (!supabase) {
        if (!silent) alert("Supabase 설정이 올바르지 않거나 연결되어 있지 않습니다.");
        return;
    }

    try {
        setSupabaseStatus('loading');
        
        // members 테이블에서 모든 데이터(name) 가져오기 (가장 최근 순 혹은 ID 오름차순)
        const { data, error } = await supabase
            .from('members')
            .select('name')
            .order('id', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            if (!silent) {
                alert("수파베이스의 members 테이블에 등록된 이름이 없습니다!\nSupabase 대시보드에서 members 테이블에 이름을 추가해 주세요.");
            }
            setSupabaseStatus('connected');
            return;
        }

        // 가져온 데이터로 participants 배열 재구성
        participants = data.map(item => ({
            name: item.name,
            number: 0 // 임시 번호 (셔플에서 지정 예정)
        }));

        // 번호를 랜덤하게 무작위 배정
        shuffleAndAssignNumbers();
        
        // UI 리뉴얼
        updateUI();
        
        setSupabaseStatus('connected');
        
        if (!silent) {
            alert(`성공적으로 Supabase에서 ${data.length}명의 인원을 가져왔습니다!`);
        }
    } catch (err) {
        console.error("데이터 로드 실패:", err);
        setSupabaseStatus('disconnected');
        if (!silent) {
            alert("Supabase에서 데이터를 가져오는 도중 오류가 발생했습니다.\n테이블 이름(members) 및 스키마 설정을 확인해 주세요.");
        }
    }
}
