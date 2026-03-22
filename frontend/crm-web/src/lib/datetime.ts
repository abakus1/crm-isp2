export function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatLocalDateTime(date: Date) {
  return `${formatLocalDate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function parseLocalDateTime(value: string) {
  const [datePart, timePart = "00:00:00"] = value.trim().split("T");
  const [year, month, day] = datePart.split("-").map((part) => Number(part));
  const [hours = 0, minutes = 0, seconds = 0] = timePart.split(":").map((part) => Number(part));

  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, seconds || 0, 0);
}
