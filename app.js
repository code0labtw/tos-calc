  const levels = (await (await fetch('levels.json')).json()).rows;

  const numberFormat = new Intl.NumberFormat('zh-TW');
  const RECOVERY_MINUTES_PER_STAMINA = 8;
  const TAIWAN_TIME_ZONE = 'Asia/Taipei';

  const taiwanDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIWAN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const taiwanDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIWAN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

  const taiwanMonthDayTimeFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIWAN_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

  const levelFields = ['currentLevel', 'currentExp', 'targetLevel', 'targetStageCount', 'stageExp', 'stageStamina', 'expPotionCount', 'expPotionChoice'];
  const teamCostFields = ['teamCostInput'];
  const staminaFields = ['currentStamina', 'currentStaminaMax'];
  const warFields = ['warBonus', 'warMerit', 'warCountdownHours'];
  const FREE_WAR_POINTS = 16;
  const WAR_STONE_POINTS = 8;
  let targetMode = 'level';

  const $ = id => document.getElementById(id);

  function readNumber(id) {
    const el = $(id);
    if (!el) return NaN;
    const value = el.value.trim();
    return value === '' ? NaN : Number(value);
  }

  function formatInteger(value) {
    return Number.isFinite(value) ? numberFormat.format(Math.round(value)) : '—';
  }

  function formatRecoveryTime(stamina) {
    const totalMinutes = Math.max(0, Math.round(stamina * RECOVERY_MINUTES_PER_STAMINA));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days > 0) parts.push(days + '日');
    if (hours > 0) parts.push(hours + '小時');
    if (minutes > 0 || parts.length === 0) parts.push(minutes + '分鐘');
    return parts.join(' ');
  }

  function formatNumber(value) {
    return Number.isFinite(value) ? numberFormat.format(value) : '—';
  }

  function getTaiwanDateParts(date) {
    const parts = taiwanDateFormatter.formatToParts(date);
    return parts.reduce((result, part) => {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') result[part.type] = Number(part.value);
      return result;
    }, {});
  }

  function formatDateTime(date) {
    const parts = taiwanDateTimeFormatter.formatToParts(date);
    const values = parts.reduce((result, part) => {
      if (['year', 'month', 'day', 'hour', 'minute'].includes(part.type)) result[part.type] = part.value;
      return result;
    }, {});
    return values.year + '/' + values.month + '/' + values.day + ' ' + values.hour + ':' + values.minute;
  }

  function formatMonthDayTime(date) {
    const parts = taiwanMonthDayTimeFormatter.formatToParts(date);
    const values = parts.reduce((result, part) => {
      if (['month', 'day', 'hour', 'minute'].includes(part.type)) result[part.type] = part.value;
      return result;
    }, {});
    return Number(values.month) + '月' + Number(values.day) + '日 ' + values.hour + ':' + values.minute;
  }

  function calendarDaysInclusive(start, end) {
    const startParts = getTaiwanDateParts(start);
    const endParts = getTaiwanDateParts(end);
    const startDay = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
    const endDay = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
    return Math.max(1, Math.floor((endDay - startDay) / 86400000) + 1);
  }

  function setMessage(id, message) {
    const input = $(id);
    const messageNode = $(id + 'Message');
    const invalid = message !== '';
    if (messageNode && messageNode.textContent !== message) messageNode.textContent = message;
    if (input && input.classList.contains('invalid') !== invalid) input.classList.toggle('invalid', invalid);
  }

  function setMetric(id, value) {
    const valueNode = $(id);
    if (valueNode && valueNode.textContent !== value) valueNode.textContent = value;
  }

  function clearMessages(fieldIds) {
    fieldIds.forEach(id => setMessage(id, ''));
  }

  function resetMetrics(ids) {
    ids.forEach(id => setMetric(id, '—'));
  }

  function resetLevelResults() {
    resetMetrics(['currentProgress', 'resolvedTargetLevel', 'stageCount', 'staminaRecoverCount', 'targetStaminaMax', 'targetTeamCost']);
  }

  function findLevelForTeamCost(cost) {
    for (let i = 0; i < levels.length; i++) {
      if (levels[i][3] >= cost) return i + 1;
    }
    return 0;
  }

  function levelIndexForTotalExp(totalExp) {
    let result = 1;
    for (let i = 0; i < levels.length; i++) {
      if (levels[i][1] <= totalExp) {
        result = i + 1;
      } else {
        break;
      }
    }
    return result;
  }

  function resolveExpRates(rawStageExp, usePotion) {
    if (usePotion) {
      return {
        boostedExp: rawStageExp,
        baseExp: rawStageExp / 1.5
      };
    }
    return {
      boostedExp: rawStageExp,
      baseExp: rawStageExp
    };
  }

  function totalExpFromStages(stageCount, baseExp, boostedExp, usePotion, potionCount) {
    if (stageCount <= 0) return 0;
    if (!usePotion || !Number.isFinite(potionCount) || potionCount <= 0) {
      return stageCount * baseExp;
    }
    const potionStages = Math.min(stageCount, potionCount);
    const normalStages = stageCount - potionStages;
    return potionStages * boostedExp + normalStages * baseExp;
  }

  function resetTeamCostResult() {
    resetMetrics(['teamCostLevelResult']);
  }

  function calculateTeamCost() {
    clearMessages(teamCostFields);
    const cost = readNumber('teamCostInput');
    if (!Number.isFinite(cost)) {
      setMetric('teamCostLevelResult', '—');
      return;
    }
    if (cost < 0) {
      setMessage('teamCostInput', '隊伍空間 Cost 不可小於 0。');
      setMetric('teamCostLevelResult', '—');
      return;
    }
    const foundLevel = findLevelForTeamCost(cost);
    if (foundLevel) {
      setMetric('teamCostLevelResult', formatInteger(foundLevel));
    } else {
      setMessage('teamCostInput', '目前等級對照表無法達到此隊伍空間。');
      setMetric('teamCostLevelResult', '—');
    }
  }

  function setTargetMode(mode) {
    targetMode = mode;
    $('targetModeLevelTab').classList.toggle('active', mode === 'level');
    $('targetModeStageTab').classList.toggle('active', mode === 'stage');
    $('targetModeLevelTab').setAttribute('aria-selected', String(mode === 'level'));
    $('targetModeStageTab').setAttribute('aria-selected', String(mode === 'stage'));
    $('targetLevelField').hidden = mode !== 'level';
    $('targetStageField').hidden = mode !== 'stage';
    $('stageCountRow').hidden = (mode === 'stage');

    if (mode === 'stage') {
      $('progressLabel').textContent = '目標等級進度條';
    } else {
      $('progressLabel').textContent = '升級進度';
    }
    
    clearMessages(['targetLevel', 'targetStageCount']);
  }

  function computeStageCount(remainingExp, baseExp, boostedExp, usePotion, potionCount) {
    if (remainingExp <= 0) return 0;
    if (!usePotion || !Number.isFinite(potionCount) || potionCount <= 0) {
      return Math.ceil(remainingExp / baseExp);
    }
    const potionTotalExp = potionCount * boostedExp;
    if (remainingExp <= potionTotalExp) {
      return Math.ceil(remainingExp / boostedExp);
    }
    const remainingAfterPotion = remainingExp - potionTotalExp;
    const stagesAfterPotion = Math.ceil(remainingAfterPotion / baseExp);
    return potionCount + stagesAfterPotion;
  }

  function computeStaminaRecoverCount(currentLevel, targetLevel, currentExp, baseExp, boostedExp, stageStamina, usePotion, potionCount) {
    if (targetLevel <= currentLevel) return 0;

    let carryOverStamina = 0;
    let totalRecoverCount = 0;
    let remainingPotions = usePotion && Number.isFinite(potionCount) && potionCount > 0 ? potionCount : 0;

    for (let lvl = currentLevel; lvl < targetLevel; lvl++) {
      const currentTable = levels[lvl - 1];
      if (!currentTable) break;
      const maxStamina = currentTable[2];
      const expNeededForLvl = (lvl === currentLevel)
        ? Math.max(0, currentTable[0] - currentExp)
        : currentTable[0];

      let lvlStaminaConsumed = 0;
      if (remainingPotions > 0) {
        const expFromPotionsCapacity = remainingPotions * boostedExp;
        if (expNeededForLvl <= expFromPotionsCapacity) {
          const stagesUsed = expNeededForLvl / boostedExp;
          lvlStaminaConsumed = stagesUsed * stageStamina;
          remainingPotions -= stagesUsed;
        } else {
          const potionStagesUsed = remainingPotions;
          const expLeft = expNeededForLvl - potionStagesUsed * boostedExp;
          const normalStagesUsed = expLeft / baseExp;
          lvlStaminaConsumed = (potionStagesUsed + normalStagesUsed) * stageStamina;
          remainingPotions = 0;
        }
      } else {
        lvlStaminaConsumed = (expNeededForLvl / baseExp) * stageStamina;
      }

      if (carryOverStamina >= lvlStaminaConsumed) {
        carryOverStamina -= lvlStaminaConsumed;
      } else {
        const deficit = lvlStaminaConsumed - carryOverStamina;
        const lvlRecoverCount = maxStamina > 0 ? Math.ceil(deficit / maxStamina) : 0;
        totalRecoverCount += lvlRecoverCount;
        carryOverStamina = (carryOverStamina + lvlRecoverCount * maxStamina) - lvlStaminaConsumed;
      }

      carryOverStamina += maxStamina;
    }

    return totalRecoverCount;
  }

  function calculateLevel() {
    clearMessages(levelFields);
    const currentLevel = readNumber('currentLevel');
    const currentExp = readNumber('currentExp');
    const stageExp = readNumber('stageExp');
    const stageStamina = readNumber('stageStamina');

    const usePotion = $('useExpPotion').checked;
    const noPotion = $('noExpPotion').checked;
    const potionCount = usePotion ? readNumber('expPotionCount') : NaN;

    if ([currentLevel, currentExp, stageExp, stageStamina].some(value => !Number.isFinite(value))) {
      resetLevelResults();
      return;
    }

    let hasError = false;
    if (!Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel > 2000) {
      setMessage('currentLevel', '請輸入 1 至 2000 的整數。');
      hasError = true;
    }
    if (currentExp < 0) {
      setMessage('currentExp', '目前等級已累積 EXP 不可小於 0。');
      hasError = true;
    }
    if (stageExp <= 0) {
      setMessage('stageExp', '每場經驗必須大於 0。');
      hasError = true;
    }
    if (stageStamina < 0) {
      setMessage('stageStamina', '每場體力不可小於 0。');
      hasError = true;
    }
    if (!usePotion && !noPotion) {
      setMessage('expPotionChoice', '請勾選「已使用經驗值瓶」或「未使用經驗瓶」，確認每場經驗是否已包含加成。');
      hasError = true;
    }
    if (usePotion) {
      if (!Number.isFinite(potionCount) || !Number.isInteger(potionCount) || potionCount <= 0) {
        setMessage('expPotionCount', '已勾選經驗值瓶，必須填寫經驗瓶數量（請輸入大於 0 的整數）。');
        hasError = true;
      }
    }

    const current = levels[currentLevel - 1];
    if (current && currentExp > current[0]) {
      setMessage('currentExp', '不可高於目前等級升到下級所需 EXP。');
      hasError = true;
    }

    if (hasError || !current) {
      resetLevelResults();
      return;
    }

    const { baseExp, boostedExp } = resolveExpRates(stageExp, usePotion);
    const currentTotalExp = current[1] + currentExp;
    let targetLevel = NaN;

    if (targetMode === 'stage') {
      const targetStageCount = readNumber('targetStageCount');
      if (!Number.isFinite(targetStageCount)) {
        resetLevelResults();
        return;
      }
      if (!Number.isInteger(targetStageCount) || targetStageCount < 0) {
        setMessage('targetStageCount', '請輸入 0 以上的整數。');
        resetLevelResults();
        return;
      }
      const gainedExp = totalExpFromStages(targetStageCount, baseExp, boostedExp, usePotion, potionCount);
      const finalTotalExp = currentTotalExp + gainedExp;
      targetLevel = Math.max(currentLevel, levelIndexForTotalExp(finalTotalExp));

      const target = levels[targetLevel - 1];
      if (!target) {
        resetLevelResults();
        return;
      }

      const expIntoTarget = Math.max(0, finalTotalExp - target[1]);
      const targetProgress = targetLevel === 2000 ? 100 : Math.min(100, (expIntoTarget / target[0]) * 100);
      
      const staminaRecoverCount = computeStaminaRecoverCount(
        currentLevel,
        targetLevel,
        currentExp,
        baseExp,
        boostedExp,
        stageStamina,
        usePotion,
        potionCount
      );

      $('stageCountRow').hidden = true;
      $('progressLabel').textContent = '目標等級進度條';
      setMetric('currentProgress', targetProgress.toFixed(2) + '%');
      setMetric('resolvedTargetLevel', formatInteger(targetLevel));
      setMetric('staminaRecoverCount', formatInteger(staminaRecoverCount));
      setMetric('targetStaminaMax', formatInteger(target[2]));
      setMetric('targetTeamCost', formatInteger(target[3]));
      return;
    }

    targetLevel = readNumber('targetLevel');
    if (!Number.isFinite(targetLevel)) {
      resetLevelResults();
      return;
    }
    if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 2000) {
      setMessage('targetLevel', '請輸入 1 至 2000 的整數。');
      resetLevelResults();
      return;
    }
    if (targetLevel < currentLevel) {
      $('targetLevel').classList.add('invalid');
      resetLevelResults();
      return;
    }

    const target = levels[targetLevel - 1];
    if (!target) {
      resetLevelResults();
      return;
    }

    const progress = currentLevel === 2000 ? 100 : Math.min(100, Math.max(0, (currentExp / current[0]) * 100));
    const remainingExp = Math.max(0, target[1] - current[1] - currentExp);
    const stageCount = computeStageCount(remainingExp, baseExp, boostedExp, usePotion, potionCount);
    const staminaRecoverCount = computeStaminaRecoverCount(
      currentLevel,
      targetLevel,
      currentExp,
      baseExp,
      boostedExp,
      stageStamina,
      usePotion,
      potionCount
    );

    $('stageCountRow').hidden = false;
    $('progressLabel').textContent = '升級進度';
    setMetric('currentProgress', progress.toFixed(2) + '%');
    setMetric('resolvedTargetLevel', formatInteger(targetLevel));
    setMetric('stageCount', formatInteger(stageCount));
    setMetric('staminaRecoverCount', formatInteger(staminaRecoverCount));
    setMetric('targetStaminaMax', formatInteger(target[2]));
    setMetric('targetTeamCost', formatInteger(target[3]));
  }

  function resetStaminaResult() {
    resetMetrics(['recoveryTime', 'staminaFullAt']);
  }

  function calculateStamina() {
    clearMessages(staminaFields);
    const currentStamina = readNumber('currentStamina');
    const currentStaminaMax = readNumber('currentStaminaMax');
    if (!Number.isFinite(currentStamina) || !Number.isFinite(currentStaminaMax)) {
      resetStaminaResult();
      return;
    }

    let hasError = false;
    if (currentStamina < 0) {
      setMessage('currentStamina', '目前剩餘體力不可小於 0。');
      hasError = true;
    }
    if (currentStaminaMax <= 0) {
      setMessage('currentStaminaMax', '目前最大體力必須大於 0。');
      hasError = true;
    }
    if (currentStamina > currentStaminaMax) {
      setMessage('currentStamina', '目前剩餘體力不可高於目前最大體力。');
      hasError = true;
    }
    if (hasError) {
      resetStaminaResult();
      return;
    }

    const missingStamina = Math.max(0, currentStaminaMax - currentStamina);
    const fullAt = new Date(Date.now() + missingStamina * RECOVERY_MINUTES_PER_STAMINA * 60 * 1000);
    $('recoveryTime').textContent = formatRecoveryTime(missingStamina);
    $('staminaFullAt').textContent = formatMonthDayTime(fullAt);
  }

  function resetWarResults() {
    resetMetrics(['warStageCount', 'warMeritPerBattle', 'warPointCost', 'warFreePoints', 'warStoneCount', 'warCountdownEnd']);
  }

  function clearFieldValues(fieldIds) {
    fieldIds.forEach(id => {
      const el = $(id);
      if (el) el.value = '';
    });
  }

  function resetLevelTool() {
    clearFieldValues(levelFields);
    clearMessages(levelFields);
    $('useExpPotion').checked = false;
    $('noExpPotion').checked = false;
    toggleExpPotionField();
    setTargetMode('level');
    resetLevelResults();
  }

  function toggleExpPotionField() {
    const usePotion = $('useExpPotion').checked;
    $('expPotionCountField').hidden = !usePotion;
    if (!usePotion) {
      setMessage('expPotionCount', '');
    } else {
      const val = readNumber('expPotionCount');
      if (!Number.isFinite(val) || !Number.isInteger(val) || val <= 0) {
        setMessage('expPotionCount', '已勾選經驗值瓶，必須填寫經驗瓶數量才會計算。');
      }
      $('expPotionCount').focus();
    }
  }

  function setExpPotionChoice(usePotion) {
    $('useExpPotion').checked = usePotion === true;
    $('noExpPotion').checked = usePotion === false;
    setMessage('expPotionChoice', '');
    toggleExpPotionField();
  }

  function resetTeamCostTool() {
    clearFieldValues(teamCostFields);
    clearMessages(teamCostFields);
    resetTeamCostResult();
  }

  function resetStaminaTool() {
    clearFieldValues(staminaFields);
    clearMessages(staminaFields);
    resetStaminaResult();
  }

  function resetWarTool() {
    setWarType('defense');
    clearFieldValues(['warBonus', 'warMerit', 'warCountdownHours']);
    clearMessages(warFields);
    resetWarResults();
  }

  function setWarType(type) {
    const isAttack = type === 'attack';
    $('warType').value = isAttack ? 'attack' : 'defense';
    $('warAttackTab').classList.toggle('active', isAttack);
    $('warDefenseTab').classList.toggle('active', !isAttack);
    $('warAttackTab').setAttribute('aria-selected', String(isAttack));
    $('warDefenseTab').setAttribute('aria-selected', String(!isAttack));
  }

  function calculateWar() {
    clearMessages(warFields);
    const warBonus = readNumber('warBonus');
    const warMerit = readNumber('warMerit');
    const warCountdownHours = readNumber('warCountdownHours');
    if ([warBonus, warMerit, warCountdownHours].some(value => !Number.isFinite(value))) {
      resetWarResults();
      return;
    }

    let hasError = false;
    if (warBonus < 0) {
      setMessage('warBonus', '加成不可小於 0。');
      hasError = true;
    }
    if (warMerit < 0) {
      setMessage('warMerit', '目標功勳值不可小於 0。');
      hasError = true;
    }
    if (warCountdownHours < 0) {
      setMessage('warCountdownHours', '倒數時間不可小於 0。');
      hasError = true;
    }
    if (hasError) {
      resetWarResults();
      return;
    }

    const config = $('warType').value === 'attack'
      ? { baseMerit: 100, pointCost: 4 }
      : { baseMerit: 62, pointCost: 2 };
    const meritPerBattle = config.baseMerit * (2 + warBonus / 100);
    const stageCount = warMerit === 0 ? 0 : Math.ceil(warMerit / meritPerBattle);
    const totalPoints = stageCount * config.pointCost;
    const now = new Date();
    const countdownEnd = new Date(now.getTime() + warCountdownHours * 60 * 60 * 1000);
    const dayCount = calendarDaysInclusive(now, countdownEnd);
    const freePoints = dayCount * FREE_WAR_POINTS;
    const netPoints = Math.max(0, totalPoints - freePoints);
    const stoneCount = Math.ceil(netPoints / WAR_STONE_POINTS);

    $('warStageCount').textContent = formatNumber(stageCount);
    $('warMeritPerBattle').textContent = formatNumber(meritPerBattle);
    $('warPointCost').textContent = formatNumber(totalPoints);
    $('warFreePoints').textContent = formatNumber(freePoints);
    $('warStoneCount').textContent = formatNumber(stoneCount);
    $('warCountdownEnd').textContent = formatDateTime(countdownEnd);
  }

  const tools = ['level', 'teamCost', 'stamina', 'war'];
  function switchTool(tool) {
    if (activeTool !== tool) {
      activeTool = tool;
      tools.forEach(t => {
        const on = t === tool;
        $(t + 'ToolPanel').hidden = !on;
        $(t + 'Tab').classList.toggle('active', on);
        $(t + 'Tab').setAttribute('aria-selected', on);
      });
    }
    calculateByTool[tool]();
  }

  tools.forEach(t => $(t + 'Tab').addEventListener('click', () => switchTool(t)));
  $('warAttackTab').addEventListener('click', () => {
    setWarType('attack');
    calculateWar();
  });
  $('warDefenseTab').addEventListener('click', () => {
    setWarType('defense');
    calculateWar();
  });

  const calculateByTool = { level: calculateLevel, teamCost: calculateTeamCost, stamina: calculateStamina, war: calculateWar };
  let activeTool = '';

  levelFields.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', calculateLevel);
  });
  $('useExpPotion').addEventListener('change', () => {
    if ($('useExpPotion').checked) setExpPotionChoice(true);
    else toggleExpPotionField();
    calculateLevel();
  });
  $('noExpPotion').addEventListener('change', () => {
    if ($('noExpPotion').checked) setExpPotionChoice(false);
    calculateLevel();
  });
  $('targetModeLevelTab').addEventListener('click', () => {
    setTargetMode('level');
    calculateLevel();
  });
  $('targetModeStageTab').addEventListener('click', () => {
    setTargetMode('stage');
    calculateLevel();
  });
  teamCostFields.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', calculateTeamCost);
  });
  staminaFields.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', calculateStamina);
  });
  warFields.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', calculateWar);
  });
  $('resetAll').addEventListener('click', () => [resetLevelTool, resetTeamCostTool, resetStaminaTool, resetWarTool].forEach(f => f()));

  switchTool('level');
  