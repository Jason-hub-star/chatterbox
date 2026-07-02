// INOCHI2D-ABSORB-001 ①: SimplePhysics 펜듈럼 적분기 (순수 모듈, Node 테스트 가능).
// 오픈소스 Inochi2D의 SimplePhysics 모델 이식 — 기존 ad-hoc 스프링과 차이:
//   (a) 중력 복원(gravity_sag): 정지 시 아래로 늘어지고 세로 끄덕임에 무게감
//   (b) length 기반 고유진동수: 긴 롭이어·꼬리는 느리게, 앞머리는 빠르게 자동 차등
//   (c) spring=true: 측면 스윙 운동량이 세로 바운스로 새는 통통 효과(Spring Pendulum 근사)
// target = 앵커(부모 본) 변위, item.offset = bob 변위(출력). 외부 의존 없음.

// 복원 강성 omega2 = (gravity/length)*K. 이산 적분기라 체감 주기 ≈ 2π/sqrt(omega2·dt) 프레임.
// K=64, g=1, L=24, 60fps → 주기 ≈ 0.5s(중간 머리). 짧은 뱅(L=10)≈0.32s, 긴 롭이어·꼬리(L=60)≈0.79s.
// 절대 주기는 시각 게이트(/drive)에서 최종 튜닝 — 이 상수는 자연스러운 출발점.
const PENDULUM_K = 64;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// item: {offset:[x,y], velocity:[x,y]} — 제자리 변형. dt 초 단위(기본 1/30).
function integratePendulum(profile, item, target, dt) {
  const g = profile.gravity ?? 1.0;
  const L = Math.max(profile.length ?? 24, 1);
  const omega2 = (g / L) * PENDULUM_K;
  const dampX = Math.pow(profile.damping_x ?? profile.damping ?? 0.9, dt * 60);
  const dampY = Math.pow(profile.damping_y ?? profile.damping ?? 0.9, dt * 60);
  const sag = profile.gravity_sag ?? 0;
  const rest = [target[0], target[1] + sag];
  for (let axis = 0; axis < 2; axis += 1) {
    const damp = axis === 0 ? dampX : dampY;
    const accel = omega2 * (rest[axis] - item.offset[axis]) * dt;
    item.velocity[axis] = (item.velocity[axis] + accel) * damp;
    item.offset[axis] += item.velocity[axis] * dt * 60;
    const limit = profile.max_offset?.[axis] ?? 30;
    item.offset[axis] = clamp(item.offset[axis], -limit, limit);
  }
  if (profile.spring) {
    const bounce = profile.spring_gain ?? 0.12;
    item.offset[1] += Math.abs(item.velocity[0]) * bounce * dt * 60;
    const limit = profile.max_offset?.[1] ?? 30;
    item.offset[1] = clamp(item.offset[1], -limit, limit);
  }
  return item;
}

export { integratePendulum, PENDULUM_K };
