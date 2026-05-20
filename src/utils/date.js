const dayjs = require("dayjs");

function getWeekBounds(date = new Date()) {
  const current = dayjs(date);
  const day = current.day();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = current.add(diffToMonday, "day").startOf("day");
  const end = start.add(6, "day").endOf("day");
  return {
    weekStart: start.toDate(),
    weekEnd: end.toDate(),
    weekKey: start.format("YYYY-MM-DD")
  };
}

module.exports = { getWeekBounds };
