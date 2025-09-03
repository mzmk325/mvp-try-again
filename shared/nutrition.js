(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SharedNutrition = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  function roundKcal(value) {
    var num = Number(value);
    if (!isFinite(num) || isNaN(num)) num = 0;
    return Math.max(0, Math.round(num));
  }

  function normalizeItem(item) {
    var p = +item.protein || 0;
    var c = +item.carbs || 0;
    var f = +item.fat || 0;
    var kcal = Number.isFinite(+item.kcal) ? Math.max(0, Math.round(+item.kcal)) : Math.round(p*4 + c*4 + f*9);
    return {
      name: String(item.name || '食物'),
      protein: +p.toFixed(1),
      carbs: +c.toFixed(1),
      fat: +f.toFixed(1),
      kcal: roundKcal(kcal)
    };
  }

  function calcTotals(items) {
    var t = (Array.isArray(items) ? items : []).reduce(function (acc, i) {
      var p = +i.protein || 0;
      var c = +i.carbs || 0;
      var f = +i.fat || 0;
      var k = Number.isFinite(+i.kcal) ? Math.max(0, Math.round(+i.kcal)) : Math.round(p*4 + c*4 + f*9);
      acc.kcal += k;
      acc.protein += p;
      acc.carbs += c;
      acc.fat += f;
      return acc;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    t.protein = +t.protein.toFixed(1);
    t.carbs = +t.carbs.toFixed(1);
    t.fat = +t.fat.toFixed(1);
    return t;
  }

  function getTargetCarbs(cal, pro, fat) {
    try {
      var carbs = Math.round(((+cal || 0) - (+pro || 0)*4 - (+fat || 0)*9) / 4);
      if (!isFinite(carbs) || carbs < 0) carbs = 0;
      return carbs;
    } catch (e) {
      return 0;
    }
  }

  // 供后端/前端拼接到AI系统提示的营养学提示（轻量规则）
  // 说明：蛋白粉按 1.2g 粉 ≈ 1g 蛋白质 估算（即蛋白≈粉重/1.2），碳水/脂肪忽略或按极低值
  var AI_HINTS = {
    proteinPowderRule: (
      '当文本或图片涉及到蛋白粉/乳清蛋白（protein powder,whey）且给出克数或勺数时，' +
      '请按“约 1.2g 蛋白粉 ≈ 1g 蛋白质”的规则估算蛋白质含量（例如 30g 蛋白粉≈25g 蛋白质），' +
      '碳水与脂肪通常很低，可忽略不计或给出极小值；请据此计算kcal（kcal≈4*蛋白+4*碳水+9*脂肪）。'
    )
  };

  return {
    roundKcal: roundKcal,
    normalizeItem: normalizeItem,
    calcTotals: calcTotals,
    getTargetCarbs: getTargetCarbs,
    AI_HINTS: AI_HINTS
  };
}));


