"use strict";
(function () {
  const NAV = window.MCS_NAV;
  if (!NAV) {
    document.body.innerHTML = "<p style='padding:30px;font-family:sans-serif'>缺少 tree_data.js，无法加载导航树。</p>";
    return;
  }
  const PROVENANCE = window.MCS_PROVENANCE || { fields: [], byId: {} };
  const PROVENANCE_FIELDS = PROVENANCE.fields && PROVENANCE.fields.length
    ? PROVENANCE.fields
    : [
      ["output", "图表成品"],
      ["script", "绘图脚本"],
      ["derived", "派生统计表"],
      ["direct", "直接输入"],
      ["upstream", "上游追踪"],
      ["raw", "原始数据"],
      ["scope", "口径与筛选"]
    ];

  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const NODE_W = 270;
  const NODE_H = 78;
  const LEVEL_GAP = 350;
  const MARGIN_X = 48;
  const MARGIN_Y = 48;
  const V_GAP = 16;

  const state = {
    themeId: NAV.defaultThemeId,
    theme: null,
    root: null,
    scale: 1,
    tx: 40,
    ty: 40,
    dragged: false,
    moveDistance: 0,
    compareGroup: "fig3",
    compareItems: [],
    compareSelected: new Set(),
    compareLayout: "auto",
    selectedId: null,
    firstFit: true
  };

  const SOURCE_BY_ID = {
    scope: [
      "区域、时段与口径：configs/ecne_2021.yml 至 ecne_2025_replay 配置及对应 README；无新增观测数据。",
      "上游数据：MERGIR 4 km Tb + GPM IMERG Final V07B；PyFLEXTRKR，口径 B（S_P Def1）。"
    ],
    "fig1-image": [
      "五年年度清单：正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx，工作表 MCS清单(N)。",
      "使用字段：MCS编号、开始时间(UTC)；按开始时间归年/月。",
      "上游：MERGIR 4 km Tb + IMERG Final V07B；PyFLEXTRKR，口径 B；run 目录 MCS_pipeline/runs/ecne_YYYY（2025 为 ecne_2025_replay）。"
    ],
    "fig1-rank": [
      "正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx；字段 MCS编号、开始时间(UTC)。",
      "本表按月份汇总并逐行从小到大排序，数值为当月 MCS 个数。",
      "上游：MERGIR 4 km Tb + IMERG Final V07B；PyFLEXTRKR，口径 B。"
    ],
    "fig1-fastslow": [
      "正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx；字段 开始时间(UTC)、发展历时T_rise(h)。",
      "分组：T_rise≤5 h 为发展快，>5 h 为发展慢；T_rise=0 归入发展快。",
      "检验：5×2 列联表卡方齐性检验；上游为 MERGIR Tb + IMERG Final V07B、PyFLEXTRKR 口径 B。"
    ],
    "fig1-life": [
      "衍生表：tables/图2_生命史指标.csv，共 2,125 个 MCS。",
      "由 runs/ecne_YYYY/stats/mcs_tracks_final_corearea_*.nc 的 mcs_status、ccs_area 计算 T_rise、T_fall、AI。",
      "月份来自各年全季MCS清单的开始时间(UTC)；2025 使用 ecne_2025_replay。",
      "检验：Kruskal–Wallis 月间差异。"
    ],
    "fig1-precip": [
      "逐时像素：runs/ecne_YYYY/mcstracking/<tag>/mcstrack_*.nc；变量 precipitation、tracknumber。",
      "最终轨迹：runs/ecne_YYYY/stats/mcs_list_ecne_spdef1_*.csv；字段 Track_index、pass_core_area。",
      "面积权重：runs/ecne_2021/stats/grid_area_from_latlon.nc；变量 grid_area。",
      "共 18,283 个逐时文件；强降水阈值 10 mm/h；2025 使用 ecne_2025_replay。"
    ],
    "fig1-precip-split": [
      "五年年度清单：正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx；字段 MCS编号、开始时间(UTC)、发展历时T_rise(h)。",
      "逐时像素：runs/ecne_YYYY/mcstracking/<tag>/mcstrack_*.nc；变量 precipitation、tracknumber。",
      "最终轨迹：runs/ecne_YYYY/stats/mcs_list_ecne_spdef1_*.csv；字段 Track_index、pass_core_area。",
      "面积权重：runs/ecne_2021/stats/grid_area_from_latlon.nc；变量 grid_area。",
      "共 18,283 个逐时文件；发展快 T_rise≤5 h；强降水阈值 10 mm/h；2025 使用 ecne_2025_replay。"
    ],
    "fig1-merge-split": [
      "五年年度清单：正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx；字段 MCS编号、开始时间(UTC)、发展历时T_rise(h)。",
      "轨迹 netCDF：runs/ecne_YYYY/stats/mcs_tracks_final_corearea_*.nc；变量 mcs_status、ccs_area、merge_cloudnumber、split_cloudnumber。",
      "统计：每轨合并/分裂事件数、发生轨迹比例、每100 MCS·小时频率；发展阶段为首次达标到 ccs_area 峰值。",
      "2025 使用 ecne_2025_replay；样本 2,125 个最终 MCS。"
    ],
    "fig1-time": [
      "五年年度清单：正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx；字段 开始时间(UTC)、发展历时T_rise(h)。",
      "生成时刻按北京时间 UTC+8 归类：凌晨 00–05、清晨 05–08、日间 08–20、夜间 20–24；清晨/夜间偏向只统计后两个时段。",
      "检验：月份 × 清晨/夜间列联表卡方齐性检验；快型与慢型分别检验。"
    ],
    "fig1-motion": [
      "轨迹 netCDF：runs/ecne_YYYY/stats/mcs_tracks_final_corearea_*.nc；字段 mcs_status、meanlat、meanlon、movement_speed、movement_distance_x/y。",
      "生成位置：每条轨迹首次满足 MCS 判据时次的 meanlat / meanlon；逐月质心取月度中位。",
      "移动：MCS 状态期内 movement_speed 均值，movement_distance_x/y 累加；2025 使用 ecne_2025_replay。"
    ],
    "fig1-cloud-rain": [
      "五年年度清单：正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx。",
      "字段：最大冷云盾面积、最低冷核亮温、95分位雨率、平均强降水雨率、发展历时T_rise(h)。",
      "月间检验使用 Kruskal–Wallis；快/慢按 T_rise≤5 h 与 >5 h；强降水阈值 10 mm/h。"
    ],
    fig2: [
      "衍生表：tables/图2_生命史指标.csv，共 2,125 个 MCS。",
      "由 runs/ecne_YYYY/stats/mcs_tracks_final_corearea_*.nc 的 mcs_status、ccs_area 计算；开始时间来自五年全季MCS清单。",
      "T_rise：首次达到 MCS 判据到 ccs_area 峰值；T_fall：峰值到末次满足 MCS；AI=T_rise/(T_rise+T_fall)。"
    ],
    "A-fig3": [
      "正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx，27 列指标。",
      "字段：MCS持续时长(h)、最大冷云盾面积、最低冷核亮温、95分位雨率、冷云盾下最大总降水、移动速度；分类字段面积增长率_归一化(%/h)。",
      "A 判据：归一化面积增长率 ≥30.19 %/h 为发展快，T_rise=0 归入发展快；Mann–Whitney U + BH 校正。",
      "上游：MERGIR 4 km Tb + IMERG Final V07B；PyFLEXTRKR 口径 B。"
    ],
    "B-fig3": [
      "正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx，27 列指标。",
      "字段：MCS持续时长(h)、最大冷云盾面积、最低冷核亮温、95分位雨率、冷云盾下最大总降水、移动速度；分类字段发展历时T_rise(h)。",
      "B 判据：T_rise≤5 h 为发展快，>5 h 为发展慢；Mann–Whitney U + BH 校正。",
      "上游：MERGIR 4 km Tb + IMERG Final V07B；PyFLEXTRKR 口径 B。"
    ],
    "C-fig3": [
      "正式科研项目/YYYY年5-9月.../全季MCS清单_口径B_SPDef1_YYYY....xlsx，27 列指标。",
      "字段：MCS持续时长(h)、最大冷云盾面积、最低冷核亮温、95分位雨率、冷云盾下最大总降水、移动速度；分类字段冷核降温速率(K/h)。",
      "C 判据：冷核降温速率 ≥0.62 K/h 为发展快，T_rise=0 归入发展快；Mann–Whitney U + BH 校正。",
      "上游：MERGIR 4 km Tb + IMERG Final V07B；PyFLEXTRKR 口径 B。"
    ],
    "A-fig4": [
      "五年年度清单：开始时间(UTC)、发展历时T_rise(h)、面积增长率_归一化(%/h)。",
      "A 分组：面积增长率 ≥30.19 %/h 为发展快，T_rise=0 归入发展快；北京时间 UTC+8。",
      "交叉表：清晨 05–08、夜间 20–24；卡方检验。"
    ],
    "B-fig4": [
      "五年年度清单：开始时间(UTC)、发展历时T_rise(h)。",
      "B 分组：T_rise≤5 h 为发展快，>5 h 为发展慢；北京时间 UTC+8。",
      "交叉表：清晨 05–08、夜间 20–24；卡方检验。"
    ],
    "C-fig4": [
      "五年年度清单：开始时间(UTC)、发展历时T_rise(h)、冷核降温速率(K/h)。",
      "C 分组：冷核降温速率 ≥0.62 K/h 为发展快，T_rise=0 归入发展快；北京时间 UTC+8。",
      "交叉表：清晨 05–08、夜间 20–24；卡方检验。"
    ],
    "AB-fig3": ["待组合逻辑定义；未来使用五年年度清单的 A/B 字段和 n=2,125 样本。"],
    "AB-fig4": ["待组合逻辑定义；未来使用五年年度清单的 A/B 字段和生成时刻。"],
    "AC-fig3": ["待组合逻辑定义；未来使用五年年度清单的 A/C 字段和 n=2,125 样本。"],
    "AC-fig4": ["待组合逻辑定义；未来使用五年年度清单的 A/C 字段和生成时刻。"],
    "BC-fig3": ["待组合逻辑定义；未来使用五年年度清单的 B/C 字段和 n=2,125 样本。"],
    "BC-fig4": ["待组合逻辑定义；未来使用五年年度清单的 B/C 字段和生成时刻。"],
    "ABC-fig3": ["待组合逻辑定义；未来使用五年年度清单的 A/B/C 字段和 n=2,125 样本。"],
    "ABC-fig4": ["待组合逻辑定义；未来使用五年年度清单的 A/B/C 字段和生成时刻。"]
  };

  const svg = $("treeSvg");
  const viewport = $("viewport");
  const edgesLayer = $("edges");
  const nodesLayer = $("nodes");
  const treeWrap = $("treeWrap");
  const mobileTree = $("mobileTree");
  let dragStart = null;
  let lastMobileLayout = isMobileLayout();

  function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    }
    return el;
  }

  function clearNode(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function wrapTitle(text, maxChars) {
    const raw = Array.from(String(text || ""));
    if (!raw.length) return [""];
    const limit = maxChars || 16;
    const lines = [];
    let current = "";
    for (const ch of raw) {
      if ((current + ch).length > limit) {
        lines.push(current);
        current = ch;
        if (lines.length === 2) break;
      } else {
        current += ch;
      }
    }
    if (current && lines.length < 2) lines.push(current);
    if (raw.length > limit * 2 && lines.length === 2) {
      lines[1] = lines[1].slice(0, Math.max(1, limit - 1)) + "…";
    }
    return lines;
  }

  function shortMeta(text, maxChars) {
    const s = String(text || "");
    const arr = Array.from(s);
    const limit = maxChars || 25;
    return arr.length > limit ? arr.slice(0, limit - 1).join("") + "…" : s;
  }

  function walk(node, fn, parent) {
    fn(node, parent || null);
    (node.children || []).forEach((child) => walk(child, fn, node));
  }

  function eachThemeNode(fn) {
    NAV.themes.forEach((theme) => {
      walk(theme.root, (node) => fn(node, theme));
    });
  }

  function isAvailable(node) {
    return node && node.kind === "figure" && node.status === "available" && !!node.image;
  }

  function countAvailableByGroup() {
    const counts = {};
    eachThemeNode((node) => {
      if (isAvailable(node) && node.compareGroup) {
        counts[node.compareGroup] = (counts[node.compareGroup] || 0) + 1;
      }
    });
    return counts;
  }

  function availableFigureCount(node) {
    let total = node.kind === "figure" && node.status === "available" ? 1 : 0;
    (node.children || []).forEach((child) => { total += availableFigureCount(child); });
    return total;
  }

  function visibleChildren(node) {
    return node.collapsed ? [] : (node.children || []);
  }

  function isMobileLayout() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function mobileBadgeText(node) {
    const children = node.children || [];
    if (!children.length) return "";
    const figureCount = children.reduce(
      (sum, child) => sum + availableFigureCount(child),
      0
    );
    return figureCount > 0 ? `${figureCount}图` : `${children.length}项`;
  }

  function createMobileNodeCard(node, tagName) {
    const card = document.createElement(tagName);
    card.className = `mobile-node m-kind-${node.kind}`;
    if (tagName === "button") card.type = "button";

    const accent = document.createElement("span");
    accent.className = "mobile-node-accent";
    accent.style.background = accentColor(node);

    const main = document.createElement("span");
    main.className = "mobile-node-main";
    const title = document.createElement("span");
    title.className = "mobile-node-title";
    title.textContent = node.title || "";
    main.appendChild(title);
    if (node.meta) {
      const meta = document.createElement("span");
      meta.className = "mobile-node-meta";
      meta.textContent = node.meta;
      main.appendChild(meta);
    }

    const side = document.createElement("span");
    side.className = "mobile-node-side";
    const badgeText = mobileBadgeText(node);
    if (badgeText) {
      const badge = document.createElement("span");
      badge.className = "mobile-node-badge";
      badge.textContent = badgeText;
      side.appendChild(badge);
    }
    if (node.kind === "figure") {
      const dot = document.createElement("span");
      dot.className = "mobile-status-dot" + (node.status === "available" ? " available" : "");
      dot.setAttribute("aria-hidden", "true");
      side.appendChild(dot);
    }

    card.appendChild(accent);
    card.appendChild(main);
    card.appendChild(side);
    return card;
  }

  function renderMobileNode(node) {
    const children = node.children || [];
    if (!children.length) {
      const button = createMobileNodeCard(node, "button");
      button.addEventListener("click", () => openDetail(node));
      button.setAttribute("aria-label", `打开 ${node.title}`);
      return button;
    }

    const details = document.createElement("details");
    details.className = "mobile-tree-group";
    details.open = !node.collapsed;

    const summary = createMobileNodeCard(node, "summary");
    const chevron = document.createElement("span");
    chevron.className = "mobile-chevron";
    chevron.textContent = "›";
    chevron.setAttribute("aria-hidden", "true");
    summary.lastElementChild.appendChild(chevron);
    details.appendChild(summary);

    const nested = document.createElement("div");
    nested.className = "mobile-tree-children";
    children.forEach((child) => nested.appendChild(renderMobileNode(child)));
    details.appendChild(nested);
    details.addEventListener("toggle", () => {
      node.collapsed = !details.open;
    });
    return details;
  }

  function renderMobileTree() {
    if (!mobileTree || !state.root) return;
    clearNode(mobileTree);

    const head = document.createElement("div");
    head.className = "mobile-tree-head";
    const headText = document.createElement("div");
    const headTitle = document.createElement("strong");
    headTitle.textContent = "手机浏览模式";
    const headNote = document.createElement("span");
    headNote.textContent = "点文字分支展开，点有图节点查看详情；详情从页面底部弹出。";
    headText.appendChild(headTitle);
    headText.appendChild(headNote);
    head.appendChild(headText);
    mobileTree.appendChild(head);

    const rootCard = createMobileNodeCard(state.root, "div");
    mobileTree.appendChild(rootCard);

    const rootChildren = document.createElement("div");
    rootChildren.className = "mobile-tree-children";
    (state.root.children || []).forEach((child) => {
      rootChildren.appendChild(renderMobileNode(child));
    });
    mobileTree.appendChild(rootChildren);
  }

  function layoutTree(root) {
    let cursor = MARGIN_Y;
    function visit(node, depth) {
      node._x = MARGIN_X + depth * LEVEL_GAP;
      node._depth = depth;
      node._w = NODE_W;
      node._h = NODE_H;
      const kids = visibleChildren(node);
      node._visibleChildren = kids;
      if (!kids.length) {
        node._y = cursor;
        cursor += NODE_H + V_GAP;
      } else {
        kids.forEach((child) => visit(child, depth + 1));
        node._y = (kids[0]._y + kids[kids.length - 1]._y) / 2;
      }
    }
    visit(root, 0);
    return { minX: MARGIN_X, maxX: MARGIN_X + NODE_W, maxY: cursor - V_GAP };
  }

  function applyTransform() {
    viewport.setAttribute(
      "transform",
      `translate(${state.tx} ${state.ty}) scale(${state.scale})`
    );
  }

  function fitView() {
    if (!state.root) return;
    const nodes = [];
    walk(state.root, (node) => {
      if (node._x !== undefined && node._y !== undefined) {
        const visible = node === state.root || isInVisibleTree(state.root, node);
        if (visible) nodes.push(node);
      }
    });
    if (!nodes.length) return;
    const minX = Math.min(...nodes.map((n) => n._x));
    const maxX = Math.max(...nodes.map((n) => n._x + NODE_W));
    const minY = Math.min(...nodes.map((n) => n._y));
    const maxY = Math.max(...nodes.map((n) => n._y + NODE_H));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const pad = 84;
    const availableW = Math.max(320, treeWrap.clientWidth - pad * 2);
    const availableH = Math.max(260, treeWrap.clientHeight - pad * 2);
    const scale = Math.min(availableW / width, availableH / height, 1.05);
    state.scale = Math.max(0.16, Math.min(scale, 2.7));
    state.tx = (treeWrap.clientWidth - width * state.scale) / 2 - minX * state.scale;
    state.ty = (treeWrap.clientHeight - height * state.scale) / 2 - minY * state.scale;
    applyTransform();
  }

  function isInVisibleTree(root, target) {
    let found = false;
    function rec(node) {
      if (found) return;
      if (node === target) {
        found = true;
        return;
      }
      visibleChildren(node).forEach(rec);
    }
    rec(root);
    return found;
  }

  function makeEdge(parent, child) {
    const x1 = parent._x + NODE_W;
    const y1 = parent._y + NODE_H / 2;
    const x2 = child._x;
    const y2 = child._y + NODE_H / 2;
    const mid = (x1 + x2) / 2;
    const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
    const cls = "edge" + (child.status === "pending" || child.kind === "combo" ? " pending" : "");
    return svgEl("path", { d, class: cls });
  }

  function accentColor(node) {
    if (node.accent) return node.accent;
    if (node.kind === "root") return "#17324d";
    if (node.kind === "section") return "#2e75b6";
    if (node.kind === "combo") return "#7c6f9e";
    if (node.kind === "decision") return "#b7791f";
    if (node.kind === "option") return "#8b7354";
    if (node.kind === "figure") return "#2e75b6";
    return "#8aa4b8";
  }

  function drawNode(node, counts) {
    const g = svgEl("g", {
      class: `node node-${node.kind}${node.status === "pending" ? " pending" : ""}`,
      transform: `translate(${node._x} ${node._y})`,
      "data-id": node.id,
      tabindex: "0",
      role: "button"
    });

    const title = svgEl("title");
    title.textContent = node.title + (node.meta ? `\n${node.meta}` : "");
    g.appendChild(title);

    g.appendChild(svgEl("rect", {
      class: "node-bg", x: 0, y: 0, width: NODE_W, height: NODE_H, rx: 13
    }));

    if (node.kind !== "root") {
      g.appendChild(svgEl("rect", {
        class: "node-accent",
        x: 0,
        y: 5,
        width: 5,
        height: NODE_H - 10,
        rx: 2.5,
        fill: accentColor(node)
      }));
    }

    const hasChildren = (node.children || []).length > 0;
    let iconText = "•";
    if (hasChildren) iconText = node.collapsed ? "▸" : "▾";
    if (node.kind === "figure" && node.status === "pending") iconText = "○";
    const icon = svgEl("text", { class: "node-icon", x: 14, y: 20 });
    icon.textContent = iconText;
    g.appendChild(icon);

    const lines = wrapTitle(node.title, node.kind === "root" ? 18 : 14);
    const startY = lines.length === 1 ? 29 : 23;
    lines.forEach((line, index) => {
      const t = svgEl("text", {
        class: "node-title",
        x: 26,
        y: startY + index * 17
      });
      t.textContent = line;
      g.appendChild(t);
    });

    const meta = svgEl("text", { class: "node-meta", x: 26, y: NODE_H - 12 });
    meta.textContent = shortMeta(node.meta, node.kind === "root" ? 27 : 25);
    g.appendChild(meta);

    if (hasChildren) {
      const figCount = (node.children || []).reduce((sum, child) => sum + availableFigureCount(child), 0);
      const badge = svgEl("text", {
        class: "node-badge",
        x: NODE_W - 14,
        y: NODE_H - 12,
        "text-anchor": "end"
      });
      badge.textContent = figCount > 0 ? `${figCount}图` : `${(node.children || []).length}项`;
      g.appendChild(badge);
    }
    if (node.kind === "figure") {
      const dot = svgEl("circle", {
        class: "status-dot",
        cx: NODE_W - 16,
        cy: 15,
        r: 4,
        fill: node.status === "available" ? "#4c9f70" : "none",
        stroke: node.status === "available" ? "#4c9f70" : "#aebccc",
        "stroke-width": 1.5
      });
      g.appendChild(dot);
    }

    if (node.kind === "figure" && node.compareGroup && node.status === "available") {
      const count = counts[node.compareGroup] || 0;
      const active = count >= 2;
      const btn = svgEl("g", {
        class: "compare-btn" + (active ? "" : " disabled"),
        transform: `translate(${NODE_W - 58} 9)`,
        role: "button",
        "aria-label": "同类图对比"
      });
      const btitle = svgEl("title");
      btitle.textContent = active ? "对比同类型图" : "同类型图不足 2 张";
      btn.appendChild(btitle);
      btn.appendChild(svgEl("rect", { width: 28, height: 20, rx: 7 }));
      const btxt = svgEl("text", { x: 14, y: 14, "text-anchor": "middle" });
      btxt.textContent = "⇄";
      btn.appendChild(btxt);
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (active) openCompare(node.compareGroup, node.id);
        else toast("同类型图目前不足 2 张；生成其他判据或年份的图后即可对比。");
      });
      g.appendChild(btn);
    }

    g.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    g.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.moveDistance > 4) return;
      if (hasChildren) {
        node.collapsed = !node.collapsed;
        render();
      } else {
        openDetail(node);
      }
    });

    g.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (hasChildren) {
          node.collapsed = !node.collapsed;
          render();
        } else {
          openDetail(node);
        }
      }
    });

    return g;
  }

  function render(options) {
    const opts = options || {};
    layoutTree(state.root);
    clearNode(edgesLayer);
    clearNode(nodesLayer);
    const counts = countAvailableByGroup();

    walkVisible(state.root, (node) => {
      (node._visibleChildren || []).forEach((child) => {
        edgesLayer.appendChild(makeEdge(node, child));
      });
      nodesLayer.appendChild(drawNode(node, counts));
    });

    applyTransform();
    if (opts.fit) {
      requestAnimationFrame(fitView);
    }
    renderMobileTree();
  }

  function walkVisible(node, fn) {
    fn(node);
    (node._visibleChildren || []).forEach((child) => walkVisible(child, fn));
  }

  function setTheme(themeId) {
    const theme = NAV.themes.find((t) => t.id === themeId) || NAV.themes[0];
    if (!theme) return;
    state.themeId = theme.id;
    state.theme = theme;
    state.root = theme.root;
    $("pageTitle").textContent = theme.title;
    $("themeBadge").textContent = theme.subtitle || "";
    $("themeSelect").value = theme.id;
    render({ fit: true });
  }

  function initThemeSelect() {
    const select = $("themeSelect");
    clearNode(select);
    NAV.themes.forEach((theme) => {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.title;
      select.appendChild(option);
    });
    select.value = state.themeId;
    select.addEventListener("change", () => setTheme(select.value));
  }

  function setAllCollapsed(node, value, isRoot) {
    if (!isRoot && node.children && node.children.length) node.collapsed = value;
    (node.children || []).forEach((child) => setAllCollapsed(child, value, false));
  }

  function expandAll() {
    setAllCollapsed(state.root, false, true);
    state.root.collapsed = false;
    render({ fit: true });
    toast(isMobileLayout() ? "已展开全部节点；上下滑动查看。" : "已展开全部节点；可用滚轮放大查看。");
  }

  function collapseAll() {
    state.root.collapsed = false;
    (state.root.children || []).forEach((child) => setAllCollapsed(child, true, false));
    render({ fit: true });
    toast("已收起为文字总览。");
  }

  function openDetail(node) {
    state.selectedId = node.id;
    const kicker = node.figureNo
      ? `${node.figureNo} · ${node.status === "pending" ? "待生成" : "可查看"}`
      : node.kind === "option"
        ? "判据选项"
        : node.kind === "decision"
          ? "判据分歧"
      : node.kind === "criterion" || node.kind === "combo"
        ? "判据 / 分支"
        : node.table ? "对比表" : "文字节点";
    $("drawerKicker").textContent = kicker;
    $("drawerTitle").textContent = node.title;
    $("drawerMeta").textContent = node.meta || "";

    const imageWrap = $("drawerImageWrap");
    clearNode(imageWrap);
    const actions = $("drawerActions");
    clearNode(actions);

    if (node.image) {
      const img = document.createElement("img");
      img.className = "drawer-image";
      img.src = encodeURI(node.image);
      img.alt = node.title;
      img.addEventListener("click", () => openLightbox(node.image, node.title));
      imageWrap.appendChild(img);

      const zoomBtn = document.createElement("button");
      zoomBtn.className = "btn";
      zoomBtn.textContent = "放大查看";
      zoomBtn.addEventListener("click", () => openLightbox(node.image, node.title));
      actions.appendChild(zoomBtn);

      const openBtn = document.createElement("button");
      openBtn.className = "btn";
      openBtn.textContent = "新标签打开";
      openBtn.addEventListener("click", () => window.open(encodeURI(node.image), "_blank", "noopener"));
      actions.appendChild(openBtn);

      if (node.pdf) {
        const pdfBtn = document.createElement("button");
        pdfBtn.className = "btn";
        pdfBtn.textContent = "打开 PDF";
        pdfBtn.addEventListener("click", () => window.open(encodeURI(node.pdf), "_blank", "noopener"));
        actions.appendChild(pdfBtn);
      }

      if (node.compareGroup) {
        const cmpBtn = document.createElement("button");
        cmpBtn.className = "btn";
        cmpBtn.textContent = "对比同类图";
        cmpBtn.addEventListener("click", () => openCompare(node.compareGroup, node.id));
        actions.appendChild(cmpBtn);
      }
    } else if (node.kind === "figure" && node.status === "pending") {
      const pending = document.createElement("div");
      pending.className = "pending-box";
      pending.innerHTML = "<strong>该图尚未生成</strong><span>" + escapeHtml(node.note || "待相关统计完成后生成。") + "</span>";
      imageWrap.appendChild(pending);

      if (node.compareGroup) {
        const cmpBtn = document.createElement("button");
        cmpBtn.className = "btn";
        cmpBtn.textContent = "查看同类图";
        cmpBtn.addEventListener("click", () => openCompare(node.compareGroup, node.id));
        actions.appendChild(cmpBtn);
      }
    }

    const provenance = node.provenance || PROVENANCE.byId[node.id];
    renderProvenance(provenance);
    renderSource(provenance ? null : (node.source || SOURCE_BY_ID[node.id]));
    renderDetailTable(node.table);
    const statsWrap = $("drawerStats");
    clearNode(statsWrap);
    if (node.stats && node.stats.length) {
      const label = document.createElement("div");
      label.className = "drawer-section-label";
      label.textContent = "关键信息";
      statsWrap.appendChild(label);
      const table = document.createElement("div");
      table.className = "stat-table";
      node.stats.forEach(([k, v]) => {
        const kd = document.createElement("div");
        kd.className = "stat-k";
        kd.textContent = k;
        const vd = document.createElement("div");
        vd.className = "stat-v";
        vd.textContent = v;
        table.appendChild(kd);
        table.appendChild(vd);
      });
      statsWrap.appendChild(table);
    }

    $("drawerNote").textContent = node.note || "";
    $("drawer").classList.add("open");
    $("drawerBackdrop").classList.add("open");
    syncOverlayLock();
  }

  function renderSource(lines) {
    const wrap = $("drawerSource");
    clearNode(wrap);
    if (!lines || !lines.length) return;
    const box = document.createElement("div");
    box.className = "source-box";
    const title = document.createElement("strong");
    title.textContent = "数据来源";
    box.appendChild(title);
    const ul = document.createElement("ul");
    lines.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    });
    box.appendChild(ul);
    wrap.appendChild(box);
  }

  function renderProvenance(data) {
    const wrap = $("drawerProvenance");
    clearNode(wrap);
    if (!data) return;

    const box = document.createElement("div");
    box.className = "provenance-box";
    box.setAttribute("aria-label", "完整数据溯源链");

    const head = document.createElement("div");
    head.className = "provenance-head";
    const title = document.createElement("strong");
    title.textContent = "完整数据溯源链";
    const hint = document.createElement("span");
    hint.textContent = "从成品到原始数据";
    head.appendChild(title);
    head.appendChild(hint);
    box.appendChild(head);

    const chain = document.createElement("div");
    chain.className = "provenance-chain";
    PROVENANCE_FIELDS.forEach(([key, label]) => {
      if (!data[key]) return;
      const step = document.createElement("div");
      step.className = "provenance-step";
      const keyEl = document.createElement("span");
      keyEl.className = "provenance-label";
      keyEl.textContent = label;
      const valueEl = document.createElement("span");
      valueEl.className = "provenance-value";
      valueEl.textContent = data[key];
      step.appendChild(keyEl);
      step.appendChild(valueEl);
      chain.appendChild(step);
    });
    box.appendChild(chain);
    wrap.appendChild(box);
  }

  function renderDetailTable(tableData) {
    const wrap = $("drawerTable");
    clearNode(wrap);
    if (!tableData || !tableData.headers || !tableData.rows) return;

    const label = document.createElement("div");
    label.className = "drawer-section-label";
    label.textContent = "对比表";
    wrap.appendChild(label);

    const scroller = document.createElement("div");
    scroller.className = "detail-table-wrap";
    const table = document.createElement("table");
    table.className = "detail-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    tableData.headers.forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tableData.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((value, col) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (tableData.align && tableData.align[col] === "left") td.classList.add("left");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    scroller.appendChild(table);
    wrap.appendChild(scroller);

    if (tableData.note) {
      const note = document.createElement("div");
      note.className = "table-note";
      note.textContent = tableData.note;
      wrap.appendChild(note);
    }
  }

  function closeDetail() {
    $("drawer").classList.remove("open");
    $("drawerBackdrop").classList.remove("open");
    syncOverlayLock();
  }

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function comparableItems(group) {
    const items = [];
    eachThemeNode((node, theme) => {
      if (isAvailable(node) && node.compareGroup === group) {
        items.push({
          key: `${theme.id}::${node.id}`,
          theme,
          node,
          label: `${theme.title} · ${node.compareLabel || node.title}`
        });
      }
    });
    return items;
  }

  function openCompare(group, currentNodeId) {
    state.compareGroup = group || "fig3";
    $("compareGroup").value = state.compareGroup;
    populateCompare(state.compareGroup, currentNodeId, true);
    $("compareModal").classList.add("open");
    syncOverlayLock();
  }

  function populateCompare(group, currentNodeId, resetSelection) {
    const items = comparableItems(group);
    state.compareItems = items;
    const picker = $("comparePicker");
    clearNode(picker);

    if (resetSelection) {
      state.compareSelected = new Set();
      if (items.length) {
        if (currentNodeId) {
          const current = items.find((item) => item.node.id === currentNodeId);
          if (current) state.compareSelected.add(current.key);
        }
        for (const item of items) {
          if (state.compareSelected.size >= 3) break;
          state.compareSelected.add(item.key);
        }
      }
    } else {
      state.compareSelected = new Set(
        [...state.compareSelected].filter((key) => items.some((item) => item.key === key))
      );
    }

    items.forEach((item) => {
      const chip = document.createElement("label");
      chip.className = "compare-chip";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = item.key;
      checkbox.checked = state.compareSelected.has(item.key);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.compareSelected.add(item.key);
        else state.compareSelected.delete(item.key);
        renderCompareSelection();
      });
      const text = document.createElement("span");
      text.textContent = item.label;
      chip.appendChild(checkbox);
      chip.appendChild(text);
      picker.appendChild(chip);
    });

    const msg = $("compareMessage");
    if (!items.length) {
      msg.textContent = "当前图类型还没有可用图片；生成后会自动出现在这里。";
      msg.classList.add("show");
    } else if (items.length === 1) {
      msg.textContent = "当前只有 1 张可用图；生成其他判据或年份图后即可并排对比。";
      msg.classList.add("show");
    } else {
      msg.classList.remove("show");
    }
    renderCompareSelection();
  }

  function compareColumnCount(count) {
    if (count <= 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 2;
    if (count === 4) return 2;
    return 3;
  }

  function renderCompareSelection() {
    const grid = $("compareGrid");
    const selected = state.compareItems.filter((item) => state.compareSelected.has(item.key));
    clearNode(grid);
    const columns = state.compareLayout === "auto"
      ? compareColumnCount(selected.length)
      : Math.max(1, Math.min(3, Number(state.compareLayout) || 1));
    grid.className = `compare-grid cols-${columns}`;

    if (!selected.length) {
      const empty = document.createElement("div");
      empty.className = "compare-empty";
      empty.textContent = "请至少勾选一张图。";
      grid.appendChild(empty);
    }

    selected.forEach((item) => {
      const panel = document.createElement("div");
      panel.className = "compare-panel";
      const cap = document.createElement("div");
      cap.className = "compare-cap";
      const label = document.createElement("span");
      label.textContent = item.label;
      label.title = item.label;
      const open = document.createElement("a");
      open.textContent = "新标签打开";
      open.href = encodeURI(item.node.image);
      open.target = "_blank";
      open.rel = "noopener";
      cap.appendChild(label);
      cap.appendChild(open);
      const wrap = document.createElement("div");
      wrap.className = "compare-image-wrap";
      const img = document.createElement("img");
      img.src = encodeURI(item.node.image);
      img.alt = item.label;
      img.loading = "lazy";
      img.addEventListener("click", () => openLightbox(item.node.image, item.label));
      wrap.appendChild(img);
      panel.appendChild(cap);
      panel.appendChild(wrap);
      grid.appendChild(panel);
    });

    const msg = $("compareMessage");
    if (!state.compareItems.length) {
      msg.textContent = "当前图类型还没有可用图片；生成后会自动出现在这里。";
      msg.classList.add("show");
    } else if (state.compareItems.length === 1) {
      msg.textContent = "当前只有 1 张可用图；生成其他判据或年份图后即可并排对比。";
      msg.classList.add("show");
    } else if (selected.length === 0) {
      msg.textContent = "请至少勾选一张图。";
      msg.classList.add("show");
    } else if (selected.length === 1) {
      msg.textContent = "已选择 1 张；再勾选至少 1 张即可并排对比。";
      msg.classList.add("show");
    } else {
      msg.classList.remove("show");
    }
  }

  function selectAllCompare() {
    state.compareSelected = new Set(state.compareItems.map((item) => item.key));
    $("comparePicker").querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = true; });
    renderCompareSelection();
  }

  function clearCompareSelection() {
    state.compareSelected = new Set();
    $("comparePicker").querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
    renderCompareSelection();
  }

  function closeCompare() {
    $("compareModal").classList.remove("open");
    syncOverlayLock();
  }

  function openLightbox(src, title) {
    if (!src) return;
    $("lightboxImg").src = encodeURI(src);
    $("lightboxImg").alt = title || "";
    $("lightbox").classList.add("open");
    syncOverlayLock();
  }

  function closeLightbox() {
    $("lightbox").classList.remove("open");
    $("lightboxImg").src = "";
    syncOverlayLock();
  }

  let toastTimer = null;
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function zoomBy(factor, cx, cy) {
    const rect = svg.getBoundingClientRect();
    const px = cx == null ? rect.width / 2 : cx;
    const py = cy == null ? rect.height / 2 : cy;
    const next = Math.max(0.16, Math.min(2.8, state.scale * factor));
    const ratio = next / state.scale;
    state.tx = px - (px - state.tx) * ratio;
    state.ty = py - (py - state.ty) * ratio;
    state.scale = next;
    applyTransform();
  }

  function syncOverlayLock() {
    const open =
      $("drawer").classList.contains("open") ||
      $("compareModal").classList.contains("open") ||
      $("lightbox").classList.contains("open");
    document.body.classList.toggle("overlay-open", open);
  }

  function bindEvents() {
    $("expandAll").addEventListener("click", expandAll);
    $("collapseAll").addEventListener("click", collapseAll);
    $("fitView").addEventListener("click", fitView);
    $("zoomIn").addEventListener("click", () => zoomBy(1.18));
    $("zoomOut").addEventListener("click", () => zoomBy(0.84));
    $("zoomReset").addEventListener("click", fitView);
    $("openCompare").addEventListener("click", () => openCompare("fig3"));
    $("closeDrawer").addEventListener("click", closeDetail);
    $("drawerBackdrop").addEventListener("click", closeDetail);
    $("closeCompare").addEventListener("click", closeCompare);
    $("selectAllCompare").addEventListener("click", selectAllCompare);
    $("clearCompare").addEventListener("click", clearCompareSelection);
    $("compareLayout").addEventListener("change", (event) => {
      state.compareLayout = event.target.value;
      renderCompareSelection();
    });
    $("compareGroup").addEventListener("change", (event) => {
      state.compareGroup = event.target.value;
      populateCompare(event.target.value, null, true);
    });
    $("closeLightbox").addEventListener("click", closeLightbox);

    $("lightbox").addEventListener("click", (event) => {
      if (event.target === $("lightbox")) closeLightbox();
    });
    $("compareModal").addEventListener("click", (event) => {
      if (event.target === $("compareModal")) closeCompare();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if ($("lightbox").classList.contains("open")) closeLightbox();
        else if ($("compareModal").classList.contains("open")) closeCompare();
        else closeDetail();
      }
    });

    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomBy(event.deltaY < 0 ? 1.10 : 0.90, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      state.moveDistance = 0;
      dragStart = {
        x: event.clientX,
        y: event.clientY,
        tx: state.tx,
        ty: state.ty
      };
      svg.setPointerCapture(event.pointerId);
    });

    svg.addEventListener("pointermove", (event) => {
      if (!dragStart) return;
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      state.moveDistance = Math.max(state.moveDistance, Math.abs(dx) + Math.abs(dy));
      state.tx = dragStart.tx + dx;
      state.ty = dragStart.ty + dy;
      applyTransform();
    });

    svg.addEventListener("pointerup", () => {
      dragStart = null;
      setTimeout(() => { state.moveDistance = 0; }, 0);
    });

    svg.addEventListener("pointercancel", () => {
      dragStart = null;
      state.moveDistance = 0;
    });

    svg.addEventListener("dblclick", (event) => {
      if (event.target === svg) fitView();
    });

    window.addEventListener("resize", () => {
      const mobileLayout = isMobileLayout();
      if (mobileLayout !== lastMobileLayout) {
        lastMobileLayout = mobileLayout;
        render({ fit: true });
        return;
      }
      renderMobileTree();
      if (state.firstFit) fitView();
    });
  }

  function findNodeInRoot(root, id) {
    let found = null;
    walk(root, (node) => {
      if (node.id === id) found = node;
    });
    return found;
  }

  function expandPathTo(root, targetId) {
    function rec(node, ancestors) {
      if (node.id === targetId) {
        ancestors.forEach((ancestor) => { ancestor.collapsed = false; });
        node.collapsed = false;
        return true;
      }
      for (const child of (node.children || [])) {
        if (rec(child, ancestors.concat(node))) return true;
      }
      return false;
    }
    return rec(root, []);
  }

  function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    if (openId) {
      expandPathTo(state.root, openId);
      render({ fit: true });
      const node = findNodeInRoot(state.root, openId);
      if (node) openDetail(node);
    }
    const group = params.get("compare");
    if (group) openCompare(group);
  }
  function init() {
    initThemeSelect();
    bindEvents();
    setTheme(state.themeId);
    handleDeepLink();
    state.firstFit = false;
  }

  init();
})();



