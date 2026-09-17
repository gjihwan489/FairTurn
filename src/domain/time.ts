export function toLocalDateTimeInputValue(date: Date) {
  if (Number.isNaN(date.getTime())) {
    throw new Error("유효하지 않은 날짜입니다.");
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function parseLocalDateTimeInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("날짜와 시간을 YYYY-MM-DDTHH:mm 형식으로 입력하세요.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("유효하지 않은 날짜입니다.");
  }
  return date;
}

export function localDateTimeInputToIso(value: string) {
  return parseLocalDateTimeInput(value).toISOString();
}

export function validateMeetingTimes(startsAt: string, expectedEndsAt?: string | null, votingDeadline?: string | null) {
  const start = parseLocalDateTimeInput(startsAt);
  if (expectedEndsAt) {
    const end = parseLocalDateTimeInput(expectedEndsAt);
    if (end <= start) {
      throw new Error("예상 종료 시각은 시작 시각보다 늦어야 합니다.");
    }
  }
  if (votingDeadline) {
    parseLocalDateTimeInput(votingDeadline);
  }
}
