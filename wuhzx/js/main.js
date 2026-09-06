/* ============================================================
   武汉中学官网 · 首页脚本
   轮播图 + 快捷入口 + 各板块新闻渲染
   ============================================================ */
(function () {
  "use strict";
  var D = window.SITE_DATA;
  var timer = null, idx = 0;

  /* ---------- 轮播 ---------- */
  function renderHero() {
    var hero = document.getElementById("hero");
    var dots = document.getElementById("hero-dots");
    if (!hero) return;

    hero.innerHTML = D.hero.map(function (h) {
      return (
        '<div class="slide" style="background-image:url(' + h.img + ')">' +
        '<div class="overlay"></div>' +
        '<div class="hero-copy">' +
        '<span class="tag">' + h.tag + "</span>" +
        "<h2>" + h.title + "</h2>" +
        "<p>" + h.desc + "</p>" +
        '<a class="btn" href="' + h.link + '">' + h.btn + "</a>" +
        "</div></div>"
      );
    }).join("");

    var slides = hero.querySelectorAll(".slide");
    dots.innerHTML = D.hero.map(function (_, i) {
      return '<button data-i="' + i + '" aria-label="第' + (i + 1) + '张"></button>';
    }).join("");
    var dotBtns = dots.querySelectorAll("button");

    function go(n) {
      idx = (n + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle("active", i === idx); });
      dotBtns.forEach(function (b, i) { b.classList.toggle("active", i === idx); });
    }
    dots.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      go(parseInt(b.getAttribute("data-i"), 10));
      restart();
    });
    function restart() { clearInterval(timer); timer = setInterval(function () { go(idx + 1); }, 5000); }

    go(0); restart();
  }

  /* ---------- 快捷入口 ---------- */
  function renderQuick() {
    var el = document.getElementById("quick-grid");
    if (!el) return;
    el.innerHTML = D.quick.map(function (q) {
      return (
        '<a class="quick" href="' + q.href + '">' +
        '<div class="q-icon">' + q.icon + "</div>" +
        "<strong>" + q.name + "</strong>" +
        "<span>" + q.sub + "</span></a>"
      );
    }).join("");
  }

  /* ---------- 首页各板块新闻 ---------- */
  function renderHomeSections() {
    document.querySelectorAll(".home-list").forEach(function (list) {
      var key = list.getAttribute("data-key");
      var sec = D.homeSections.find(function (s) { return s.key === key; });
      if (!sec) return;
      list.innerHTML = sec.items.map(function (it) {
        return (
          '<div class="news-row">' +
          '<span class="n-icon">📄</span>' +
          '<div class="n-body">' +
          '<a class="t" href="' + it.link + '" target="_blank" rel="noopener">' + it.title + "</a>" +
          '<div class="n-meta"><span class="cat">' + it.cat + '</span><span>' + it.date + "</span></div>" +
          "</div></div>"
        );
      }).join("");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderHero();
    renderQuick();
    renderHomeSections();
  });
})();
