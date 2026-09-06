/* ============================================================
   武汉中学官网 · 公共脚本
   注入 顶栏 / 头部导航 / 页脚，并处理 子导航 tab 切换、移动端菜单
   ============================================================ */
(function () {
  "use strict";
  var D = window.SITE_DATA;

  // 当前页面 key（由文件名推断）
  function pageKey() {
    var file = decodeURIComponent(location.pathname.split("/").pop()) || "index.html";
    var map = {
      "index.html": "index", "about.html": "about", "teaching.html": "teaching",
      "grades.html": "grades", "admissions.html": "admissions", "party.html": "party",
      "hongpu.html": "hongpu", "exchange.html": "exchange"
    };
    return map[file] || (file === "" ? "index" : file.replace(".html", ""));
  }

  /* ---------- 顶栏 ---------- */
  function renderTopbar() {
    var el = document.getElementById("topbar");
    if (!el) return;
    var c = D.contact;
    el.className = "topbar";
    el.innerHTML =
      '<div class="container">' +
      '<div class="left">校训：朴·诚·勇·毅 &nbsp;|&nbsp; 武汉中学为您服务</div>' +
      '<div class="right">' +
      '<a href="mailto:' + c.superviseEmail + '">师德监督邮箱</a>' +
      '<a href="mailto:' + c.submitEmail + '">投稿邮箱</a>' +
      '<a href="#footer">联系我们</a>' +
      "</div></div>";
  }

  /* ---------- 头部导航 ---------- */
  function renderHeader() {
    var el = document.getElementById("site-header");
    if (!el) return;
    var active = pageKey();
    var navHtml = D.nav.map(function (n) {
      var key = n.href.replace(".html", "");
      var cls = key === active ? "active" : "";
      return '<li><a class="' + cls + '" href="' + n.href + '">' + n.label + "</a></li>";
    }).join("");

    el.className = "header";
    el.innerHTML =
      '<div class="container">' +
      '<a class="brand" href="index.html">' +
      '<img src="assets/img/logo.png" alt="' + D.siteName + '">' +
      "</a>" +
      '<button class="menu-toggle" aria-label="菜单"><span></span><span></span><span></span></button>' +
      '<nav class="nav"><ul>' + navHtml + "</ul></nav>" +
      "</div>";

    var toggle = el.querySelector(".menu-toggle");
    var nav = el.querySelector(".nav");
    toggle.addEventListener("click", function () {
      toggle.classList.toggle("open");
      nav.classList.toggle("open");
    });
    // 点击导航项后关闭移动端菜单
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        toggle.classList.remove("open");
      }
    });
  }

  /* ---------- 页脚 ---------- */
  function renderFooter() {
    var el = document.getElementById("site-footer");
    if (!el) return;
    var c = D.contact;

    // 友情链接（部分为站外）
    var links = [
      ["学籍管理", "http://gzkg.e21.cn/"],
      ["选课系统", "http://gzkg.e21.cn/"],
      ["分数查询", "https://www.zhixue.com/"],
      ["鄂ICP备", "http://beian.miit.gov.cn/"],
    ].map(function (l) { return '<a href="' + l[1] + '" target="_blank" rel="noopener">' + l[0] + "</a>"; }).join("");

    var navLinks = D.nav.map(function (n) {
      return '<a href="' + n.href + '">' + n.label + "</a>";
    }).join("");

    el.className = "footer";
    el.innerHTML =
      '<div class="container">' +
      '<div class="grid">' +
      "<div>" +
      '<div class="brand-row"><img src="assets/img/logo.png" alt="' + D.siteName + '"></div>' +
      "<p>地址：" + c.address + "</p>" +
      "<p>邮编：<span id=\"postcode\"></span> ｜ 电话：" + c.phone + "</p>" +
      "<p>招生咨询：" + c.recruitPhone + " ｜ 官方招生群：" + c.recruitGroup + "</p>" +
      "<p>师德监督电话：" + c.supervisePhone + " ｜ 监督邮箱：" + c.superviseEmail + "</p>" +
      "<p>投稿邮箱：" + c.submitEmail + "</p>" +
      "</div>" +
      "<div>" +
      "<h4>快速导航</h4>" +
      '<div class="links">' + navLinks + "</div>" +
      "<h4 style=\"margin-top:20px\">友情链接</h4>" +
      '<div class="links">' + links + "</div>" +
      "</div>" +
      "<div>" +
      "<h4>关注我们</h4>" +
      '<div class="qr">' +
      '<div class="item"><img src="' + c.qrW3 + '" alt="' + c.qrW3Text + '">' + c.qrW3Text + "</div>" +
      '<div class="item"><img src="' + c.qrW4 + '" alt="' + c.qrW4Text + '">' + c.qrW4Text + "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="bottom">' +
      "<span>Copyright © 2020 " + D.siteName + " . All Rights Reserved.</span>" +
      '<a href="http://beian.miit.gov.cn/" target="_blank" rel="noopener">' + c.icp + "</a>" +
      '<span class="motto">校训：' + D.motto + "</span>" +
      "</div></div>";

    var pc = el.querySelector("#postcode");
    if (pc) pc.textContent = c.postcode;
  }

  /* ---------- 子导航（栏目页 tab） ---------- */
  function renderSubNav() {
    var el = document.getElementById("sub-nav");
    if (!el) return;
    var key = pageKey();
    var page = D.pages[key];
    if (!page || !page.sections) return;

    el.className = "sub-nav";
    el.innerHTML = page.sections.map(function (s) {
      return '<a href="#' + s.key + '" data-section="' + s.key + '">' + s.label + "</a>";
    }).join("");

    // 初始化：激活第一个
    var links = el.querySelectorAll("a[data-section]");
    var panels = document.querySelectorAll(".panel[data-panel]");
    function activate(key) {
      links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-section") === key); });
      panels.forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-panel") === key); });
    }
    if (links.length) activate(links[0].getAttribute("data-section"));

    el.addEventListener("click", function (e) {
      var a = e.target.closest("a[data-section]");
      if (!a) return;
      e.preventDefault();
      activate(a.getAttribute("data-section"));
    });
  }

  /* ---------- 新间行渲染 ---------- */
  function newsRow(item) {
    return (
      '<div class="news-row">' +
      '<span class="n-icon">📄</span>' +
      '<div class="n-body">' +
      '<a class="t" href="' + item.link + '" target="_blank" rel="noopener">' + item.title + "</a>" +
      '<div class="n-meta"><span class="cat">' + item.cat + '</span><span>' + item.date + "</span></div>" +
      "</div></div>"
    );
  }

  /* ---------- 栏目页：按 data-list 填充新闻面板 ---------- */
  function renderPageLists() {
    var key = pageKey();
    var page = D.pages[key];
    if (!page) return;
    document.querySelectorAll("[data-list]").forEach(function (el) {
      var listKey = el.getAttribute("data-list");
      var items = page.data && page.data[listKey];
      if (!items) return;
      el.innerHTML = items.map(newsRow).join("");
    });
  }

  window.SITE = {
    pageKey: pageKey,
    newsRow: newsRow
  };

  document.addEventListener("DOMContentLoaded", function () {
    renderTopbar();
    renderHeader();
    renderFooter();
    renderSubNav();
    renderPageLists();
  });
})();
