// Аким Астаны: разрули! (QAZGOV 3D SIM v5)
// Нативная дизайн-система 1-в-1 из референса (Oswald + Manrope, #0c1723 / #142330 / #ffbd69 / #8edcbe / #ff9f8b)
// + 3D-Здания Астаны (OpenFreeMap + MapLibre) + deck.gl + 6 компетенций РК (Тест До -> Кейсы & WarAgent -> Тест После -> Отчет)

(function () {
  const DATA = window.QAZGOV_DATA;

  const GROUPS = [
    { id: "all", label: "Все проекты (11)" },
    { id: "Раздел 1", label: "1. Замер и спрос" },
    { id: "Раздел 2", label: "2. Светофоры и ряд" },
    { id: "Раздел 3", label: "3. Автобус и ЛРТ" },
    { id: "Раздел 4", label: "4. ТЭЦ и Закон" }
  ];

  const state = {
    showStartScreen: true,
    activeModal: null, // null | 'academy' | 'waragent' | 'report'
    academySubTab: "matrix", // 'matrix' | 'pre' | 'missions' | 'post' | 'laws'
    selectedGroupId: "all",
    selectedProjectId: "prj_cameras",
    selectedDistrictId: "yesil",
    activeEventModal: null,
    endgameModal: null, // null | 'win' | 'lose' | 'riot'

    layersVisible: {
      buildings3d: true,
      lrt: true,
      trafficLights: true,
      trips: true,
      arcs: true,
      hexagons: false,
      polygons: true
    },

    userName: "Алихан Сейтказиев",
    xp: 120,
    currentMonth: 1,
    maxMonths: 60,
    freeBudget: 100.0,
    reservedOpex: 0.0,
    spentCapex: 0.0,
    camerasUnlocked: false,

    activeProjects: [],
    completedProjects: {},
    triggeredEvents: {},
    monthlyHistory: [78],
    finalWindowRecords: {}, // 55..60 -> cong%

    city: {
      congestion: DATA.cityMeta.initialCongestion, // 78%
      trust: DATA.cityMeta.initialTrust, // 65%
      wear: DATA.cityMeta.initialWear, // 58%
      legal: DATA.cityMeta.initialLegal // 78%
    },

    scores: {
      pre: { appk: 42, budget_gz: 46, urban_traffic: 40, infra_crisis: 48, ethics_anticor: 52, diplomacy_waragent: 44 },
      simBonus: { appk: 0, budget_gz: 0, urban_traffic: 0, infra_crisis: 0, ethics_anticor: 0, diplomacy_waragent: 0 },
      post: { appk: null, budget_gz: null, urban_traffic: null, infra_crisis: null, ethics_anticor: null, diplomacy_waragent: null }
    },

    preAnswers: {},
    postAnswers: {},
    completedMissions: {},
    activeMissionId: "mission_traffic",
    activeWarAgentScenarioId: "wa_water_energy",
    warAgentMoves: {},

    latestNews:
      "Вы назначены акимом Астаны. Сначала установите камеры «Сергек» и разведите утренние часы пик без перекрытия улиц."
  };

  let mapInstance = null;
  let deckOverlay = null;
  let tripsTime = 0;
  let hexPointsCache = [];
  // По умолчанию авто-орбита выключена, чтобы пользователь мог свободно двигать, зумировать и крутить карту мышью!
  let autoOrbitActive = false;
  let isUserInteractingWithMap = false;
  let freeMapMode = false;
  let kpiAnimatedValues = {
    budget: 100.0,
    congestion: 78,
    trust: 65,
    month: 1,
    xp: 120
  };

  // Импульсная голографическая волна по 3D-карте при запуске проекта или смене месяца
  function triggerTelemetryPulse(colorHex = "#8edcbe") {
    const wave = document.getElementById("telemetry-pulse-wave");
    if (!wave || typeof gsap === "undefined") return;
    wave.style.borderColor = colorHex;
    wave.style.boxShadow = `0 0 40px ${colorHex}, inset 0 0 24px ${colorHex}`;
    gsap.killTweensOf(wave);
    gsap.fromTo(
      wave,
      { scale: 0.2, opacity: 0.9 },
      { scale: 28, opacity: 0, duration: 1.35, ease: "expo.out" }
    );
  }

  function syncOrbitButtonsUI() {
    const btn = document.getElementById("btn-orbit-cam");
    if (btn) {
      btn.textContent = autoOrbitActive ? "3D ОРБИТА: ВКЛ" : "3D ОРБИТА: ВЫКЛ";
      btn.className = autoOrbitActive ? "gold" : "muted";
    }
    const badge = document.getElementById("map-mode-badge");
    if (badge) {
      badge.textContent = autoOrbitActive ? "ОРБИТА" : "СВОБОДНО";
      badge.className = autoOrbitActive ? "gold" : "mint";
    }
  }

  window.toggleAutoOrbit = function () {
    autoOrbitActive = !autoOrbitActive;
    syncOrbitButtonsUI();
    if (autoOrbitActive) {
      showToast("3D-орбита включена. Потяните карту мышью, чтобы снова перейти в ручное управление.");
    }
  };

  // Пульт 3D-камеры: сдвиг, зум, поворот, 2D/3D наклон и режим «Свободный обзор карты»
  window.panMapBy = function (dx, dy) {
    if (!mapInstance) return;
    autoOrbitActive = false;
    syncOrbitButtonsUI();
    mapInstance.panBy([dx, dy], { duration: 320 });
  };

  window.zoomMapBy = function (deltaZoom) {
    if (!mapInstance) return;
    autoOrbitActive = false;
    syncOrbitButtonsUI();
    mapInstance.zoomTo(mapInstance.getZoom() + deltaZoom, { duration: 280 });
  };

  window.rotateMapBy = function (deltaBearing) {
    if (!mapInstance) return;
    autoOrbitActive = false;
    syncOrbitButtonsUI();
    mapInstance.easeTo({
      bearing: mapInstance.getBearing() + deltaBearing,
      duration: 300
    });
  };

  window.toggleMapPitch = function () {
    if (!mapInstance) return;
    autoOrbitActive = false;
    syncOrbitButtonsUI();
    const curPitch = mapInstance.getPitch();
    const nextPitch = curPitch > 25 ? 0 : 60;
    mapInstance.easeTo({ pitch: nextPitch, duration: 420 });
    const btn = document.getElementById("btn-pitch-toggle");
    if (btn) btn.textContent = nextPitch > 25 ? "3D" : "2D";
  };

  window.toggleFreeMapMode = function () {
    freeMapMode = !freeMapMode;
    const shell = document.getElementById("game-shell");
    if (shell) {
      shell.classList.toggle("map-free-mode", freeMapMode);
    }
    const btn = document.getElementById("btn-free-map");
    if (btn) {
      btn.classList.toggle("active", freeMapMode);
      btn.innerHTML = freeMapMode
        ? `<span>👁 Вернуть панели (H)</span>`
        : `<span>👁 Свободный обзор (H)</span>`;
    }
  };

  // Анимированная футуристическая SVG-голограмма для каждого из 10 проектов внутри правого инспектора
  function getProjectHoloSvg(card) {
    const isAdmin = card.teamType === "admin";
    const accent = isAdmin ? "#38bdf8" : "#8edcbe";
    return `
      <svg class="holo-blueprint" viewBox="0 0 320 112" fill="none">
        <!-- Изометрическая сетка и коридор -->
        <path d="M 15,86 L 305,32" stroke="rgba(166,200,222,0.22)" stroke-width="18" stroke-linecap="round"/>
        <path d="M 15,86 L 305,32" stroke="${accent}" stroke-width="2.5" class="anim-dash"/>
        <path d="M 15,94 L 305,40" stroke="#ffbd69" stroke-width="1.8" class="anim-dash" style="animation-direction:reverse;"/>
        <!-- 3D Голографические узлы телеметрии -->
        <g>
          <circle cx="85" cy="73" r="6" fill="${accent}" fill-opacity="0.25">
            <animate attributeName="r" values="5;14;5" dur="2.2s" repeatCount="indefinite"/>
            <animate attributeName="fill-opacity" values="0.5;0.05;0.5" dur="2.2s" repeatCount="indefinite"/>
          </circle>
          <circle cx="85" cy="73" r="3.5" fill="${accent}"/>
          <line x1="85" y1="73" x2="85" y2="36" stroke="${accent}" stroke-width="1.2" stroke-dasharray="2 2"/>
          <rect x="48" y="16" width="76" height="18" rx="4" fill="#0c1723" stroke="${accent}" stroke-width="1"/>
          <text x="86" y="28" fill="#eef3f5" font-size="9" font-weight="700" text-anchor="middle">${card.congestionEffect}% ПРОБКИ</text>
        </g>
        <g>
          <circle cx="215" cy="49" r="6" fill="#ffbd69" fill-opacity="0.25">
            <animate attributeName="r" values="5;14;5" dur="2.2s" begin="0.7s" repeatCount="indefinite"/>
          </circle>
          <circle cx="215" cy="49" r="3.5" fill="#ffbd69"/>
          <line x1="215" y1="49" x2="215" y2="24" stroke="#ffbd69" stroke-width="1.2" stroke-dasharray="2 2"/>
          <rect x="166" y="6" width="98" height="18" rx="4" fill="#0c1723" stroke="#ffbd69" stroke-width="1"/>
          <text x="215" y="18" fill="#ffbd69" font-size="9" font-weight="700" text-anchor="middle">СРОК: ${card.buildMonths} МЕС. • +${card.xp} XP</text>
        </g>
        <!-- Движущийся лазерный импульс по магистрали -->
        <circle r="4" fill="#ffffff">
          <animateMotion dur="1.9s" repeatCount="indefinite" path="M 15,86 L 305,32"/>
        </circle>
      </svg>
    `;
  }

  // Векторные иконки для карточек проектов (чистый SVG)
  const TOOL_ICONS = {
    prj_cameras: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
    prj_schedules: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    prj_right_turn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>`,
    prj_narrow_lanes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 3v18M12 3v18M20 3v18"/></svg>`,
    prj_reversible: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`,
    prj_bus_brt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M8 15h.01M16 15h.01M6 18v3M18 18v3"/></svg>`,
    prj_carpool_micro: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>`,
    prj_lrt_launch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="12" rx="3"/><path d="M4 9h16M8 12h.01M16 12h.01M2 19h20M7 15l-2 4M17 15l2 4M12 19v3"/></svg>`,
    prj_heating_ring: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v10l4.5 4.5"/><circle cx="12" cy="14" r="8"/></svg>`,
    prj_appk_shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    prj_eqyzmet_hybrid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`
  };

  function buildHexPointsData() {
    const pts = [];
    let seed = 105;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    DATA.districts.forEach((d) => {
      const [cLng, cLat] = d.center;
      const intensity = Math.max(12, Math.round((d.congestion + d.wear) / 2));
      for (let i = 0; i < 32; i++) {
        const angle = rand() * Math.PI * 2;
        const distLng = (rand() * 0.024 + 0.001) * Math.cos(angle);
        const distLat = (rand() * 0.017 + 0.001) * Math.sin(angle);
        pts.push({
          position: [cLng + distLng, cLat + distLat],
          weight: Math.max(8, Math.round(intensity * (0.5 + rand() * 0.8))),
          districtId: d.id
        });
      }
    });
    hexPointsCache = pts;
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem("QAZGOV_ASTANA_NATIVE_V5");
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(state, parsed);
      }
    } catch (e) {}
  }

  function saveState() {
    try {
      localStorage.setItem("QAZGOV_ASTANA_NATIVE_V5", JSON.stringify(state));
    } catch (e) {}
  }

  function calculateProjectFinancials(card) {
    const openMonth = state.currentMonth + card.buildMonths;
    const activeMonthsAfterOpen = Math.max(0, state.maxMonths - openMonth);
    const opexReserve = +(card.baseCost * 0.01 * activeMonthsAfterOpen).toFixed(2);
    const totalCost = +(card.baseCost + opexReserve).toFixed(2);
    return {
      baseCost: card.baseCost,
      openMonth,
      activeMonthsAfterOpen,
      opexReserve,
      totalCost
    };
  }

  function getBusyTeamsCount() {
    let buildBusy = 0;
    let adminBusy = 0;
    state.activeProjects.forEach((p) => {
      if (p.teamType === "build") buildBusy++;
      if (p.teamType === "admin") adminBusy++;
    });
    return {
      buildBusy,
      buildFree: Math.max(0, DATA.cityMeta.maxBuildCrews - buildBusy),
      adminBusy,
      adminFree: Math.max(0, DATA.cityMeta.maxAdminTeams - adminBusy)
    };
  }

  function getCurrentConstructionPenalty() {
    return state.activeProjects.reduce((acc, p) => acc + (p.card.constructionPenalty || 0), 0);
  }

  function getEffectiveCongestion() {
    return Math.max(16, Math.min(98, state.city.congestion + getCurrentConstructionPenalty()));
  }

  function getCurrentRank() {
    let current = DATA.ranks[0];
    let next = DATA.ranks[1] || null;
    for (let i = 0; i < DATA.ranks.length; i++) {
      if (state.xp >= DATA.ranks[i].minXp) {
        current = DATA.ranks[i];
        next = DATA.ranks[i + 1] || null;
      }
    }
    return { current, next };
  }

  function getEffectivePostScore(compId) {
    const preVal = state.scores.pre[compId] || 44;
    const bonus = state.scores.simBonus[compId] || 0;
    if (state.scores.post[compId] !== null && state.scores.post[compId] !== undefined) {
      return Math.min(100, Math.round(state.scores.post[compId] * 0.7 + Math.min(100, preVal + bonus) * 0.3));
    }
    return Math.min(100, preVal + bonus);
  }

  // Тост в стиле оригинала (.toast — золотая плашка по центру вверху)
  function showToast(msg) {
    const box = document.getElementById("toast-container");
    if (!box) return;
    box.innerHTML = `<div class="toast">${msg}</div>`;
    setTimeout(() => {
      if (box.firstChild) box.innerHTML = "";
    }, 3800);
  }

  window.startCampaign = function () {
    state.showStartScreen = false;
    saveState();
    renderAll();
  };

  window.openModal = function (modalName, subTab) {
    state.activeModal = modalName;
    if (subTab) state.academySubTab = subTab;
    renderAll();
  };

  window.closeModal = function () {
    state.activeModal = null;
    renderAll();
  };

  window.setAcademySubTab = function (sub) {
    state.academySubTab = sub;
    renderModals();
  };

  window.selectProjectGroup = function (groupId) {
    state.selectedGroupId = groupId;
    const filtered = DATA.projectCards.filter(
      (c) => groupId === "all" || c.category.startsWith(groupId)
    );
    if (filtered.length && !filtered.some((c) => c.id === state.selectedProjectId)) {
      state.selectedProjectId = filtered[0].id;
    }
    renderProjectRailAndInspector();
  };

  window.selectProjectTool = function (cardId) {
    state.selectedProjectId = cardId;
    renderProjectRailAndInspector();
    if (typeof gsap !== "undefined") {
      gsap.fromTo(
        "#project-inspector .inspector-scroll > *",
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.32, stagger: 0.04, ease: "power3.out" }
      );
    }
  };

  window.selectDistrict = function (districtId, fly = true) {
    state.selectedDistrictId = districtId;
    saveState();
    renderCityHeadingAndDistricts();
    updateDeckLayers();
    const d = DATA.districts.find((item) => item.id === districtId);
    if (d && mapInstance && fly) {
      mapInstance.flyTo({
        center: d.center,
        zoom: d.zoom || 15.0,
        pitch: 58,
        bearing: -18,
        duration: 900
      });
    }
  };

  window.flyToAstanaOverview = function (closeUp = true) {
    if (!mapInstance) return;
    autoOrbitActive = false;
    syncOrbitButtonsUI();
    mapInstance.flyTo({
      center: DATA.cityMeta.centerLngLat,
      zoom: closeUp ? 15.1 : 12.2,
      pitch: closeUp ? 60 : 45,
      bearing: -22,
      duration: 900
    });
  };

  window.flyToLrtCorridor = function () {
    if (!mapInstance) return;
    autoOrbitActive = false;
    syncOrbitButtonsUI();
    state.layersVisible.lrt = true;
    renderLayerChips();
    mapInstance.flyTo({
      center: [71.4345, 51.1235],
      zoom: 15.15,
      pitch: 64,
      bearing: -34,
      duration: 1100
    });
    showToast("Камера наведена на эстакаду Astana LRT (Сыганак — Абу-Даби Плаза — Дом Министерств — Нурлы Жол)");
  };

  window.toggleLayerVisibility = function (key) {
    state.layersVisible[key] = !state.layersVisible[key];
    if (key === "buildings3d" && mapInstance && mapInstance.getLayer("astana-3d-buildings-custom")) {
      mapInstance.setLayoutProperty(
        "astana-3d-buildings-custom",
        "visibility",
        state.layersVisible.buildings3d ? "visible" : "none"
      );
    }
    updateDeckLayers();
    renderLayerChips();
  };

  function renderLayerChips() {
    ["buildings3d", "lrt", "trafficLights", "trips", "arcs", "hexagons"].forEach((k) => {
      const btn = document.getElementById(`chip-${k}`);
      if (btn) {
        btn.className = state.layersVisible[k] ? "layer-chip active" : "layer-chip";
      }
    });
  }

  // Запуск проекта из правого инспектора
  window.launchSelectedProject = function (cardId) {
    const card = DATA.projectCards.find((c) => c.id === cardId);
    if (!card) return;

    if (state.completedProjects[card.id] || state.activeProjects.some((p) => p.id === card.id)) {
      showToast("Этот проект уже запущен или работает в городе.");
      return;
    }
    if (card.requiresCameras && !state.camerasUnlocked) {
      showToast("Сначала установите камеры во всех районах коридора!");
      return;
    }
    if (state.currentMonth + card.buildMonths > state.maxMonths) {
      showToast("Не успеем закончить до конца срока полномочий.");
      return;
    }

    const teams = getBusyTeamsCount();
    if (card.teamType === "build" && teams.buildFree <= 0) {
      showToast("Обе строительные бригады заняты. Пропустите месяц (+1 мес ▶).");
      return;
    }
    if (card.teamType === "admin" && teams.adminFree <= 0) {
      showToast("Административная команда занята. Дождитесь завершения программы.");
      return;
    }

    const fin = calculateProjectFinancials(card);
    if (state.freeBudget < fin.totalCost) {
      showToast("Недостаточно свободного бюджета с учетом содержания!");
      return;
    }

    state.freeBudget = +(state.freeBudget - fin.totalCost).toFixed(2);
    state.spentCapex = +(state.spentCapex + fin.baseCost).toFixed(2);
    state.reservedOpex = +(state.reservedOpex + fin.opexReserve).toFixed(2);
    state.city.trust = Math.max(0, Math.min(100, state.city.trust + card.trustLaunch));

    state.activeProjects.push({
      id: card.id,
      title: card.title,
      teamType: card.teamType,
      monthsRemaining: card.buildMonths,
      totalMonths: card.buildMonths,
      completionMonth: fin.openMonth,
      totalWithOpex: fin.totalCost,
      card
    });

    state.latestNews = `Решение принято. Запущен проект «${card.title}» (${card.buildMonths} мес. до открытия, зарезервировано ${fin.opexReserve} млрд ₸ на содержание).`;
    showToast(`Решение принято. За работу! (${card.title})`);
    triggerTelemetryPulse("#ffbd69");

    saveState();
    renderAll();
    updateDeckLayers();
  };

  // Продвижение времени (+1 мес / +3 мес)
  window.advanceSimulationMonths = function (steps = 1) {
    if (state.activeEventModal || state.endgameModal) return;

    for (let s = 0; s < steps; s++) {
      if (state.currentMonth >= state.maxMonths) break;
      state.currentMonth++;

      const stillActive = [];
      state.activeProjects.forEach((p) => {
        p.monthsRemaining--;
        if (p.monthsRemaining <= 0) {
          const c = p.card;
          state.completedProjects[c.id] = {
            completedAtMonth: state.currentMonth,
            totalWithOpex: p.totalWithOpex,
            title: c.title
          };
          if (c.unlocksReversible) {
            state.camerasUnlocked = true;
            DATA.districts.forEach((d) => (d.camerasInstalled = true));
          }
          state.city.congestion = Math.max(16, Math.min(98, state.city.congestion + c.congestionEffect));
          state.city.wear = Math.max(15, Math.min(95, state.city.wear + c.wearEffect));
          state.city.legal = Math.max(15, Math.min(100, state.city.legal + c.legalEffect));
          state.city.trust = Math.min(100, state.city.trust + 4);
          state.xp += c.xp;

          if (c.compKey) {
            state.scores.simBonus[c.compKey] = Math.min(
              45,
              (state.scores.simBonus[c.compKey] || 0) + (c.compGain || 12)
            );
          }

          DATA.districts.forEach((d) => {
            d.congestion = Math.max(20, Math.min(96, d.congestion + Math.round(c.congestionEffect * 0.85)));
            d.wear = Math.max(18, Math.min(95, d.wear + Math.round(c.wearEffect * 0.7)));
            d.trust = Math.min(98, d.trust + 3);
          });

          state.latestNews = `Проект работает: «${c.title}». Доля опоздавших снизилась на ${Math.abs(c.congestionEffect)}%!`;
          showToast(`Объект открыт: ${c.title} (${c.congestionEffect}% пробки)`);
        } else {
          stillActive.push(p);
        }
      });
      state.activeProjects = stillActive;

      const effCong = getEffectiveCongestion();
      state.monthlyHistory.push(effCong);

      if (state.currentMonth >= 55 && state.currentMonth <= 60) {
        state.finalWindowRecords[state.currentMonth] = effCong;
      }

      if (effCong >= 72) {
        state.city.trust = Math.max(0, state.city.trust - 1);
      } else if (effCong <= 35 && state.currentMonth % 3 === 0) {
        state.city.trust = Math.min(100, state.city.trust + 2);
      }

      if (state.city.trust <= 0) {
        state.endgameModal = "riot";
        break;
      }

      const ev = DATA.randomEvents.find((e) => e.triggerMonth === state.currentMonth && !state.triggeredEvents[e.id]);
      if (ev) {
        state.triggeredEvents[ev.id] = true;
        state.activeEventModal = ev;
        break;
      }

      if (state.currentMonth >= state.maxMonths) {
        const allDistrictsOk = DATA.districts.every((d) => d.congestion <= 50);
        if (effCong <= 30 && allDistrictsOk) {
          state.endgameModal = "win";
        } else {
          state.endgameModal = "lose";
        }
        break;
      }
    }

    buildHexPointsData();
    saveState();
    renderAll();
    updateDeckLayers();
    triggerTelemetryPulse("#8edcbe");
  };

  window.resolveRandomEvent = function (optIndex) {
    const ev = state.activeEventModal;
    if (!ev) return;
    const opt = ev.options[optIndex];
    if (!opt) return;

    state.freeBudget = Math.max(0, +(state.freeBudget - opt.cost).toFixed(2));
    state.city.congestion = Math.max(16, Math.min(98, state.city.congestion + opt.congestionDelta));
    state.city.trust = Math.max(0, Math.min(100, state.city.trust + opt.trustDelta));
    state.city.legal = Math.max(15, Math.min(100, state.city.legal + opt.legalDelta));
    state.xp += opt.xp || 20;

    if (opt.compKey && opt.compGain) {
      state.scores.simBonus[opt.compKey] = Math.min(45, (state.scores.simBonus[opt.compKey] || 0) + opt.compGain);
    }

    state.latestNews = opt.outcome;
    state.activeEventModal = null;
    if (state.city.trust <= 0) state.endgameModal = "riot";

    saveState();
    renderAll();
    updateDeckLayers();
    showToast(opt.outcome);
  };

  // Демо-показ в 1 клик (заполняет 58 месяцев в зеленой зоне и открывает отчет До/После)
  window.activatePresentationDemo = function () {
    state.showStartScreen = false;
    state.activeEventModal = null;
    state.endgameModal = null;
    state.camerasUnlocked = true;
    state.xp = 940;
    state.currentMonth = 58;
    state.freeBudget = 24.8;
    state.spentCapex = 54.0;
    state.reservedOpex = 21.2;
    state.activeProjects = [];

    state.completedProjects = {
      prj_cameras: { completedAtMonth: 3, totalWithOpex: 5.5, title: "Камеры «Сергек» и датчики потока" },
      prj_schedules: { completedAtMonth: 5, totalWithOpex: 1.9, title: "Раздельный график работы (08:00 / 09:00 / 10:00)" },
      prj_right_turn: { completedAtMonth: 8, totalWithOpex: 6.1, title: "Адаптивная светофорная координация ИТС («Зеленая волна»)" },
      prj_bus_brt: { completedAtMonth: 10, totalWithOpex: 21.0, title: "Непрерывный коридор Bus Lane + Экспресс-автобусы" },
      prj_lrt_launch: { completedAtMonth: 15, totalWithOpex: 26.8, title: "Запуск эстакадной линии Astana LRT (18 станций)" },
      prj_reversible: { completedAtMonth: 16, totalWithOpex: 10.8, title: "Полосы по потоку (Реверсивное движение)" },
      prj_heating_ring: { completedAtMonth: 24, totalWithOpex: 21.7, title: "Кольцевание тепломагистралей ТЭЦ-2 / ТЭЦ-3 (-36°C)" },
      prj_appk_shield: { completedAtMonth: 28, totalWithOpex: 3.9, title: "Стандарт заслушивания ст. 73 АППК + Защита ПДП" }
    };

    state.finalWindowRecords = { 55: 27, 56: 26, 57: 25, 58: 24 };
    state.monthlyHistory = [78, 75, 70, 64, 58, 52, 46, 41, 36, 32, 29, 27, 26, 25, 24];

    state.city = {
      congestion: 24,
      trust: 92,
      wear: 32,
      legal: 97
    };

    DATA.districts.forEach((d) => {
      d.congestion = Math.min(41, Math.max(22, d.congestion - 44));
      d.wear = Math.max(22, d.wear - 18);
      d.trust = Math.min(95, d.trust + 22);
      d.camerasInstalled = true;
    });

    state.scores.pre = {
      appk: 42,
      budget_gz: 46,
      urban_traffic: 40,
      infra_crisis: 48,
      ethics_anticor: 52,
      diplomacy_waragent: 44
    };
    state.scores.simBonus = {
      appk: 30,
      budget_gz: 28,
      urban_traffic: 32,
      infra_crisis: 30,
      ethics_anticor: 28,
      diplomacy_waragent: 30
    };
    state.scores.post = {
      appk: 96,
      budget_gz: 94,
      urban_traffic: 95,
      infra_crisis: 96,
      ethics_anticor: 96,
      diplomacy_waragent: 95
    };

    state.completedMissions = {};
    DATA.missions.forEach((m) => {
      const best = m.choices[0];
      state.completedMissions[m.id] = {
        choiceId: best.id,
        missionTitle: m.title,
        choiceTitle: best.title,
        legalVerdict: best.legalVerdict,
        longTermEffect: best.longTermEffect,
        cost: best.cost,
        isOptimal: true
      };
    });

    state.warAgentMoves = {
      wa_water_energy: "wa1_m1",
      wa_astana_invest: "wa2_m1"
    };

    state.latestNews = "Шесть решающих месяцев в зеленой зоне (24% ≤ 30%). Жители успевают домой, автобусы стали привычкой!";
    state.activeModal = "report";

    buildHexPointsData();
    saveState();
    renderAll();
    updateDeckLayers();
    showToast("Демо-показ активирован: город в зеленой зоне (24%), открыт итоговый отчет «До / После»!");
  };

  window.resetSimulationAll = function () {
    localStorage.removeItem("QAZGOV_ASTANA_NATIVE_V5");
    window.location.reload();
  };

  // ============================================================================
  // СИМУЛЯТОР ДОРОЖНОГО ДВИЖЕНИЯ, РЕАЛЬНЫХ СВЕТОФОРОВ ИТС И ЛИНИИ ASTANA LRT
  // ============================================================================
  let simClockSec = 0;
  let greenWaveManual = false;
  const manualTrafficLightOverrides = {}; // tlId -> { forcedPhase: 'GREEN'|'RED', expiresAtSec }
  let lrtPillarsCache = [];
  let roadVehiclesFleet = [];
  let lrtTrainsFleet = [];

  function isGreenWaveEnabled() {
    return greenWaveManual || !!state.completedProjects.prj_right_turn;
  }

  window.toggleGreenWaveMode = function () {
    greenWaveManual = !greenWaveManual;
    const btn = document.getElementById("btn-green-wave");
    if (btn) {
      btn.classList.toggle("active", isGreenWaveEnabled());
    }
    updateDeckLayers();
    showToast(
      isGreenWaveEnabled()
        ? "🚦 ЦОУ ДП ИТС: Включена адаптивная «Зеленая волна» на 14 главных перекрестках Астаны!"
        : "🚦 Светофоры переведены в стандартный пофазный режим регулирования."
    );
  };

  // Интерполяция точки и угла курса вдоль ломаной линии маршрута (t в диапазоне 0..1)
  function samplePointAlongPolyline(path, tNorm, laneOffsetDeg = 0) {
    if (!path || path.length === 0) return { position: [71.4305, 51.1283], angleDeg: 0 };
    if (path.length === 1) return { position: path[0], angleDeg: 0 };

    const t = Math.max(0, Math.min(0.99999, tNorm));
    let totalLen = 0;
    const segLens = [];
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i + 1][0] - path[i][0];
      const dy = path[i + 1][1] - path[i][1];
      const l = Math.hypot(dx, dy);
      segLens.push(l);
      totalLen += l;
    }
    if (totalLen <= 1e-9) return { position: path[0], angleDeg: 0 };

    let targetDist = t * totalLen;
    for (let i = 0; i < segLens.length; i++) {
      const segL = segLens[i];
      if (targetDist <= segL || i === segLens.length - 1) {
        const localT = segL > 1e-9 ? targetDist / segL : 0;
        const p0 = path[i];
        const p1 = path[i + 1];
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const len = Math.hypot(dx, dy) || 1;
        // Перпендикулярный сдвиг полосы движения
        const nx = (-dy / len) * laneOffsetDeg;
        const ny = (dx / len) * laneOffsetDeg;
        const lng = p0[0] + dx * localT + nx;
        const lat = p0[1] + dy * localT + ny;
        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        return { position: [lng, lat], angleDeg };
      }
      targetDist -= segL;
    }
    return { position: path[path.length - 1], angleDeg: 0 };
  }

  // Генерация 3D-опор эстакады Astana LRT, парка из 95 автомобилей/автобусов CTS и 3-вагонных составов ЛРТ
  function initTrafficAndLrtFleet() {
    // 1. 3D-опоры эстакады ЛРТ (76 железобетонных колонн вдоль 22.4 км линии)
    lrtPillarsCache = [];
    if (DATA.lrtLine && DATA.lrtLine.path) {
      const count = 76;
      for (let i = 0; i <= count; i++) {
        const sample = samplePointAlongPolyline(DATA.lrtLine.path, i / count, 0);
        lrtPillarsCache.push({
          id: `pillar_${i}`,
          position: sample.position,
          height: 22
        });
      }
    }

    // 2. Парк дорожных машин (car) и экспресс-автобусов CTS (bus) по всем коридорам города
    roadVehiclesFleet = [];
    const roadRoutes = (DATA.tripsRoutes || []).filter((r) => r.type !== "lrt");
    roadRoutes.forEach((route, rIdx) => {
      const isBusRoute = route.type === "bus" || route.vehicleClass === "bus";
      const countOnRoute = isBusRoute ? 8 : 12;
      for (let k = 0; k < countOnRoute; k++) {
        const isBus = isBusRoute ? k % 2 === 0 : k % 5 === 0;
        const laneSign = k % 2 === 0 ? 1 : -1;
        const laneOffset = laneSign * (isBus ? 0.00018 : 0.00009);
        const initT = (k / countOnRoute + rIdx * 0.07) % 1;
        const pt = samplePointAlongPolyline(route.path, initT, laneOffset);
        roadVehiclesFleet.push({
          id: `veh_${route.id}_${k}`,
          routeId: route.id,
          path: route.path,
          vehicleType: isBus ? "bus" : "car",
          t: initT,
          direction: isBusRoute ? 1 : laneSign,
          laneOffset,
          baseSpeed: isBus ? 0.036 : 0.044 + (k % 3) * 0.006,
          position: pt.position,
          isStoppedAtRed: false,
          label: isBus ? `CTS Bus #${10 + (rIdx * 7 + k) % 60}` : ""
        });
      }
    });

    // 3. Составы легкорельсового транспорта Astana LRT (по 3 сочлененных вагона в каждом составе)
    lrtTrainsFleet = [];
    if (DATA.lrtLine && DATA.lrtLine.path) {
      const trainConfigs = [
        { id: "LRT-01", name: "LRT-01 • Экспресс Аэропорт", t: 0.14, dir: 1, speed: 0.042 },
        { id: "LRT-02", name: "LRT-02 • Нурлы Жол", t: 0.42, dir: -1, speed: 0.041 },
        { id: "LRT-03", name: "LRT-03 • Дом Министерств", t: 0.64, dir: 1, speed: 0.043 },
        { id: "LRT-04", name: "LRT-04 • ЭКСПО / Сыганак", t: 0.82, dir: -1, speed: 0.040 },
        { id: "LRT-05", name: "LRT-05 • Абу-Даби Плаза", t: 0.29, dir: 1, speed: 0.044 },
        { id: "LRT-06", name: "LRT-06 • Ботанический сад", t: 0.53, dir: -1, speed: 0.042 }
      ];
      trainConfigs.forEach((cfg) => {
        const pt = samplePointAlongPolyline(DATA.lrtLine.path, cfg.t, cfg.dir * 0.00011);
        lrtTrainsFleet.push({
          ...cfg,
          position: pt.position,
          carriages: [pt.position, pt.position, pt.position],
          dwellingSec: 0,
          speedKmh: 72
        });
      });
    }
  }

  // Расчет текущих фаз реальных светофоров Астаны (КРАСНЫЙ / ЖЕЛТЫЙ / ЗЕЛЕНЫЙ + обратный отсчет в секундах)
  function computeTrafficLightsLiveState() {
    const list = DATA.trafficLights || [];
    const gw = isGreenWaveEnabled();
    return list.map((tl) => {
      const ov = manualTrafficLightOverrides[tl.id];
      if (ov && ov.expiresAtSec > simClockSec) {
        const rem = Math.max(1, Math.ceil(ov.expiresAtSec - simClockSec));
        const isG = ov.forcedPhase === "GREEN";
        return {
          ...tl,
          phase: ov.forcedPhase,
          remainingSec: rem,
          colorRgb: isG ? [46, 213, 115] : [255, 59, 71],
          haloRgb: isG ? [46, 213, 115, 95] : [255, 59, 71, 95],
          statusText: `${isG ? "🟢 ЗЕЛЕНЫЙ" : "🔴 КРАСНЫЙ"} ${rem}с (РУЧН.)`
        };
      }

      const cycle = tl.cycleSec || 28;
      const greenDur = gw ? Math.round(cycle * 0.74) : tl.greenSec || 14;
      const yellowDur = 3;
      const localT = (simClockSec + (tl.offsetSec || 0)) % cycle;

      let phase = "RED";
      let remainingSec = 1;
      let colorRgb = [255, 59, 71];
      let haloRgb = [255, 59, 71, 90];

      if (localT < greenDur) {
        phase = "GREEN";
        remainingSec = Math.max(1, Math.ceil(greenDur - localT));
        colorRgb = [46, 213, 115];
        haloRgb = [46, 213, 115, 95];
      } else if (localT < greenDur + yellowDur) {
        phase = "YELLOW";
        remainingSec = Math.max(1, Math.ceil(greenDur + yellowDur - localT));
        colorRgb = [255, 193, 7];
        haloRgb = [255, 193, 7, 95];
      } else {
        phase = "RED";
        remainingSec = Math.max(1, Math.ceil(cycle - localT));
        colorRgb = [255, 59, 71];
        haloRgb = [255, 59, 71, 95];
      }

      const phaseBadge =
        phase === "GREEN"
          ? gw
            ? `🟢 ВОЛНА ${remainingSec}с`
            : `🟢 ${remainingSec}с`
          : phase === "YELLOW"
          ? `🟡 ${remainingSec}с`
          : `🔴 СТОП ${remainingSec}с`;

      return {
        ...tl,
        phase,
        remainingSec,
        colorRgb,
        haloRgb,
        statusText: `${phaseBadge} • ${tl.name.split(" (")[0]}`
      };
    });
  }

  // Шаг физической симуляции машин, автобусов CTS (с остановкой на красный сигнал светофора) и поездов Astana LRT
  function stepTrafficAndLrtSimulation(dtSec, liveTrafficLights) {
    if (!roadVehiclesFleet.length) initTrafficAndLrtFleet();

    const effCong = getEffectiveCongestion();
    const congestionSlowdown = effCong <= 35 ? 1.35 : effCong <= 55 ? 1.0 : 0.65;
    const hasBrtPriority = !!state.completedProjects.prj_bus_brt;
    const hasLrtProject = !!state.completedProjects.prj_lrt_launch;

    // 1. Обновление позиций автомобилей и экспресс-автобусов CTS с реакцией на светофоры
    roadVehiclesFleet.forEach((v) => {
      let mustStopForRed = false;
      if (state.layersVisible.trafficLights && liveTrafficLights && liveTrafficLights.length) {
        for (let i = 0; i < liveTrafficLights.length; i++) {
          const tl = liveTrafficLights[i];
          if (tl.phase === "RED" || tl.phase === "YELLOW") {
            const dx = v.position[0] - tl.position[0];
            const dy = v.position[1] - tl.position[1];
            const dist = Math.hypot(dx, dy);
            // Если машина подъехала к перекрестку ближе чем на ~190 метров, она тормозит перед стоп-линией
            if (dist < 0.0021 && !(v.vehicleType === "bus" && hasBrtPriority)) {
              mustStopForRed = true;
              break;
            }
          }
        }
      }

      v.isStoppedAtRed = mustStopForRed;
      if (!mustStopForRed) {
        const mult = v.vehicleType === "bus" && hasBrtPriority ? 1.45 : congestionSlowdown;
        const deltaT = v.baseSpeed * mult * dtSec * (v.direction >= 0 ? 1 : -1);
        v.t = (v.t + deltaT + 1) % 1;
        const sample = samplePointAlongPolyline(v.path, v.t, v.laneOffset);
        v.position = sample.position;
      }
    });

    // 2. Обновление 3-вагонных экспресс-поездов Astana LRT на эстакаде
    if (DATA.lrtLine && DATA.lrtLine.path) {
      const lrtSpeedBoost = hasLrtProject ? 1.45 : 1.0;
      lrtTrainsFleet.forEach((tr) => {
        if (tr.dwellingSec > 0) {
          tr.dwellingSec = Math.max(0, tr.dwellingSec - dtSec);
          tr.speedKmh = 0;
        } else {
          tr.t += tr.dir * tr.speed * lrtSpeedBoost * dtSec;
          if (tr.t >= 0.98) {
            tr.t = 0.98;
            tr.dir = -1;
            tr.dwellingSec = 1.2;
          } else if (tr.t <= 0.02) {
            tr.t = 0.02;
            tr.dir = 1;
            tr.dwellingSec = 1.2;
          }
          tr.speedKmh = hasLrtProject ? 80 : 68;
        }

        const latOff = tr.dir * 0.00012;
        const headPt = samplePointAlongPolyline(DATA.lrtLine.path, tr.t, latOff).position;
        const midPt = samplePointAlongPolyline(
          DATA.lrtLine.path,
          Math.max(0, Math.min(1, tr.t - tr.dir * 0.0085)),
          latOff
        ).position;
        const tailPt = samplePointAlongPolyline(
          DATA.lrtLine.path,
          Math.max(0, Math.min(1, tr.t - tr.dir * 0.017)),
          latOff
        ).position;

        tr.position = headPt;
        tr.carriages = [headPt, midPt, tailPt];

        // Проверка кратковременной остановки на станциях ЛРТ
        if (tr.dwellingSec <= 0 && DATA.lrtLine.stations) {
          for (let s = 0; s < DATA.lrtLine.stations.length; s++) {
            const st = DATA.lrtLine.stations[s].position;
            if (Math.hypot(headPt[0] - st[0], headPt[1] - st[1]) < 0.00075 && Math.random() < 0.08) {
              tr.dwellingSec = 1.1;
              tr.speedKmh = 0;
              break;
            }
          }
        }
      });
    }
  }

  // Проверка попадания точки [lng, lat] в полигон района Астаны (для нативного клика по карте без перехвата dragPan)
  function isPointInPolygon(point, vs) {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Инициализация 3D-карты Астаны с объемными зданиями в фирменной морской гамме игры (#152d43 / #ffbd69 / #8edcbe)
  function initAstana3DMap() {
    const container = document.getElementById("kepler-map-container");
    if (!container || typeof maplibregl === "undefined") return;
    if (mapInstance) return;

    buildHexPointsData();
    initTrafficAndLrtFleet();

    mapInstance = new maplibregl.Map({
      container: "kepler-map-container",
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: DATA.cityMeta.centerLngLat,
      zoom: DATA.cityMeta.zoom,
      pitch: DATA.cityMeta.pitch,
      bearing: DATA.cityMeta.bearing,
      antialias: true,
      dragPan: true,
      scrollZoom: true,
      boxZoom: true,
      dragRotate: true,
      keyboard: true,
      doubleClickZoom: true,
      touchZoomRotate: true
    });

    // Гарантируем, что все обработчики перемещения/зума/вращения MapLibre явно включены
    mapInstance.dragPan.enable();
    mapInstance.scrollZoom.enable();
    mapInstance.dragRotate.enable();
    mapInstance.touchZoomRotate.enable();
    mapInstance.doubleClickZoom.enable();
    mapInstance.keyboard.enable();

    // При любом касании или перетаскивании карты мгновенно отключаем авто-орбиту, чтобы не мешать движению
    const stopOrbitOnUserAction = () => {
      isUserInteractingWithMap = true;
      if (autoOrbitActive) {
        autoOrbitActive = false;
        syncOrbitButtonsUI();
      }
    };
    const resumeAfterUserAction = () => {
      isUserInteractingWithMap = false;
    };

    container.addEventListener("mousedown", stopOrbitOnUserAction, { passive: true });
    container.addEventListener("touchstart", stopOrbitOnUserAction, { passive: true });
    container.addEventListener("wheel", stopOrbitOnUserAction, { passive: true });
    window.addEventListener("mouseup", resumeAfterUserAction, { passive: true });
    window.addEventListener("touchend", resumeAfterUserAction, { passive: true });

    mapInstance.on("dragstart", stopOrbitOnUserAction);
    mapInstance.on("dragend", resumeAfterUserAction);
    mapInstance.on("rotatestart", stopOrbitOnUserAction);
    mapInstance.on("rotateend", resumeAfterUserAction);
    mapInstance.on("zoomstart", stopOrbitOnUserAction);
    mapInstance.on("zoomend", resumeAfterUserAction);

    // Нативный клик по светофору ИТС (ручное переключение фазы) или по району Астаны
    mapInstance.on("click", (e) => {
      if (!e || !e.lngLat) return;
      const pt = [e.lngLat.lng, e.lngLat.lat];

      // 1. Проверяем клик по любому из 14 реальных светофоров Астаны
      if (state.layersVisible.trafficLights && DATA.trafficLights) {
        const liveTls = computeTrafficLightsLiveState();
        const hitTl = liveTls.find(
          (tl) => Math.hypot(pt[0] - tl.position[0], pt[1] - tl.position[1]) < 0.0028
        );
        if (hitTl) {
          const nextPhase = hitTl.phase === "GREEN" ? "RED" : "GREEN";
          manualTrafficLightOverrides[hitTl.id] = {
            forcedPhase: nextPhase,
            expiresAtSec: simClockSec + 20
          };
          updateDeckLayers();
          showToast(
            `🚦 ЦОУ ДП ИТС: Перекресток «${hitTl.name}» вручную переключен на ${
              nextPhase === "GREEN" ? "🟢 ЗЕЛЕНЫЙ (пропуск потока)" : "🔴 КРАСНЫЙ (стоп-линия)"
            } на 20 сек!`
          );
          return;
        }
      }

      // 2. Проверяем клик по району Астаны
      const hitDistrict = DATA.districts.find((d) => d.polygon && isPointInPolygon(pt, d.polygon));
      if (hitDistrict && hitDistrict.id !== state.selectedDistrictId) {
        selectDistrict(hitDistrict.id, false);
      }
    });

    mapInstance.on("load", () => {
      addCustom3DBuildingsLayer();
      if (typeof deck !== "undefined") {
        deckOverlay = new deck.MapboxOverlay({
          interleaved: false,
          layers: createDeckLayersList()
        });
        mapInstance.addControl(deckOverlay);
        // Делаем холст deck.gl прозрачным для событий мыши, чтобы MapLibre получал 100% dragPan и scrollZoom
        if (deckOverlay._canvas) {
          deckOverlay._canvas.style.pointerEvents = "none";
        }
        container.querySelectorAll("canvas:not(.maplibregl-canvas)").forEach((c) => {
          c.style.pointerEvents = "none";
        });
        startTripsAnimationLoop();
      }
    });

    // Клавиатурная навигация по 3D-карте (WASD / Стрелки / Q-E / H)
    window.addEventListener("keydown", (ev) => {
      if (state.activeModal || state.showStartScreen || state.activeEventModal) return;
      const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const key = ev.key.toLowerCase();
      if (key === "w" || ev.key === "ArrowUp") {
        window.panMapBy(0, -140);
      } else if (key === "s" || ev.key === "ArrowDown") {
        window.panMapBy(0, 140);
      } else if (key === "a" || ev.key === "ArrowLeft") {
        window.panMapBy(-140, 0);
      } else if (key === "d" || ev.key === "ArrowRight") {
        window.panMapBy(140, 0);
      } else if (key === "q") {
        window.rotateMapBy(-20);
      } else if (key === "e") {
        window.rotateMapBy(20);
      } else if (ev.key === "+" || ev.key === "=") {
        window.zoomMapBy(0.6);
      } else if (ev.key === "-" || ev.key === "_") {
        window.zoomMapBy(-0.6);
      } else if (key === "h") {
        window.toggleFreeMapMode();
      }
    });
  }

  function addCustom3DBuildingsLayer() {
    if (!mapInstance) return;
    try {
      const style = mapInstance.getStyle();
      if (!style || !style.layers) return;
      let labelLayerId;
      for (let i = 0; i < style.layers.length; i++) {
        if (style.layers[i].type === "symbol" && style.layers[i].layout && style.layers[i].layout["text-field"]) {
          labelLayerId = style.layers[i].id;
          break;
        }
      }
      if (!mapInstance.getLayer("astana-3d-buildings-custom")) {
        mapInstance.addLayer(
          {
            id: "astana-3d-buildings-custom",
            source: "openmaptiles",
            "source-layer": "building",
            type: "fill-extrusion",
            minzoom: 12.5,
            paint: {
              "fill-extrusion-color": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "render_height"], 16],
                0, "#243b4f",
                25, "#32526d",
                65, "#4c7a9c",
                110, "#ffbd69"
              ],
              "fill-extrusion-height": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12.5, 0,
                13.2, ["coalesce", ["get", "render_height"], 18]
              ],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.9
            }
          },
          labelLayerId
        );
      }
    } catch (e) {}
  }

  function createDeckLayersList() {
    if (typeof deck === "undefined") return [];
    const layers = [];
    const isGreen = getEffectiveCongestion() <= 45;
    const lrtUpgraded = !!state.completedProjects.prj_lrt_launch;
    const liveTrafficLights = computeTrafficLightsLiveState();

    // 1. Границы 6 районов Астаны
    if (state.layersVisible.polygons) {
      layers.push(
        new deck.PolygonLayer({
          id: "astana-districts-poly",
          data: DATA.districts,
          pickable: false,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 2,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) =>
            d.id === state.selectedDistrictId ? [255, 189, 105, 45] : [20, 35, 48, 25],
          getLineColor: (d) =>
            d.id === state.selectedDistrictId ? [255, 189, 105, 230] : [174, 192, 207, 130],
          updateTriggers: {
            getFillColor: [state.selectedDistrictId],
            getLineColor: [state.selectedDistrictId]
          }
        })
      );
    }

    // 2. 3D Hexbin плотность заторов
    if (state.layersVisible.hexagons) {
      layers.push(
        new deck.HexagonLayer({
          id: "astana-kepler-hexagons",
          data: hexPointsCache,
          pickable: false,
          extruded: true,
          radius: 220,
          coverage: 0.85,
          elevationScale: isGreen ? 6 : 14,
          getPosition: (d) => d.position,
          getElevationWeight: (d) => d.weight,
          getColorWeight: (d) => d.weight,
          colorRange: [
            [1, 152, 189],
            [73, 227, 206],
            [142, 220, 190],
            [254, 237, 177],
            [255, 189, 105],
            [255, 159, 139]
          ]
        })
      );
    }

    // 3. 3D Дуги маятниковой миграции (Kepler ArcLayer)
    if (state.layersVisible.arcs) {
      layers.push(
        new deck.ArcLayer({
          id: "astana-kepler-arcs",
          data: DATA.odArcs,
          pickable: false,
          getWidth: 3.5,
          getSourcePosition: (d) => d.source,
          getTargetPosition: (d) => d.target,
          getSourceColor: [255, 189, 105, 220],
          getTargetColor: isGreen ? [142, 220, 190, 230] : [255, 159, 139, 230]
        })
      );
    }

    // 4. Эстакада, 3D-опоры, 12 станций и скоростные 3-вагонные поезда Astana LRT
    if (state.layersVisible.lrt && DATA.lrtLine) {
      // 4A. 3D-колонны (опоры) эстакады ЛРТ
      if (deck.ColumnLayer && lrtPillarsCache.length) {
        layers.push(
          new deck.ColumnLayer({
            id: "astana-lrt-pillars",
            data: lrtPillarsCache,
            pickable: false,
            diskResolution: 8,
            radius: 11,
            extruded: true,
            getPosition: (d) => d.position,
            getElevation: (d) => d.height,
            getFillColor: lrtUpgraded ? [56, 189, 248, 210] : [130, 165, 190, 180]
          })
        );
      }

      // 4B. Эстакадное полотно Astana LRT (внешний контур и контактный рельс)
      layers.push(
        new deck.PathLayer({
          id: "astana-lrt-viaduct-base",
          data: [DATA.lrtLine],
          pickable: false,
          getPath: (d) => d.path,
          getColor: lrtUpgraded ? [14, 165, 233, 235] : [56, 189, 248, 195],
          widthMinPixels: 9,
          rounded: true
        }),
        new deck.PathLayer({
          id: "astana-lrt-viaduct-rail",
          data: [DATA.lrtLine],
          pickable: false,
          getPath: (d) => d.path,
          getColor: [255, 230, 150, 240],
          widthMinPixels: 2.5,
          rounded: true
        })
      );

      // 4C. 12 капсульных 3D-станций Astana LRT
      if (deck.ColumnLayer && DATA.lrtLine.stations) {
        layers.push(
          new deck.ColumnLayer({
            id: "astana-lrt-stations-3d",
            data: DATA.lrtLine.stations,
            pickable: false,
            diskResolution: 16,
            radius: 38,
            extruded: true,
            getPosition: (d) => d.position,
            getElevation: 34,
            getFillColor: lrtUpgraded ? [142, 220, 190, 235] : [56, 189, 248, 220],
            getLineColor: [255, 189, 105, 255]
          })
        );
      }

      if (deck.TextLayer && DATA.lrtLine.stations) {
        layers.push(
          new deck.TextLayer({
            id: "astana-lrt-station-labels",
            data: DATA.lrtLine.stations,
            pickable: false,
            getPosition: (d) => [d.position[0], d.position[1], 48],
            getText: (d) => `🚄 ${d.code}: ${d.name}`,
            getSize: 11,
            getColor: [230, 248, 255, 245],
            background: true,
            getBackgroundColor: [9, 24, 38, 215],
            backgroundPadding: [5, 3],
            fontFamily: "Manrope, sans-serif",
            fontWeight: 800,
            characterSet: "auto",
            getTextAnchor: "middle",
            getAlignmentBaseline: "bottom"
          })
        );
      }

      // 4D. Движущиеся 3-вагонные составы Astana LRT (3D вагоны + световой ореол + телеметрия скорости)
      const allCarriages = [];
      lrtTrainsFleet.forEach((tr) => {
        (tr.carriages || [tr.position]).forEach((pos, idx) => {
          allCarriages.push({
            id: `${tr.id}_car_${idx}`,
            position: pos,
            isHead: idx === 0,
            trainName: tr.name,
            speedKmh: tr.speedKmh
          });
        });
      });

      if (deck.ScatterplotLayer && allCarriages.length) {
        layers.push(
          new deck.ScatterplotLayer({
            id: "astana-lrt-headlight-glow",
            data: lrtTrainsFleet.map((t) => ({ position: t.position })),
            pickable: false,
            getPosition: (d) => [...d.position, 26],
            getRadius: 58,
            radiusMinPixels: 9,
            getFillColor: [56, 189, 248, 95]
          })
        );
      }

      if (deck.ColumnLayer && allCarriages.length) {
        layers.push(
          new deck.ColumnLayer({
            id: "astana-lrt-train-cars-3d",
            data: allCarriages,
            pickable: false,
            diskResolution: 12,
            radius: 21,
            extruded: true,
            getPosition: (d) => d.position,
            getElevation: (d) => (d.isHead ? 38 : 34),
            getFillColor: (d) => (d.isHead ? [255, 189, 105, 255] : [56, 189, 248, 250])
          })
        );
      }

      if (deck.TextLayer && lrtTrainsFleet.length) {
        layers.push(
          new deck.TextLayer({
            id: "astana-lrt-train-badges",
            data: lrtTrainsFleet.map((t) => ({
              position: t.position,
              label: `${t.id} (${t.speedKmh > 0 ? t.speedKmh + " км/ч" : "ПОСАДКА"})`
            })),
            pickable: false,
            getPosition: (d) => [d.position[0], d.position[1], 56],
            getText: (d) => d.label,
            getSize: 11,
            getColor: [12, 23, 35, 255],
            background: true,
            getBackgroundColor: [255, 189, 105, 245],
            backgroundPadding: [6, 3],
            fontFamily: "Manrope, sans-serif",
            fontWeight: 800,
            characterSet: "auto"
          })
        );
      }
    }

    // 5. Многополосный дорожный трафик: магистрали, реактивные автомобили и автобусы Bus Lane (BRT)
    if (state.layersVisible.trips) {
      const roadRoutesOnly = (DATA.tripsRoutes || []).filter((r) => r.type !== "lrt");
      layers.push(
        new deck.PathLayer({
          id: "astana-corridors-base",
          data: roadRoutesOnly,
          pickable: false,
          getPath: (d) => d.path,
          getColor: (d) =>
            d.type === "bus"
              ? [142, 220, 190, 195]
              : isGreen
              ? [142, 220, 190, 165]
              : [255, 159, 139, 175],
          widthMinPixels: 5,
          rounded: true
        })
      );

      if (deck.TripsLayer) {
        layers.push(
          new deck.TripsLayer({
            id: "astana-kepler-trips",
            data: DATA.tripsRoutes,
            pickable: false,
            getPath: (d) => d.path,
            getTimestamps: (d) => d.timestamps,
            getColor: (d) =>
              d.type === "lrt"
                ? [56, 189, 248]
                : d.type === "bus"
                ? [142, 220, 190]
                : [255, 189, 105],
            opacity: 0.96,
            widthMinPixels: 4.5,
            rounded: true,
            trailLength: 18,
            currentTime: tripsTime
          })
        );
      }

      // 5B. Живой поток из 95 автомобилей и экспресс-автобусов CTS (тормозящих перед красным сигналом светофоров!)
      if (deck.ScatterplotLayer && roadVehiclesFleet.length) {
        layers.push(
          new deck.ScatterplotLayer({
            id: "astana-live-vehicles-dots",
            data: roadVehiclesFleet.map((v) => ({
              position: v.position,
              vehicleType: v.vehicleType,
              isStoppedAtRed: v.isStoppedAtRed
            })),
            pickable: false,
            getPosition: (d) => [...d.position, 6],
            getRadius: (d) => (d.vehicleType === "bus" ? 26 : 16),
            radiusMinPixels: 4,
            radiusMaxPixels: 11,
            stroked: true,
            lineWidthMinPixels: 1.5,
            getLineColor: [12, 23, 35, 230],
            getFillColor: (d) => {
              if (d.isStoppedAtRed) return [255, 71, 87, 255]; // Стоп-сигналы при остановке на красный светофор
              if (d.vehicleType === "bus") return [142, 220, 190, 255]; // Автобусы CTS (Bus Lane)
              return [255, 214, 130, 245]; // Поток автомобилей
            }
          })
        );
      }
    }

    // 6. Реальные светофоры ИТС Астаны на 14 ключевых перекрестках (3D-мачты + световые сигналы + таймер фазы)
    if (state.layersVisible.trafficLights && liveTrafficLights.length) {
      if (deck.ScatterplotLayer) {
        layers.push(
          new deck.ScatterplotLayer({
            id: "astana-traffic-lights-halo",
            data: liveTrafficLights,
            pickable: false,
            getPosition: (d) => [...d.position, 14],
            getRadius: (d) => (d.phase === "RED" ? 72 : 62),
            radiusMinPixels: 10,
            radiusMaxPixels: 24,
            getFillColor: (d) => d.haloRgb
          }),
          new deck.ScatterplotLayer({
            id: "astana-traffic-lights-core",
            data: liveTrafficLights,
            pickable: false,
            getPosition: (d) => [...d.position, 18],
            getRadius: 24,
            radiusMinPixels: 5,
            radiusMaxPixels: 11,
            stroked: true,
            lineWidthMinPixels: 2,
            getLineColor: [255, 255, 255, 240],
            getFillColor: (d) => [...d.colorRgb, 255]
          })
        );
      }

      if (deck.ColumnLayer) {
        layers.push(
          new deck.ColumnLayer({
            id: "astana-traffic-lights-poles",
            data: liveTrafficLights,
            pickable: false,
            diskResolution: 10,
            radius: 10,
            extruded: true,
            getPosition: (d) => d.position,
            getElevation: 26,
            getFillColor: (d) => [...d.colorRgb, 245]
          })
        );
      }

      if (deck.TextLayer) {
        layers.push(
          new deck.TextLayer({
            id: "astana-traffic-lights-timers",
            data: liveTrafficLights,
            pickable: false,
            getPosition: (d) => [d.position[0], d.position[1], 36],
            getText: (d) => d.statusText,
            getSize: 10.5,
            getColor: (d) => [...d.colorRgb, 255],
            background: true,
            getBackgroundColor: [10, 20, 31, 230],
            backgroundPadding: [5, 2],
            fontFamily: "Manrope, sans-serif",
            fontWeight: 800,
            characterSet: "auto",
            getTextAnchor: "middle",
            getAlignmentBaseline: "bottom"
          })
        );
      }
    }

    return layers;
  }

  function updateDeckLayers() {
    if (!deckOverlay) return;
    deckOverlay.setProps({ layers: createDeckLayersList() });
  }

  function startTripsAnimationLoop() {
    const speedFactor = () => (getEffectiveCongestion() <= 45 ? 1.15 : 0.55);
    let lastDeckUpdate = 0;

    function frame(now) {
      if (
        deckOverlay &&
        (state.layersVisible.trips || state.layersVisible.lrt || state.layersVisible.trafficLights) &&
        !state.activeModal &&
        !state.showStartScreen &&
        !isUserInteractingWithMap &&
        now - lastDeckUpdate > 55
      ) {
        const dtSec = Math.min(0.15, (now - (lastDeckUpdate || now - 55)) / 1000);
        lastDeckUpdate = now;
        simClockSec += dtSec * 2.2;
        tripsTime = (tripsTime + speedFactor()) % 60;
        const liveTls = computeTrafficLightsLiveState();
        stepTrafficAndLrtSimulation(dtSec, liveTls);
        updateDeckLayers();
      }
      // Плавная кинематографичная 3D-орбита работает ТОЛЬКО если пользователь сам её включил и не двигает карту мышью
      if (
        mapInstance &&
        autoOrbitActive &&
        !isUserInteractingWithMap &&
        !state.activeModal &&
        !state.showStartScreen
      ) {
        const curBearing = mapInstance.getBearing();
        mapInstance.rotateTo((curBearing + 0.04) % 360, { duration: 0, animate: false });
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // Рендер верхней полосы ресурсов (.topbar) с плавной GSAP-интерполяцией чисел
  function renderTopBar() {
    const effCong = getEffectiveCongestion();
    const penalty = getCurrentConstructionPenalty();
    const rankObj = getCurrentRank();

    const setEl = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    if (typeof gsap !== "undefined") {
      gsap.to(kpiAnimatedValues, {
        budget: state.freeBudget,
        congestion: effCong,
        trust: state.city.trust,
        month: state.currentMonth,
        xp: state.xp,
        duration: 0.65,
        ease: "power3.out",
        onUpdate: () => {
          setEl("rank-label", `${rankObj.current.badge} • ${Math.round(kpiAnimatedValues.xp)} XP`);
          setEl("kpi-budget", `${kpiAnimatedValues.budget.toFixed(1)} <small>млрд ₸</small>`);
          setEl("kpi-congestion", `${Math.round(kpiAnimatedValues.congestion)}% <small>цель ≤30%</small>`);
          setEl("kpi-trust", `${Math.round(kpiAnimatedValues.trust)}% <small id="kpi-legal">НПА: ${state.city.legal}%</small>`);
          setEl("kpi-month", `${Math.round(kpiAnimatedValues.month)} <small>из 60 мес.</small>`);
        }
      });
    } else {
      setEl("rank-label", `${rankObj.current.badge} • ${state.xp} XP`);
      setEl("kpi-budget", `${state.freeBudget.toFixed(1)} <small>млрд ₸</small>`);
      setEl("kpi-congestion", `${effCong}% <small>цель ≤30%</small>`);
      setEl("kpi-trust", `${state.city.trust}% <small id="kpi-legal">НПА: ${state.city.legal}%</small>`);
      setEl("kpi-month", `${state.currentMonth} <small>из 60 мес.</small>`);
    }

    setEl("kpi-opex", `Резерв содержания: ${state.reservedOpex.toFixed(1)} млрд ₸`);
    setEl(
      "kpi-penalty",
      penalty > 0
        ? `На время строек +${penalty}% к заторам`
        : effCong <= 30
        ? "Город в зеленой зоне ✓"
        : "Считаем людей, а не машинки"
    );

    const congBox = document.getElementById("stat-congestion-box");
    if (congBox) {
      congBox.className = effCong <= 30 ? "stat congestion green" : "stat congestion";
    }

    setEl("kpi-trust", `${state.city.trust}% <small id="kpi-legal">НПА: ${state.city.legal}%</small>`);
    setEl("kpi-month", `${state.currentMonth} <small>из 60 мес.</small>`);

    const meterBar = document.getElementById("trust-meter-bar");
    if (meterBar) {
      meterBar.style.transform = `scaleX(${Math.max(0, Math.min(1, state.city.trust / 100))})`;
    }

    const newsEl = document.getElementById("bottom-news-ticker");
    if (newsEl) newsEl.textContent = state.latestNews;

    // Окно финального контроля 55–60 месяцев
    const finalStrip = document.getElementById("final-months-strip");
    if (finalStrip) {
      finalStrip.innerHTML = [55, 56, 57, 58, 59, 60]
        .map((m) => {
          const rec = state.finalWindowRecords[m];
          let cls = "";
          if (rec !== undefined) {
            cls = rec <= 30 ? "pass" : "fail";
          } else if (m === state.currentMonth) {
            cls = "current";
          }
          return `<i class="${cls}">${m}</i>`;
        })
        .join("");
    }
  }

  // Рендер заголовка района и навигатора 6 районов Астаны слева внизу
  function renderCityHeadingAndDistricts() {
    const selected = DATA.districts.find((d) => d.id === state.selectedDistrictId) || DATA.districts[0];
    const hName = document.getElementById("heading-district-name");
    const hPill = document.getElementById("heading-status-pill");
    const hFocus = document.getElementById("heading-district-focus");
    const navGrid = document.getElementById("district-nav-grid");

    if (hName) hName.textContent = selected.name.toUpperCase();
    if (hPill) {
      hPill.textContent = state.camerasUnlocked
        ? `Точный замер: ${selected.congestion}% опозданий`
        : `Оценка на глаз: ~${selected.congestion}% (нужны камеры)`;
      hPill.className = selected.congestion <= 50 ? "status-pill" : "status-pill paused";
    }
    if (hFocus) hFocus.textContent = selected.focus;

    if (navGrid) {
      navGrid.innerHTML = DATA.districts
        .map((d) => {
          const isAct = d.id === selected.id;
          const isOk = d.congestion <= 50;
          return `
          <button onclick="selectDistrict('${d.id}', true)" class="district-nav-btn ${isAct ? "active" : ""}">
            <span>${d.shortName}</span>
            <small class="${isOk ? "mint" : "coral"}">${state.camerasUnlocked ? "" : "~"}${d.congestion}%</small>
          </button>
        `;
        })
        .join("");
    }
  }

  // Рендер нижней рельсы проектов (.project-rail) и правого инспектора (.inspector)
  function renderProjectRailAndInspector() {
    const groupsEl = document.getElementById("project-groups-tabs");
    const optionsEl = document.getElementById("project-options-strip");
    const inspectorEl = document.getElementById("project-inspector");
    if (!groupsEl || !optionsEl || !inspectorEl) return;

    groupsEl.innerHTML = GROUPS.map((g) => {
      const active = g.id === state.selectedGroupId;
      return `
        <button onclick="selectProjectGroup('${g.id}')" class="${active ? "active" : ""}">
          <span>${g.label}</span>
        </button>
      `;
    }).join("");

    const filteredCards = DATA.projectCards.filter(
      (c) => state.selectedGroupId === "all" || c.category.startsWith(state.selectedGroupId)
    );

    optionsEl.innerHTML = filteredCards
      .map((c) => {
        const isSelected = c.id === state.selectedProjectId;
        const isDone = !!state.completedProjects[c.id];
        const isBuilding = state.activeProjects.some((p) => p.id === c.id);
        const iconSvg = TOOL_ICONS[c.id] || TOOL_ICONS.prj_cameras;

        return `
        <button onclick="selectProjectTool('${c.id}')" class="project-tool ${isSelected ? "active" : ""}">
          ${isDone || isBuilding ? `<i class="tool-dot" style="background:${isDone ? "var(--mint)" : "var(--gold)"}"></i>` : ""}
          ${iconSvg}
          <span class="project-tool-title">${c.title}</span>
          <span class="tool-price">${c.baseCost.toFixed(1)} млрд ₸</span>
        </button>
      `;
      })
      .join("");

    // Правый инспектор (.inspector)
    const card = DATA.projectCards.find((c) => c.id === state.selectedProjectId) || DATA.projectCards[0];
    const fin = calculateProjectFinancials(card);
    const isDone = !!state.completedProjects[card.id];
    const activeObj = state.activeProjects.find((p) => p.id === card.id);
    const lockedByCam = card.requiresCameras && !state.camerasUnlocked;
    const teams = getBusyTeamsCount();

    inspectorEl.innerHTML = `
      <div class="inspector-top">
        <span>${card.category}</span>
        <span>+${card.xp} XP</span>
      </div>

      <div class="inspector-scroll">
        <h2>${card.title}</h2>
        <p class="project-description">${card.shortDesc}</p>

        <figure class="project-explainer">
          ${getProjectHoloSvg(card)}
          <div class="signal-scene" style="padding:10px 12px;">
            <span>${card.whyItWorks}</span>
          </div>
          <figcaption>
            <span>${card.teamType === "admin" ? "Административная программа" : "Строительная бригада"}</span>
            <span>${card.buildMonths} мес. до открытия</span>
          </figcaption>
        </figure>

        <div class="effect">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <div>
            <strong>Снижение доли опоздавших: ${card.congestionEffect}%</strong>
            <p>Действует во всех затронутых коридорах Астаны до конца 60-месячного срока.</p>
          </div>
        </div>

        ${
          card.constructionPenalty > 0
            ? `
          <div class="effect waste">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <strong>На время дорожных работ: +${card.constructionPenalty}% к заторам</strong>
              <p>Пока идет стройка (${card.buildMonths} мес.), пропускная способность участка временно снижена.</p>
            </div>
          </div>
        `
            : `
          <div class="effect">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <div>
              <strong>Без перекрытия улиц</strong>
              <p>Выполняется силами административной команды без раскопок и помех потоку.</p>
            </div>
          </div>
        `
        }

        <dl class="project-cost">
          <div>
            <dt>Оплачено при запуске</dt>
            <dd>${fin.baseCost.toFixed(1)} млрд ₸</dd>
          </div>
          <div>
            <dt>Резерв содержания (1%/мес до 60 мес.)</dt>
            <dd>${fin.opexReserve.toFixed(1)} млрд ₸</dd>
          </div>
          <div>
            <dt>Репутация при запуске</dt>
            <dd class="${card.trustLaunch >= 0 ? "mint" : "coral"}">${card.trustLaunch >= 0 ? "+" : ""}${card.trustLaunch}%</dd>
          </div>
          <div class="total">
            <dt>Всего с резервом</dt>
            <dd>${fin.totalCost.toFixed(1)} млрд ₸</dd>
          </div>
        </dl>
      </div>

      <div class="inspector-actions">
        <button class="primary" onclick="launchSelectedProject('${card.id}')" ${
      isDone || activeObj || lockedByCam ? "disabled" : ""
    }>
          <span>${
            isDone
              ? "Проект уже работает в городе"
              : activeObj
              ? `В работе (осталось ${activeObj.monthsRemaining} мес.)`
              : lockedByCam
              ? "Сначала установите камеры «Сергек»"
              : "Запустить проект"
          }</span>
          <strong>${fin.totalCost.toFixed(1)} млрд ₸</strong>
        </button>

        <div class="crews">
          <span>Стройбригады: <b>${teams.buildFree} из 2</b></span>
          <span>Адм. команда: <b>${teams.adminFree} из 1</b></span>
        </div>

        <div class="construction-list">
          ${state.activeProjects
            .map((p) => {
              const pct = Math.round(((p.totalMonths - p.monthsRemaining) / p.totalMonths) * 100);
              return `
              <div>
                <span>${p.title}</span>
                <strong>${p.monthsRemaining} мес.</strong>
                <i style="width:${Math.max(15, pct)}%"></i>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  // Входное и выходное тестирование + Миссии
  window.answerPreTest = function (qId, optId) {
    const isNew = !state.preAnswers[qId];
    state.preAnswers[qId] = optId;
    const q = DATA.preAssessmentQuestions.find((item) => item.id === qId);
    const opt = q.options.find((o) => o.id === optId);
    if (q && opt) {
      state.scores.pre[q.competency] = Math.max(32, Math.min(82, Math.round(35 + opt.score * 0.45)));
      if (isNew) state.xp += 25;
    }
    saveState();
    renderModals();
    renderTopBar();
  };

  window.answerPostTest = function (qId, optId) {
    const isNew = !state.postAnswers[qId];
    state.postAnswers[qId] = optId;
    const q = DATA.postAssessmentQuestions.find((item) => item.id === qId);
    const opt = q.options.find((o) => o.id === optId);
    if (q && opt) {
      state.scores.post[q.competency] = opt.score;
      if (isNew) state.xp += 30;
    }
    saveState();
    renderModals();
    renderTopBar();
  };

  window.selectMission = function (mId) {
    state.activeMissionId = mId;
    renderModals();
  };

  window.executeMissionChoice = function (missionId, choiceId) {
    const m = DATA.missions.find((item) => item.id === missionId);
    if (!m) return;
    const ch = m.choices.find((c) => c.id === choiceId);
    if (!ch) return;

    if (!state.completedMissions[missionId]) {
      state.xp += ch.xpReward || 100;
    }
    state.city.trust = Math.max(0, Math.min(100, state.city.trust + ch.effects.trust));
    state.city.congestion = Math.max(18, Math.min(98, state.city.congestion + ch.effects.congestion));
    state.city.legal = Math.max(15, Math.min(100, state.city.legal + ch.effects.legal));

    if (ch.competencyGain) {
      Object.entries(ch.competencyGain).forEach(([k, v]) => {
        state.scores.simBonus[k] = Math.max(state.scores.simBonus[k] || 0, v);
      });
    }

    state.completedMissions[missionId] = {
      choiceId: ch.id,
      missionTitle: m.title,
      choiceTitle: ch.title,
      legalVerdict: ch.legalVerdict,
      longTermEffect: ch.longTermEffect,
      cost: ch.cost
    };

    saveState();
    renderAll();
    showToast(`Постановление подписано: ${ch.title}`);
  };

  window.selectWarAgentScenario = function (scId) {
    state.activeWarAgentScenarioId = scId;
    renderModals();
  };

  // Интерактивный Конструктор Административных Актов (Document Lab)
  state.activeDocId = state.activeDocId || "draft_appk_73";
  state.docSlotSelections = state.docSlotSelections || {};
  state.loopyParams = state.loopyParams || {
    busPriority: 65,
    pdpControl: 80,
    opexReserveRatio: 75,
    appkServiceLevel: 85
  };

  window.selectDocExercise = function (docId) {
    state.activeDocId = docId;
    renderModals();
  };

  window.pickDocSlotOption = function (docId, slotId, optId, isCorrect, compKey) {
    state.docSlotSelections[`${docId}_${slotId}`] = optId;
    if (isCorrect) {
      state.xp += 35;
      state.city.legal = Math.min(100, state.city.legal + 3);
      if (compKey) {
        state.scores.simBonus[compKey] = Math.min(45, (state.scores.simBonus[compKey] || 0) + 8);
      }
      showToast("Формулировка прошла правовой контроль НПА РК (+35 XP)!");
    } else {
      showToast("Обнаружен процедурный дефект! Изучите замечание СМАС / ДВГА.");
    }
    saveState();
    renderModals();
    renderTopBar();
  };

  window.updateLoopyParam = function (key, val) {
    state.loopyParams[key] = Number(val);
    renderModals();
  };

  window.copyTemplateText = function (txt) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt);
    }
    showToast("Готовый юридический шаблон скопирован в буфер обмена для работы!");
  };

  window.executeWarAgentMove = function (scId, moveId) {
    if (!DATA.warAgentModule) return;
    const sc = DATA.warAgentModule.scenarios.find((s) => s.id === scId);
    if (!sc) return;
    const mv = sc.moves.find((m) => m.id === moveId);
    if (!mv) return;

    if (!state.warAgentMoves[scId]) state.xp += mv.effects.xp || 100;
    state.warAgentMoves[scId] = moveId;
    state.city.trust = Math.max(0, Math.min(100, state.city.trust + mv.effects.trust));
    state.city.legal = Math.max(15, Math.min(100, state.city.legal + mv.effects.legal));
    state.scores.simBonus.diplomacy_waragent = Math.min(
      45,
      (state.scores.simBonus.diplomacy_waragent || 0) + (mv.effects.legal >= 0 ? 28 : 5)
    );

    saveState();
    renderAll();
    showToast(`Дипломатический раунд проведен (+${mv.effects.xp} XP)`);
  };

  // Рендер всех модальных экранов в фирменном стиле оригинала (.start-screen, .modal-backdrop, .report-modal)
  function renderModals() {
    const container = document.getElementById("modal-container");
    if (!container) return;

    // 1. Стартовый экран (.start-screen — 1-в-1 как в «Аким Алматы: разрули!»)
    if (state.showStartScreen) {
      container.innerHTML = `
        <div class="start-screen">
          <div class="start-card">
            <div class="title-mark">ГОРОД ВАШ. РЕШЕНИЯ ТОЖЕ. • АСТАНА, КАЗАХСТАН</div>
            <h1>
              АКИМ АСТАНЫ
              <em>РАЗРУЛИ!</em>
            </h1>
            <p>
              Вверяю вам столицу. У вас пять лет (60 месяцев) и 100 миллиардов тенге. Верните людям время, которое они теряют в пробках, пройдите диагностику 6 компетенций госслужащего РК и удержите город в зеленой зоне.
            </p>
            <div class="start-facts">
              <span><b>60</b> месяцев в должности</span>
              <span><b>100 млрд ₸</b> свободный бюджет</span>
              <span><b>≤30%</b> цель опозданий (55–60 мес.)</span>
            </div>
            <button class="primary" onclick="startCampaign()" style="max-width:360px;height:52px;font-size:15px;">
              <span>Понятно. За работу в 3D-городе!</span>
              <span>→</span>
            </button>
            <button class="secondary" onclick="startCampaign(); openModal('academy', 'pre');" style="width:360px;margin-top:10px;">
              <span>Сначала пройти Входной тест (6 компетенций)</span>
            </button>
            <button class="secondary" onclick="activatePresentationDemo()" style="width:360px;margin-top:8px;border-color:#ffbd6966;color:var(--gold);">
              <span>Демо-показ: сразу открыть готовый отчет «До / После»</span>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // 2. Внезапное кризисное событие месяца (.modal)
    if (state.activeEventModal) {
      const ev = state.activeEventModal;
      container.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal">
            <div class="story-kicker">ВНЕЗАПНОЕ СОБЫТИЕ • МЕСЯЦ ${state.currentMonth} ИЗ 60 • ВРЕМЯ ОСТАНОВЛЕНО</div>
            <h2>${ev.title}</h2>
            <p style="color:var(--gold);font-weight:700;">${ev.subtitle}</p>
            <p>${ev.description}</p>
            <div class="event-choices">
              ${ev.options
                .map(
                  (opt, idx) => `
                <button onclick="resolveRandomEvent(${idx})">
                  <strong>
                    <span>${opt.label}</span>
                    <span class="gold">Выбрать →</span>
                  </strong>
                </button>
              `
                )
                .join("")}
            </div>
          </div>
        </div>
      `;
      return;
    }

    // 3. Финал 60 месяцев или отставка (.modal)
    if (state.endgameModal) {
      const b = DATA.presidentialBriefing;
      const isWin = state.endgameModal === "win";
      const isRiot = state.endgameModal === "riot";
      const quote = isWin ? b.winQuote : isRiot ? b.riotQuote : b.loseQuote;

      container.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal">
            <div class="story-kicker ${isWin ? "mint" : "coral"}">
              ${isWin ? "ПОБЕДА • ШЕСТЬ РЕШАЮЩИХ МЕСЯЦЕВ В ЗЕЛЕНОЙ ЗОНЕ" : "ИТОГ ПЯТИЛЕТКИ / ОТСТАВКА"}
            </div>
            <h2>${b.speaker} — ${b.role}</h2>
            <p style="font-size:15px;color:#eef3f5;">${quote}</p>
            <div class="report-summary">
              <div><strong>${getEffectiveCongestion()}%</strong><span>Опоздали в час пик</span></div>
              <div><strong>${state.city.trust}%</strong><span>Репутация</span></div>
              <div><strong>${state.freeBudget.toFixed(1)} млрд ₸</strong><span>Остаток бюджета</span></div>
            </div>
            <button class="primary" onclick="state.endgameModal=null; openModal('report');">
              <span>Открыть итоговый отчет «До / После»</span>
              <span>→</span>
            </button>
            <button class="secondary" onclick="resetSimulationAll()" style="width:100%;margin-top:10px;">
              <span>Начать новую кампанию</span>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // 4. Модальное окно: 6 Компетенций РК, Входной тест (До), Кейсы Акимата, Выходной тест (После), НПА
    if (state.activeModal === "academy") {
      const sub = state.academySubTab;
      let bodyHtml = "";

      if (sub === "matrix") {
        bodyHtml = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px;margin-top:14px;">
            ${DATA.competencies
              .map((c, i) => {
                const preV = state.scores.pre[c.id] || 44;
                const postV = getEffectivePostScore(c.id);
                return `
                <div style="background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
                  <div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gold);font-weight:800;">
                      <span>КОМПЕТЕНЦИЯ ${i + 1}</span>
                      <span class="mint">${preV}% → ${postV}%</span>
                    </div>
                    <h3 style="font-family:var(--display);font-size:20px;margin:6px 0 4px;">${c.shortName}</h3>
                    <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">${c.lawRef}</div>
                    <p style="font-size:12px;color:#eef3f5;line-height:1.5;background:#142330;padding:10px;border-radius:8px;">
                      <b class="gold">Золотое правило:</b> ${c.goldenRule}
                    </p>
                  </div>
                  <div style="font-size:11px;color:var(--muted);line-height:1.5;">
                    ${(c.checklist || []).map((item) => `<div>✓ ${item}</div>`).join("")}
                  </div>
                </div>
              `;
              })
              .join("")}
          </div>
        `;
      } else if (sub === "pre" || sub === "post") {
        const qList = sub === "pre" ? DATA.preAssessmentQuestions : DATA.postAssessmentQuestions;
        const ansMap = sub === "pre" ? state.preAnswers : state.postAnswers;
        const fnName = sub === "pre" ? "answerPreTest" : "answerPostTest";

        bodyHtml = `
          <div style="display:grid;gap:14px;margin-top:14px;">
            ${qList
              .map((q, idx) => {
                const chosenId = ansMap[q.id];
                const chosenOpt = q.options.find((o) => o.id === chosenId);
                return `
                <div style="background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:18px;">
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gold);font-weight:800;margin-bottom:6px;">
                    <span>${q.badge}</span>
                    <span>${chosenOpt ? `Балл: ${chosenOpt.score}/100` : "Выберите ответ"}</span>
                  </div>
                  <p style="font-size:13px;color:#eef3f5;margin-bottom:8px;">${q.situation}</p>
                  <strong style="font-size:14px;display:block;margin-bottom:10px;">${idx + 1}. ${q.question}</strong>
                  <div class="event-choices" style="margin-top:8px;">
                    ${q.options
                      .map((opt) => {
                        const isSel = chosenId === opt.id;
                        return `
                        <button class="${isSel ? "chosen" : ""}" onclick="${fnName}('${q.id}', '${opt.id}')">
                          <strong><span>${opt.id.toUpperCase()}. ${opt.text}</span></strong>
                        </button>
                      `;
                      })
                      .join("")}
                  </div>
                  ${
                    chosenOpt
                      ? `<p style="margin-top:10px;padding:10px;border-radius:8px;background:#142330;color:${
                          chosenOpt.score === 100 ? "var(--mint)" : "var(--gold)"
                        };font-size:12px;"><b>Разбор НПА РК:</b> ${chosenOpt.feedback}</p>`
                      : ""
                  }
                </div>
              `;
              })
              .join("")}
          </div>
        `;
      } else if (sub === "missions") {
        const m = DATA.missions.find((item) => item.id === state.activeMissionId) || DATA.missions[0];
        const rec = state.completedMissions[m.id];

        bodyHtml = `
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0;">
            ${DATA.missions
              .map(
                (item, i) => `
              <button onclick="selectMission('${item.id}')" class="layer-chip ${item.id === m.id ? "active" : ""}">
                Кейс ${i + 1}: ${item.title.slice(0, 26)}...
              </button>
            `
              )
              .join("")}
          </div>
          <div style="background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:18px;">
            <div class="story-kicker">${m.urgency} • ${m.normativeBase}</div>
            <h3 style="font-family:var(--display);font-size:24px;margin:6px 0;">${m.title}</h3>
            <p>${m.context}</p>
            <div class="event-choices">
              ${m.choices
                .map((ch) => {
                  const isSel = rec && rec.choiceId === ch.id;
                  return `
                  <button class="${isSel ? "chosen" : ""}" onclick="executeMissionChoice('${m.id}', '${ch.id}')">
                    <strong>
                      <span>${ch.title}</span>
                      <span class="gold">${ch.cost.toFixed(1)} млрд ₸</span>
                    </strong>
                    <span>${ch.badge} • Заторы ${ch.effects.congestion}%, Репутация ${ch.effects.trust >= 0 ? "+" : ""}${ch.effects.trust}%</span>
                    <small>${ch.description}</small>
                  </button>
                `;
                })
                .join("")}
            </div>
            ${
              rec
                ? `<p style="margin-top:12px;padding:12px;background:#142330;border-radius:8px;color:var(--mint);font-size:12px;">
                    <b>Юридический вердикт:</b> ${rec.legalVerdict}<br/><b>Долгосрочный эффект:</b> ${rec.longTermEffect}
                  </p>`
                : ""
            }
          </div>
        `;
      } else if (sub === "doc_lab" && DATA.learningEngine) {
        const docs = DATA.learningEngine.docDraftingExercises;
        const curDoc = docs.find((d) => d.id === state.activeDocId) || docs[0];
        const allSlotsCorrect = curDoc.slots.every((s) => {
          const pickedId = state.docSlotSelections[`${curDoc.id}_${s.slotId}`];
          const opt = s.options.find((o) => o.id === pickedId);
          return opt && opt.isCorrect;
        });

        bodyHtml = `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
            ${docs
              .map(
                (d) => `
              <button onclick="selectDocExercise('${d.id}')" class="layer-chip ${d.id === curDoc.id ? "active" : ""}">
                ${d.badge}
              </button>
            `
              )
              .join("")}
          </div>

          <div style="background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:18px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
              <div class="story-kicker">${curDoc.docType}</div>
              <span class="${allSlotsCorrect ? "mint" : "gold"}" style="font-size:12px;font-weight:800;">
                ${allSlotsCorrect ? "✓ ДОКУМЕНТ ПРОШЕЛ ВЕРИФИКАЦИЮ СМАС / ДВГА / АДГС" : "Соберите все 3 блока без правовых ошибок"}
              </span>
            </div>
            <p style="margin-top:8px;">${curDoc.context}</p>

            <div style="display:grid;gap:14px;margin-top:14px;">
              ${curDoc.slots
                .map((slot) => {
                  const pickedId = state.docSlotSelections[`${curDoc.id}_${slot.slotId}`];
                  const pickedOpt = slot.options.find((o) => o.id === pickedId);
                  return `
                  <div style="background:#142330;border:1px solid var(--line);border-radius:10px;padding:14px;">
                    <strong style="font-size:13px;color:var(--gold);display:block;margin-bottom:8px;">${slot.label}</strong>
                    <div class="event-choices" style="margin-top:6px;">
                      ${slot.options
                        .map((o) => {
                          const isSel = pickedId === o.id;
                          return `
                          <button class="${isSel ? (o.isCorrect ? "chosen" : "") : ""}" style="${
                            isSel && !o.isCorrect ? "border-color:var(--coral);background:#2a161b;" : ""
                          }" onclick="pickDocSlotOption('${curDoc.id}', '${slot.slotId}', '${o.id}', ${o.isCorrect}, '${curDoc.competency}')">
                            <strong><span>${o.text}</span></strong>
                          </button>
                        `;
                        })
                        .join("")}
                    </div>
                    ${
                      pickedOpt
                        ? `<div style="margin-top:8px;padding:8px 12px;border-radius:7px;background:#0c1723;font-size:12px;font-weight:700;" class="${
                            pickedOpt.isCorrect ? "mint" : "coral"
                          }">
                            ${pickedOpt.isCorrect ? `✓ ${pickedOpt.legalPraise}` : `✕ ОШИБКА: ${pickedOpt.errorTag}`}
                          </div>`
                        : ""
                    }
                  </div>
                `;
                })
                .join("")}
            </div>

            <div style="margin-top:14px;padding:12px 14px;border-radius:10px;background:#09131c;border:1px solid rgba(142,220,190,0.3);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              <div style="font-size:12px;color:#eef3f5;flex:1;">
                <b class="mint">Готовая формулировка в работу:</b> ${curDoc.templateTakeaway}
              </div>
              <button class="secondary" onclick="copyTemplateText('${curDoc.templateTakeaway.replace(/'/g, "")}')" style="min-height:36px;padding:6px 12px;font-size:11px;">
                Скопировать шаблон
              </button>
            </div>
          </div>
        `;
      } else if (sub === "system_sandbox" && DATA.learningEngine) {
        const p = state.loopyParams;
        // Расчет системных показателей на горизонте 3 лет по ползункам
        const projCongestion = Math.max(18, Math.round(88 - p.busPriority * 0.38 - p.pdpControl * 0.24));
        const projSmasCancels = Math.max(0, Math.round(45 - p.appkServiceLevel * 0.48));
        const projInfraAccidents = Math.max(2, Math.round(62 - p.opexReserveRatio * 0.55 - p.pdpControl * 0.12));
        const projCitizenTrust = Math.min(98, Math.round(25 + p.busPriority * 0.22 + p.appkServiceLevel * 0.28 + p.opexReserveRatio * 0.22));

        const traps = DATA.learningEngine.trapAnatomyCards;

        bodyHtml = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px;">
            <div style="background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:16px;">
              <div class="story-kicker">СИМУЛЯТОР ПРИЧИННО-СЛЕДСТВЕННЫХ ПЕТЕЛЬ (LOOPY 3 ГОДА)</div>
              <p style="font-size:12px;margin:6px 0 12px;">Двигайте ползунки управленческой политики и наблюдайте, как решения в одной сфере цепной реакцией меняют город через 36 месяцев:</p>

              <div style="display:grid;gap:12px;font-size:12px;">
                <div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span>1. Приоритет Bus Lane, ИТС и сдвиг графиков</span>
                    <b class="gold">${p.busPriority}%</b>
                  </div>
                  <input type="range" min="0" max="100" value="${p.busPriority}" oninput="updateLoopyParam('busPriority', this.value)" style="padding:0;height:6px;accent-color:var(--gold);" />
                </div>

                <div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span>2. Контроль ПДП и запрет ЖК без школ/паркингов</span>
                    <b class="gold">${p.pdpControl}%</b>
                  </div>
                  <input type="range" min="0" max="100" value="${p.pdpControl}" oninput="updateLoopyParam('pdpControl', this.value)" style="padding:0;height:6px;accent-color:var(--gold);" />
                </div>

                <div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span>3. Резерв OPEX на содержание и кольцевание ТЭЦ</span>
                    <b class="gold">${p.opexReserveRatio}%</b>
                  </div>
                  <input type="range" min="0" max="100" value="${p.opexReserveRatio}" oninput="updateLoopyParam('opexReserveRatio', this.value)" style="padding:0;height:6px;accent-color:var(--gold);" />
                </div>

                <div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span>4. Стандарт ст. 73 АППК РК и Новый Закон о госслужбе</span>
                    <b class="gold">${p.appkServiceLevel}%</b>
                  </div>
                  <input type="range" min="0" max="100" value="${p.appkServiceLevel}" oninput="updateLoopyParam('appkServiceLevel', this.value)" style="padding:0;height:6px;accent-color:var(--gold);" />
                </div>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);">
                <div style="background:#142330;padding:10px;border-radius:8px;">
                  <span style="font-size:10px;color:var(--muted);display:block;">Опоздания в час пик</span>
                  <strong style="font-family:var(--display);font-size:24px;" class="${projCongestion <= 30 ? "mint" : "coral"}">${projCongestion}%</strong>
                </div>
                <div style="background:#142330;padding:10px;border-radius:8px;">
                  <span style="font-size:10px;color:var(--muted);display:block;">Отмены актов в СМАС</span>
                  <strong style="font-family:var(--display);font-size:24px;" class="${projSmasCancels <= 5 ? "mint" : "coral"}">${projSmasCancels}%</strong>
                </div>
                <div style="background:#142330;padding:10px;border-radius:8px;">
                  <span style="font-size:10px;color:var(--muted);display:block;">Риск аварий ТЭЦ/ливневок</span>
                  <strong style="font-family:var(--display);font-size:24px;" class="${projInfraAccidents <= 15 ? "mint" : "coral"}">${projInfraAccidents}%</strong>
                </div>
                <div style="background:#142330;padding:10px;border-radius:8px;">
                  <span style="font-size:10px;color:var(--muted);display:block;">Индекс доверия горожан</span>
                  <strong style="font-family:var(--display);font-size:24px;" class="mint">${projCitizenTrust}%</strong>
                </div>
              </div>
            </div>

            <div style="display:grid;gap:10px;">
              <div class="story-kicker">АНАТОМИЯ 4 ГЛАВНЫХ АППАРАТНЫХ ЛОВУШЕК НА ПРОВЕРКАХ</div>
              ${traps
                .map(
                  (t) => `
                <div style="background:var(--deep);border:1px solid var(--line);border-radius:10px;padding:12px;">
                  <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;">
                    <span class="coral">${t.trapTitle}</span>
                    <span class="gold">${t.lawBroken}</span>
                  </div>
                  <p style="font-size:11px;margin:4px 0;color:var(--muted);"><b>Типичная ошибка:</b> ${t.wrongHabit}</p>
                  <p style="font-size:11px;margin:0;color:var(--mint);"><b>Как правильно:</b> ${t.correctAlgorithm}</p>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `;
      } else if (sub === "laws") {
        bodyHtml = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px;margin-top:14px;">
            ${DATA.lawsLibrary
              .map(
                (l) => `
              <div style="background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:16px;">
                <span class="gold" style="font-size:11px;font-weight:800;">${l.code}</span>
                <h3 style="font-family:var(--display);font-size:19px;margin:5px 0;">${l.title}</h3>
                <p style="font-size:12px;">${l.summary}</p>
                <small class="coral" style="display:block;margin-top:8px;font-size:11px;"><b>Практика СМАС / ВАП:</b> ${l.consequence}</small>
              </div>
            `
              )
              .join("")}
          </div>
        `;
      }

      container.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal wide-modal">
            <button class="modal-close" onclick="closeModal()">✕</button>
            <div class="story-kicker">АКАДЕМИЯ ГОСУПРАВЛЕНИЯ ПРИ ПРЕЗИДЕНТЕ РК • УЧЕБНЫЙ КОНТУР</div>
            <h2>Обучение и тестирование 6 компетенций госслужащего</h2>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;border-bottom:1px solid var(--line);padding-bottom:12px;">
              <button onclick="setAcademySubTab('matrix')" class="layer-chip ${sub === "matrix" ? "active" : ""}">Матрица 6 компетенций</button>
              <button onclick="setAcademySubTab('doc_lab')" class="layer-chip ${sub === "doc_lab" ? "active" : ""}">📝 Конструктор актов и документов</button>
              <button onclick="setAcademySubTab('system_sandbox')" class="layer-chip ${sub === "system_sandbox" ? "active" : ""}">🔄 Системный тренажер & Ловушки</button>
              <button onclick="setAcademySubTab('pre')" class="layer-chip ${sub === "pre" ? "active" : ""}">1. Входной тест (До)</button>
              <button onclick="setAcademySubTab('missions')" class="layer-chip ${sub === "missions" ? "active" : ""}">2. Кейсы управлений (5 сфер)</button>
              <button onclick="setAcademySubTab('post')" class="layer-chip ${sub === "post" ? "active" : ""}">3. Аттестация (После)</button>
              <button onclick="setAcademySubTab('laws')" class="layer-chip ${sub === "laws" ? "active" : ""}">Кодексы НПА РК</button>
            </div>
            ${bodyHtml}
          </div>
        </div>
      `;
      return;
    }

    // 5. Модальное окно: Мультиагентная дипломатия WarAgent
    if (state.activeModal === "waragent" && DATA.warAgentModule) {
      const mod = DATA.warAgentModule;
      const sc = mod.scenarios.find((s) => s.id === state.activeWarAgentScenarioId) || mod.scenarios[0];
      const chosenMoveId = state.warAgentMoves[sc.id];
      const chosenMove = sc.moves.find((m) => m.id === chosenMoveId);

      container.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal wide-modal">
            <button class="modal-close" onclick="closeModal()">✕</button>
            <div class="story-kicker">AGIRESEARCH / WARAGENT • СИМУЛЯТОР ДЛЯ ДИПЛОМАТОВ МИД РК И ПЕРЕГОВОРЩИКОВ МФЦА</div>
            <h2>${sc.title}</h2>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
              ${mod.scenarios
                .map(
                  (item) => `
                <button onclick="selectWarAgentScenario('${item.id}')" class="layer-chip ${item.id === sc.id ? "active" : ""}">
                  ${item.title.slice(0, 42)}...
                </button>
              `
                )
                .join("")}
            </div>
            <p>${sc.situation}</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0;">
              ${sc.agents
                .map((ag) => {
                  const react = chosenMove ? chosenMove.agentReactions[ag.id] : null;
                  const tr = react ? Math.max(0, Math.min(100, ag.trust + react.delta)) : ag.trust;
                  return `
                  <div style="background:var(--deep);border:1px solid var(--line);border-radius:10px;padding:12px;">
                    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;">
                      <span>${ag.name}</span>
                      <span class="${tr >= 65 ? "mint" : "coral"}">${tr}%</span>
                    </div>
                    <small class="gold" style="display:block;margin:3px 0;">${ag.role}</small>
                    <p style="font-size:11px;margin:4px 0;">${ag.stance}</p>
                    ${react ? `<small class="mint" style="display:block;margin-top:6px;">${react.reply}</small>` : ""}
                  </div>
                `;
                })
                .join("")}
            </div>
            <div class="event-choices">
              ${sc.moves
                .map((mv) => {
                  const isSel = chosenMoveId === mv.id;
                  return `
                  <button class="${isSel ? "chosen" : ""}" onclick="executeWarAgentMove('${sc.id}', '${mv.id}')">
                    <strong>
                      <span>${mv.title}</span>
                      <span class="gold">+${mv.effects.xp} XP</span>
                    </strong>
                    <span>${mv.diplomaticStyle}</span>
                  </button>
                `;
                })
                .join("")}
            </div>
            ${
              chosenMove
                ? `<p style="margin-top:12px;padding:12px;background:var(--deep);border-radius:8px;color:var(--mint);font-size:12px;">
                    <b>Secretary Agent (Верификация МИД РК и МФЦА):</b> ${chosenMove.secretaryCheck}
                  </p>`
                : ""
            }
          </div>
        </div>
      `;
      return;
    }

    // 6. Модальное окно: Открытый городской отчет + Сравнение компетенций «До / После» (.report-modal)
    if (state.activeModal === "report") {
      const comps = DATA.competencies;
      const preValues = comps.map((c) => state.scores.pre[c.id] || 44);
      const postValues = comps.map((c) => getEffectivePostScore(c.id));
      const avgPre = Math.round(preValues.reduce((a, b) => a + b, 0) / comps.length);
      const avgPost = Math.round(postValues.reduce((a, b) => a + b, 0) / comps.length);
      const avgDelta = avgPost - avgPre;
      const effCong = getEffectiveCongestion();

      // Построение SVG графика пробок по месяцам + Гексагона компетенций До/После
      const cx = 155, cy = 145, maxR = 92;
      const pt = (i, v) => {
        const a = (Math.PI * 2 * i) / comps.length - Math.PI / 2;
        const r = (v / 100) * maxR;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      };
      const gridSvg = [30, 60, 100]
        .map(
          (l) =>
            `<polygon points="${comps.map((_, i) => pt(i, l).join(",")).join(" ")}" fill="none" stroke="#a6c8de33" stroke-width="1"/>`
        )
        .join("");
      const prePoly = comps.map((_, i) => pt(i, preValues[i]).join(",")).join(" ");
      const postPoly = comps.map((_, i) => pt(i, postValues[i]).join(",")).join(" ");
      const axisLabels = comps
        .map((c, i) => {
          const [x, y] = pt(i, 116);
          return `<text x="${x}" y="${y}" fill="#eef3f5" font-size="10" font-weight="700" text-anchor="middle">${c.shortName.split(" ")[0]}</text>`;
        })
        .join("");

      container.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal wide-modal">
            <button class="modal-close" onclick="closeModal()">✕</button>
            <div class="story-kicker">ОТКРЫТЫЙ ГОРОДСКОЙ ОТЧЕТ И КАДРОВЫЙ ПРОФИЛЬ ГОССЛУЖАЩЕГО РК</div>
            <h2>Итоги управления Астаной и сравнение компетенций «До / После»</h2>

            <div class="report-summary">
              <div><strong>${avgPre}% → ${avgPost}%</strong><span>Прогресс 6 компетенций (Δ +${avgDelta}%)</span></div>
              <div><strong class="${effCong <= 30 ? "mint" : "coral"}">${effCong}%</strong><span>Доля опоздавших (Цель ≤30%)</span></div>
              <div><strong>${state.freeBudget.toFixed(1)} млрд ₸</strong><span>Свободный бюджет (OPEX: ${state.reservedOpex.toFixed(1)})</span></div>
              <div><strong class="mint">${state.city.trust}%</strong><span>Репутация среди горожан</span></div>
            </div>

            <div style="display:grid;grid-template-columns:310px minmax(0,1fr);gap:20px;align-items:center;">
              <div style="background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center;">
                <div style="font-size:11px;font-weight:800;color:var(--gold);margin-bottom:4px;">ГЕКСАГРАММА: ДО (ЗОЛОТОЙ) / ПОСЛЕ (МЯТНЫЙ)</div>
                <svg viewBox="0 0 310 290" style="width:100%;height:auto;">
                  ${gridSvg}
                  <polygon points="${prePoly}" fill="#ffbd6933" stroke="#ffbd69" stroke-width="2" stroke-dasharray="4 2"/>
                  <polygon points="${postPoly}" fill="#8edcbe44" stroke="#8edcbe" stroke-width="2.5"/>
                  ${axisLabels}
                </svg>
              </div>

              <div style="display:grid;gap:8px;">
                ${comps
                  .map((c, i) => {
                    const preV = preValues[i];
                    const postV = postValues[i];
                    return `
                    <div style="background:var(--deep);border:1px solid var(--line);border-radius:9px;padding:10px 14px;">
                      <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;">
                        <span>${c.fullName}</span>
                        <span class="mint">${preV}% → ${postV}% (+${postV - preV}%)</span>
                      </div>
                      <div style="font-size:10px;color:var(--muted);margin:2px 0 6px;">${c.lawRef}</div>
                      <div style="height:5px;background:#1e3242;border-radius:4px;overflow:hidden;">
                        <div style="height:100%;width:${postV}%;background:var(--mint);"></div>
                      </div>
                    </div>
                  `;
                  })
                  .join("")}
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);">
              <button class="secondary" onclick="activatePresentationDemo()">Заполнить эталонный демо-результат</button>
              <button class="primary" onclick="window.print()" style="width:auto;padding:10px 22px;">Печать / Сохранить PDF</button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
  }

  function renderAll() {
    renderTopBar();
    renderCityHeadingAndDistricts();
    renderProjectRailAndInspector();
    renderLayerChips();
    renderModals();
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadSavedState();
    renderAll();
    initAstana3DMap();
  });
})();
