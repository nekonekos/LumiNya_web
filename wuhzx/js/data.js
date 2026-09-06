/* ============================================================
   武汉中学官网 · 全局数据
   经 `<script src>` 引入（file:// 下可正常加载，避开 fetch JSON 的 CORS 限制）
   ============================================================ */
window.SITE_DATA = {
  siteName: "武汉中学",
  siteEn: "WUHAN MIDDLE SCHOOL",
  motto: "朴·诚·勇·毅",

  // 一级导航（与各 HTML 文件对应）
  nav: [
    { label: "首页", href: "index.html" },
    { label: "百年武中", href: "about.html" },
    { label: "教育教学", href: "teaching.html" },
    { label: "级部风采", href: "grades.html" },
    { label: "招生工作", href: "admissions.html" },
    { label: "党群生活", href: "party.html" },
    { label: "弘朴系列", href: "hongpu.html" },
    { label: "对外交流", href: "exchange.html" },
  ],

  // 联系方式
  contact: {
    address: "湖北省武汉市武昌区粮道街275号",
    postcode: "430061",
    phone: "027－88912006（校办）、88912096（课程教学处）",
    recruitPhone: "88912262（周一至五 8:30-11:30 / 14:00-17:00）",
    recruitGroup: "687567068",
    supervisePhone: "88912006",
    superviseEmail: "whzxedujb@163.com",
    submitEmail: "hbwhzxxb@163.com",
    icp: "鄂ICP备14017707号-1",
    qrW3: "assets/img/qr_w3.jpg",
    qrW3Text: "武汉中学微信公众号",
    qrW4: "assets/img/qr_w4.jpg",
    qrW4Text: "学在武昌微信公众号",
  },

  // 快捷入口
  quick: [
    { icon: "🏛️", name: "武中简介", sub: "百年底蕴", href: "about.html" },
    { icon: "📚", name: "智慧教学", sub: "四星级校园", href: "teaching.html" },
    { icon: "🎓", name: "中招信息", sub: "招生通道", href: "admissions.html" },
    { icon: "🏆", name: "素质风采", sub: "学子成长", href: "grades.html" },
    { icon: "🔴", name: "红色党建", sub: "党群生活", href: "party.html" },
    { icon: "🌐", name: "对外交流", sub: "友好往来", href: "exchange.html" },
  ],

  // 首页：轮播
  hero: [
    { img: "assets/img/banner2.jpg", tag: "百年武中", title: "朴素 · 诚信 · 勇敢 · 坚毅", desc: "以武汉这座英雄城市命名的学校，1920年由董必武等人创办，从这里走出三位党的“一大”代表。", link: "about.html", btn: "走进武中" },
    { img: "assets/img/banner1.jpg", tag: "智慧教学", title: "数智驱动下的跨界生长", desc: "武汉市最高级别的“四星级智慧校园”，双回路千兆光纤，新高考走班选课、智能黑板全覆盖。", link: "teaching.html", btn: "了解更多" },
  ],

  // 首页：四个板块
  homeSections: [
    {
      key: "smart", icon: "🧠", title: "智慧教学", en: "INTELLIGENT TEACHING", more: "teaching.html",
      items: [
        { date: "2021-11-22", title: "重磅！武汉中学2022年招生通道开启！", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=980" },
        { date: "2021-11-15", title: "喜报！武汉中学再获省级奖项", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=916" },
        { date: "2021-03-30", title: "热烈庆贺武汉中学荣获武汉市普通高中领航学校称号", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=836" },
        { date: "2026-07-07", title: "【五生课堂】数智驱动下的跨界生长 | 智融文理 以技育人（AI智创教研组篇）", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=1798" },
        { date: "2026-07-07", title: "【五生课堂】数智驱动下的跨界生长 | 览地知史 涵育情怀（地理篇）", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=1797" },
        { date: "2026-07-07", title: "【五生课堂】数智驱动下的跨界生长 | 融化蕴文 探知践学（化学篇）", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=1796" },
      ],
    },
    {
      key: "moral", icon: "🚩", title: "红色德育", en: "EDUCATION FOR CHARACTER", more: "teaching.html",
      items: [
        { date: "2025-05-09", title: "夏雨萱：缅怀与铭记、新生与传承", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1666" },
        { date: "2025-05-03", title: "春风润桃李 深耕启新思——武汉中学召开四月班主任工作会议", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1701" },
        { date: "2025-04-26", title: "武汉中学高三学子花博汇踏春，共赴春日之约", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1696" },
        { date: "2026-07-07", title: "李康蕊：共建美好校园，共治文明风尚，共享青春时光", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1793" },
        { date: "2026-07-07", title: "旗开得胜，为梦壮行｜武汉中学2026届高三“加油壮行”暨升旗仪式", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1787" },
        { date: "2026-07-07", title: "我在武中当校长 | 从被管到管，我悟了", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1784" },
      ],
    },
    {
      key: "hongpu", icon: "📖", title: "弘朴系列", en: "HONGPU SERIES", more: "hongpu.html",
      items: [
        { date: "2023-03-14", title: "这个年终你盘点了吗？——记武汉中学2021年党史学习教育工作总结会", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=1150" },
        { date: "2023-03-09", title: "亲，你的寒假作业完成了吗？——兔年正月初八，锚定学本校园奋斗吧！", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=1138" },
        { date: "2021-11-16", title: "今年教师节，武中教师这样过……", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=928" },
        { date: "2021-11-15", title: "【武中扶梯人】杨宇红：揭秘教学长跑的助推器", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=915" },
        { date: "2023-03-07", title: "绘制“学本校园”蓝图，重新构想我们的未来", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=1102" },
      ],
    },
    {
      key: "exchange", icon: "🤝", title: "对外交流", en: "FOREIGN EXCHANGE", more: "exchange.html",
      items: [
        { date: "2023-03-09", title: "武昌区副区长陈磊一行来校慰问高三教师——兔年正月初七，武中开工大吉", cat: "对外交流", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=1136" },
        { date: "2023-03-07", title: "省禁毒办检查组一行视察武汉中学禁毒教育工作", cat: "对外交流", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=1101" },
        { date: "2021-11-15", title: "湖北省委党史学习教育第七巡回指导组考察武汉中学“扫黄打非·护苗”工作站", cat: "对外交流", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=923" },
        { date: "2021-05-27", title: "武汉中学班主任兵法讲坛系列活动（五）|让德育重回学校教育的中心", cat: "对外交流", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=888" },
        { date: "2021-05-27", title: "对口帮扶显真情,高考交流落实处", cat: "对外交流", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=885" },
        { date: "2021-05-27", title: "八千里路云和月，援疆共建情谊长", cat: "对外交流", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=879" },
      ],
    },
  ],

  // 各栏目页：子导航 + 新闻
  pages: {
    about: {
      title: "百年武中",
      crumbs: ["首页", "百年武中"],
      sections: [
        { key: "intro", label: "武中简介" },
        { key: "history", label: "武中校史" },
        { key: "song", label: "武中校歌" },
        { key: "motto", label: "武中校训" },
        { key: "campus", label: "武中校园" },
      ],
    },
    teaching: {
      title: "教育教学",
      crumbs: ["首页", "教育教学"],
      sections: [
        { key: "smart", label: "智慧教学" },
        { key: "moral", label: "红色德育" },
        { key: "research", label: "科研前沿" },
      ],
      data: {
        smart: [
          { date: "2021-11-22", title: "重磅！武汉中学2022年招生通道开启！", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=980" },
          { date: "2021-11-15", title: "喜报！武汉中学再获省级奖项", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=916" },
          { date: "2021-03-30", title: "热烈庆贺武汉中学荣获武汉市普通高中领航学校称号", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=836" },
          { date: "2026-07-07", title: "【五生课堂】数智驱动下的跨界生长 | 智融文理 以技育人（AI智创教研组篇）", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=1798" },
          { date: "2026-07-07", title: "【五生课堂】数智驱动下的跨界生长 | 览地知史 涵育情怀（地理篇）", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=1797" },
          { date: "2026-07-07", title: "【五生课堂】数智驱动下的跨界生长 | 融化蕴文 探知践学（化学篇）", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=1796" },
          { date: "2026-07-07", title: "【五生课堂】数智驱动下的跨界生长 | 融思悟理 知行铸魂（政治篇）", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=1795" },
          { date: "2026-07-07", title: "【五生课堂】数智驱动下的跨界生长 | 融数研理 启思探真（物理篇）", cat: "智慧教学", link: "http://www.wuhzx.com/jxzc/info.aspx?itemid=1794" },
        ],
        moral: [
          { date: "2025-05-09", title: "夏雨萱：缅怀与铭记、新生与传承", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1666" },
          { date: "2025-05-03", title: "春风润桃李 深耕启新思——武汉中学召开四月班主任工作会议", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1701" },
          { date: "2025-04-26", title: "武汉中学高三学子花博汇踏春，共赴春日之约", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1696" },
          { date: "2026-07-07", title: "李康蕊：共建美好校园，共治文明风尚，共享青春时光", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1793" },
          { date: "2026-07-07", title: "旗开得胜，为梦壮行｜武汉中学2026届高三“加油壮行”暨升旗仪式", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1787" },
          { date: "2026-07-07", title: "我在武中当校长 | 从被管到管，我悟了", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1784" },
          { date: "2026-07-07", title: "名师帮你拿下语文“半壁江山”！——我校邀请专家开展高考作文专题讲座", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1782" },
          { date: "2026-07-07", title: "“育见”论坛 | 如何让班级自主运转，让学生成为主人？", cat: "红色德育", link: "http://www.wuhzx.com/dytd/info.aspx?itemid=1781" },
        ],
        research: [
          { date: "2024-01-16", title: "喜报丨武汉中学教师获得12个国家奖", cat: "科研前沿", link: "http://www.wuhzx.com/kyqy/info.aspx?itemid=1439" },
          { date: "2023-03-09", title: "武汉中学好新闻，等你点赞！", cat: "科研前沿", link: "http://www.wuhzx.com/kyqy/info.aspx?itemid=1131" },
          { date: "2023-03-07", title: "喜报！武中教师获市教育科学论文和课题双一等奖！", cat: "科研前沿", link: "http://www.wuhzx.com/kyqy/info.aspx?itemid=1105" },
          { date: "2020-08-05", title: "武汉中学那5个研究病毒和“坏土豆”的学霸高考全过600分", cat: "科研前沿", link: "http://www.wuhzx.com/kyqy/info.aspx?itemid=289" },
          { date: "2020-08-03", title: "厉害了！湖北经视报导武汉中学学生天兴洲规划成果！", cat: "科研前沿", link: "http://www.wuhzx.com/kyqy/info.aspx?itemid=244" },
          { date: "2020-08-05", title: "武汉中学“最飒组织”——“教育信息化探索共同体”", cat: "科研前沿", link: "http://www.wuhzx.com/kyqy/info.aspx?itemid=285" },
        ],
      },
    },
    grades: {
      title: "级部风采",
      crumbs: ["首页", "级部风采"],
      sections: [
        { key: "junior", label: "初中部" },
        { key: "g1", label: "高一年级" },
        { key: "g2", label: "高二年级" },
        { key: "g3", label: "高三年级" },
      ],
      data: {
        junior: [
          { date: "2021-12-22", title: "提升岗位素养 加强德育建设——区教育局调研组调研指导我校班主任队伍建设工作", cat: "初中部", link: "http://www.wuhzx.com/czb/info.aspx?itemid=1020" },
          { date: "2021-12-21", title: "今天，你运动了吗？", cat: "初中部", link: "http://www.wuhzx.com/czb/info.aspx?itemid=1011" },
          { date: "2021-12-20", title: "【雏雁起飞】“教坛新秀”迎挑战 薪火相传促成长", cat: "初中部", link: "http://www.wuhzx.com/czb/info.aspx?itemid=1004" },
          { date: "2021-12-20", title: "开展“三段两衔接”，探索教育新路径", cat: "初中部", link: "http://www.wuhzx.com/czb/info.aspx?itemid=996" },
          { date: "2021-12-17", title: "【品质校园】武中校园里刮起猛烈的“非遗”风", cat: "初中部", link: "http://www.wuhzx.com/czb/info.aspx?itemid=994" },
        ],
        g1: [
          { date: "2021-12-22", title: "高一年级 · 新生军训暨入学教育圆满举行", cat: "高一年级", link: "http://www.wuhzx.com/gy/list.aspx" },
          { date: "2021-12-22", title: "高一年级 · 生涯规划课程开讲", cat: "高一年级", link: "http://www.wuhzx.com/gy/list.aspx" },
          { date: "2021-12-22", title: "高一年级 · 社团招新嘉年华", cat: "高一年级", link: "http://www.wuhzx.com/gy/list.aspx" },
        ],
        g2: [
          { date: "2021-12-22", title: "高二年级 · 学科竞赛再传捷报", cat: "高二年级", link: "http://www.wuhzx.com/ge/list.aspx" },
          { date: "2021-12-22", title: "高二年级 · 研学实践活动走进天兴洲", cat: "高二年级", link: "http://www.wuhzx.com/ge/list.aspx" },
          { date: "2021-12-22", title: "高二年级 · 篮球联赛圆满落幕", cat: "高二年级", link: "http://www.wuhzx.com/ge/list.aspx" },
        ],
        g3: [
          { date: "2026-07-07", title: "高三年级 · 旗开得胜，为梦壮行｜高考出征仪式", cat: "高三年级", link: "http://www.wuhzx.com/ge5725/list.aspx" },
          { date: "2021-12-22", title: "高三年级 · 百日誓师大会", cat: "高三年级", link: "http://www.wuhzx.com/ge5725/list.aspx" },
          { date: "2021-12-22", title: "高三年级 · 心理减压辅导活动", cat: "高三年级", link: "http://www.wuhzx.com/ge5725/list.aspx" },
        ],
      },
    },
    admissions: {
      title: "招生工作",
      crumbs: ["首页", "招生工作"],
      sections: [
        { key: "zhongkao", label: "中招信息" },
        { key: "gaokao", label: "高招信息" },
      ],
      data: {
        zhongkao: [
          { date: "2026-03-27", title: "武汉中学2026年体育（田径）后备人才招录方案", cat: "中招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=1752" },
          { date: "2025-07-19", title: "关于武汉中学（含初中部）2025级学生校服供应商遴选结果的公示", cat: "中招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=1675" },
          { date: "2023-07-17", title: "武汉中学2023级新生录取通知书领取说明", cat: "中招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=1344" },
          { date: "2023-05-26", title: "武汉中学2023年体育（田径）后备人才招生简章", cat: "中招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=1301" },
          { date: "2023-03-20", title: "重磅！3月19日，武中等您！", cat: "中招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=1209" },
          { date: "2023-03-07", title: "重磅！武汉中学2023年招生通道开启！", cat: "中招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=1099" },
          { date: "2023-03-07", title: "武昌区教育局领导班子莅临武汉中学调研高考备考工作", cat: "中招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=1097" },
        ],
        gaokao: [
          { date: "2020-08-03", title: "2019年武汉中学招生及元调签约答疑汇总", cat: "高招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=238" },
          { date: "2020-07-20", title: "武汉初级中学欢迎您", cat: "高招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=231" },
          { date: "2020-07-10", title: "2020年武汉中学体育后备人才招生简章", cat: "高招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=208" },
          { date: "2021-05-06", title: "武汉中学：“领航密码”是培养学生关键能力", cat: "高招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=873" },
          { date: "2021-04-19", title: "音为有爱乐在其中 武中绽放“艺术之花”", cat: "高招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=861" },
          { date: "2021-04-12", title: "实践学采茶，和春天来一场劳动约会吧", cat: "高招信息", link: "http://www.wuhzx.com/zzxx/info.aspx?itemid=854" },
        ],
      },
    },
    party: {
      title: "党群生活",
      crumbs: ["首页", "党群生活"],
      sections: [
        { key: "dangjian", label: "红色党建" },
        { key: "minsheng", label: "民主生活" },
        { key: "tuanjian", label: "红色团建" },
        { key: "wenming", label: "文明创建" },
      ],
      data: {
        dangjian: [
          { date: "2026-07-07", title: "青春志愿进社区 服务奉献暖民心", cat: "红色党建", link: "http://www.wuhzx.com/djdt/info.aspx?itemid=1800" },
          { date: "2026-07-07", title: "以思砺行，以辩致远 —— 我校与武汉市第十四中学友谊辩论赛圆满开展", cat: "红色党建", link: "http://www.wuhzx.com/djdt/info.aspx?itemid=1775" },
          { date: "2026-06-25", title: "朴诚勇毅守初心，红色薪火永相传——武汉中学2026年青年马克思学校、少年团校隆重开班", cat: "红色党建", link: "http://www.wuhzx.com/djdt/info.aspx?itemid=1769" },
          { date: "2025-04-29", title: "传承红色基因 担当时代使命——武汉中学2025年团校开班仪式暨团课第一讲圆满举行", cat: "红色党建", link: "http://www.wuhzx.com/djdt/info.aspx?itemid=1698" },
          { date: "2025-06-16", title: "不能忘却的纪念——武汉中学的这些校友请铭记！", cat: "红色党建", link: "http://www.wuhzx.com/djdt/info.aspx?itemid=1671" },
          { date: "2025-04-10", title: "赓续红色血脉，传承红色文化——“红领带，智育人”系列主题党日活动", cat: "红色党建", link: "http://www.wuhzx.com/djdt/info.aspx?itemid=1655" },
        ],
        minsheng: [
          { date: "2021-11-15", title: "湖北省委党史学习教育第七巡回指导组考察武汉中学“扫黄打非·护苗”工作站", cat: "民主生活", link: "http://www.wuhzx.com/dqsh/list.aspx" },
          { date: "2021-11-15", title: "武汉中学教代会一届一次会议顺利召开", cat: "民主生活", link: "http://www.wuhzx.com/dqsh/list.aspx" },
          { date: "2021-11-15", title: "行政干部民主生活会开展批评与自我批评", cat: "民主生活", link: "http://www.wuhzx.com/dqsh/list.aspx" },
        ],
        tuanjian: [
          { date: "2026-06-25", title: "武汉中学2026年青年马克思学校、少年团校隆重开班", cat: "红色团建", link: "http://www.wuhzx.com/dqsh5673/list.aspx" },
          { date: "2025-04-29", title: "2025年团校开班仪式暨团课第一讲圆满举行", cat: "红色团建", link: "http://www.wuhzx.com/dqsh5673/list.aspx" },
          { date: "2021-11-15", title: "团员青年学党史主题教育活动", cat: "红色团建", link: "http://www.wuhzx.com/dqsh5673/list.aspx" },
        ],
        wenming: [
          { date: "2026-07-07", title: "青春志愿进社区 服务奉献暖民心", cat: "文明创建", link: "http://www.wuhzx.com/dqsh56736244/list.aspx" },
          { date: "2025-04-10", title: "赓续红色血脉，传承红色文化——“红领带，智育人”系列主题党日活动", cat: "文明创建", link: "http://www.wuhzx.com/dqsh56736244/list.aspx" },
          { date: "2021-11-15", title: "武汉中学举行文明校园创建动员大会", cat: "文明创建", link: "http://www.wuhzx.com/dqsh56736244/list.aspx" },
        ],
      },
    },
    hongpu: {
      title: "弘朴系列",
      crumbs: ["首页", "弘朴系列"],
      sections: [
        { key: "jiangtang", label: "弘朴讲堂" },
        { key: "mingshi", label: "弘朴名师" },
        { key: "xiaoyou", label: "弘朴校友" },
        { key: "xuezi", label: "弘朴学子" },
        { key: "zazhi", label: "弘朴杂志" },
      ],
      data: {
        jiangtang: [
          { date: "2023-03-14", title: "这个年终你盘点了吗？——记武汉中学2021年党史学习教育工作总结会", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=1150" },
          { date: "2023-03-09", title: "亲，你的寒假作业完成了吗？——兔年正月初八，锚定学本校园奋斗吧！", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=1138" },
          { date: "2021-11-16", title: "今年教师节，武中教师这样过……", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=928" },
          { date: "2021-11-15", title: "【武中扶梯人】杨宇红：揭秘教学长跑的助推器", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=915" },
          { date: "2023-03-07", title: "绘制“学本校园”蓝图，重新构想我们的未来", cat: "弘朴讲堂", link: "http://www.wuhzx.com/HongparkLectureHall/info.aspx?itemid=1102" },
        ],
        mingshi: [
          { date: "2021-11-15", title: "【武中扶梯人】杨宇红：揭秘教学长跑的助推器", cat: "弘朴名师", link: "http://www.wuhzx.com/hpms/list.aspx" },
          { date: "2020-08-05", title: "名师引领·骨干示范——武汉中学开展名师示范课活动", cat: "弘朴名师", link: "http://www.wuhzx.com/hpms/list.aspx" },
          { date: "2020-08-05", title: "特级教师风采：深耕课堂，行稳致远", cat: "弘朴名师", link: "http://www.wuhzx.com/hpms/list.aspx" },
        ],
        xiaoyou: [
          { date: "2025-06-16", title: "不能忘却的纪念——武汉中学的这些校友请铭记！", cat: "弘朴校友", link: "http://www.wuhzx.com/hpxy/list.aspx" },
          { date: "2021-11-15", title: "杰出校友回母校开展生涯分享会", cat: "弘朴校友", link: "http://www.wuhzx.com/hpxy/list.aspx" },
          { date: "2020-08-05", title: "校友风采：从这里走向广阔天地", cat: "弘朴校友", link: "http://www.wuhzx.com/hpxy/list.aspx" },
        ],
        xuezi: [
          { date: "2026-07-07", title: "我在武中当校长 | 从被管到管，我悟了", cat: "弘朴学子", link: "http://www.wuhzx.com/hpxz/list.aspx" },
          { date: "2026-07-07", title: "李康蕊：共建美好校园，共治文明风尚，共享青春时光", cat: "弘朴学子", link: "http://www.wuhzx.com/hpxz/list.aspx" },
          { date: "2025-04-26", title: "武汉中学高三学子花博汇踏春，共赴春日之约", cat: "弘朴学子", link: "http://www.wuhzx.com/hpxz/list.aspx" },
        ],
        zazhi: [
          { date: "2023-03-07", title: "弘朴杂志·总第X期：学本校园专刊", cat: "弘朴杂志", link: "http://www.wuhzx.com/hpzz/list.aspx" },
          { date: "2023-03-07", title: "弘朴杂志·高考加油专刊", cat: "弘朴杂志", link: "http://www.wuhzx.com/hpzz/list.aspx" },
          { date: "2020-08-05", title: "弘朴杂志·百年校庆特刊", cat: "弘朴杂志", link: "http://www.wuhzx.com/hpzz/list.aspx" },
        ],
      },
    },
    exchange: {
      title: "对外交流",
      crumbs: ["首页", "对外交流"],
      sections: [
        { key: "news", label: "友好往来" },
        { key: "visit", label: "来访交流" },
        { key: "coop", label: "合作共建" },
      ],
      data: {
        news: [
          { date: "2023-03-09", title: "武昌区副区长陈磊一行来校慰问高三教师——兔年正月初七，武中开工大吉", cat: "友好往来", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=1136" },
          { date: "2023-03-07", title: "省禁毒办检查组一行视察武汉中学禁毒教育工作", cat: "友好往来", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=1101" },
          { date: "2021-11-15", title: "湖北省委党史学习教育第七巡回指导组考察武汉中学“扫黄打非·护苗”工作站", cat: "友好往来", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=923" },
          { date: "2021-05-27", title: "武汉中学班主任兵法讲坛系列活动（五）|让德育重回学校教育的中心", cat: "友好往来", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=888" },
          { date: "2021-05-27", title: "对口帮扶显真情,高考交流落实处", cat: "友好往来", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=885" },
        ],
        visit: [
          { date: "2023-03-09", title: "武昌区副区长陈磊一行来校慰问高三教师", cat: "来访交流", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=1136" },
          { date: "2023-03-07", title: "省禁毒办检查组一行视察武汉中学禁毒教育工作", cat: "来访交流", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=1101" },
          { date: "2021-11-15", title: "湖北省委党史学习教育第七巡回指导组考察我校", cat: "来访交流", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=923" },
        ],
        coop: [
          { date: "2021-05-27", title: "对口帮扶显真情,高考交流落实处", cat: "合作共建", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=885" },
          { date: "2021-05-27", title: "八千里路云和月，援疆共建情谊长", cat: "合作共建", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=879" },
          { date: "2021-05-27", title: "武汉中学班主任兵法讲坛系列活动（五）", cat: "合作共建", link: "http://www.wuhzx.com/dwjl6573/info.aspx?itemid=888" },
        ],
      },
    },
  },
};
