(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SharedDate = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  function twoDigits(n) { return n < 10 ? '0' + n : '' + n; }
  function formatYMD(d) { return d.getFullYear() + '-' + twoDigits(d.getMonth()+1) + '-' + twoDigits(d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeek(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth()+1, 0); }

  return {
    twoDigits: twoDigits,
    formatYMD: formatYMD,
    addDays: addDays,
    startOfWeek: startOfWeek,
    startOfMonth: startOfMonth,
    endOfMonth: endOfMonth
  };
}));


