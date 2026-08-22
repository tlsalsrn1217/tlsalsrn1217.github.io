// 스크롤 진입 애니메이션. 이게 이 사이트의 유일한 JS다.
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add("in");
      io.unobserve(e.target);
    }
  }
}, { rootMargin: "0px 0px -10% 0px" });

document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// itch 임베드는 게임을 원래 크기(540 폭)로만 그린다. 프레임이 그보다 좁으면
// 잘리므로, 프레임 폭에 맞춰 통째로 줄인다. CSS만으로는 길이를 배율로 바꿀 수 없다.
const play = document.querySelector(".play-frame");
if (play) {
  const fit = () => play.style.setProperty("--play-scale", (play.clientWidth / 540).toFixed(4));
  fit();
  new ResizeObserver(fit).observe(play);
}

// 좌측 고정 목차의 현재 위치 표시. 위치 표시가 없으면 사이드바 목차는
// 가로 나열보다 쓸모가 없다. 화면 위쪽 1/3에 걸린 섹션을 현재로 본다.
const tocLinks = [...document.querySelectorAll(".toc a")];
const targets = tocLinks
  .map((a) => ({ a, el: document.querySelector(a.getAttribute("href")) }))
  .filter((t) => t.el);

if (targets.length) {
  const mark = () => {
    const line = window.scrollY + window.innerHeight / 3;
    let cur = targets[0];
    for (const t of targets) if (t.el.offsetTop <= line) cur = t;
    // 마지막 섹션(연락)은 화면 1/3 선까지 올라오지 못한다. 페이지 끝에 닿으면
    // 그보다 위로 더 스크롤할 수 없어서, 이 보정이 없으면 영영 선택되지 않는다.
    const bottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    if (bottom) cur = targets[targets.length - 1];
    for (const t of targets) t.a.classList.toggle("on", t === cur);
  };
  mark();
  addEventListener("scroll", mark, { passive: true });
  addEventListener("resize", mark);
}

// 상단 바 아래 진행 막대. 0에서 1 사이 비율만 CSS로 넘긴다.
// 짧은 페이지에서는 max가 0이라 나누면 NaN이 되므로 그때는 0으로 둔다.
const bar = document.querySelector(".scroll-bar span");
if (bar) {
  const draw = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty("--p", max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0);
  };
  draw();
  addEventListener("scroll", draw, { passive: true });
  addEventListener("resize", draw);
}
