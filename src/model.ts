export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Meal = {
  id: string;
  type: MealType;
  text: string;
  time: string;
  photo?: string;
};
export type Water = { id: string; amount: number; time: string };
export type TrainingSet = {
  id: string;
  weight: string;
  reps: string;
  done: boolean;
};
export type Exercise = {
  id: string;
  name: string;
  part: string;
  kind: "strength" | "cardio";
  sets: TrainingSet[];
  minutes: string;
  distance: string;
};
export type Note = {
  id: string;
  title: string;
  text: string;
  action: string;
  date: string;
  pinned: boolean;
};
export type Day = {
  meals: Meal[];
  water: Water[];
  exercises: Exercise[];
  rest: boolean;
  completed: boolean;
  feeling: string;
};
export type Journal = {
  version: 1;
  days: Record<string, Day>;
  notes: Note[];
  settings: { waterGoal: number; name: string };
};

export const newJournal = (): Journal => ({
  version: 1,
  days: {},
  notes: [],
  settings: { waterGoal: 2000, name: "我" },
});
export const newDay = (): Day => ({
  meals: [],
  water: [],
  exercises: [],
  rest: false,
  completed: false,
  feeling: "",
});
export const uid = () =>
  crypto.randomUUID?.() ||
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const parseDate = (date: string) => new Date(`${date}T12:00:00`);
export const offsetDate = (date: string, days: number) => {
  const result = parseDate(date);
  result.setDate(result.getDate() + days);
  return localDate(result);
};
export const nowTime = () => new Date().toTimeString().slice(0, 5);
export const hasRecords = (day?: Day) =>
  !!day &&
  !!(
    day.meals.length ||
    day.water.length ||
    day.exercises.length ||
    day.rest ||
    day.feeling
  );
export const mealLabels: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};
export const parts = [
  "胸部",
  "背部",
  "肩部",
  "手臂",
  "腿部",
  "臀部",
  "核心",
  "全身",
];
export const exerciseLibrary = [
  { name: "杠铃卧推", part: "胸部", kind: "strength" },
  { name: "哑铃卧推", part: "胸部", kind: "strength" },
  { name: "俯卧撑", part: "胸部", kind: "strength" },
  { name: "高位下拉", part: "背部", kind: "strength" },
  { name: "坐姿划船", part: "背部", kind: "strength" },
  { name: "引体向上", part: "背部", kind: "strength" },
  { name: "哑铃推肩", part: "肩部", kind: "strength" },
  { name: "哑铃侧平举", part: "肩部", kind: "strength" },
  { name: "哑铃弯举", part: "手臂", kind: "strength" },
  { name: "绳索下压", part: "手臂", kind: "strength" },
  { name: "杠铃深蹲", part: "腿部", kind: "strength" },
  { name: "腿举", part: "腿部", kind: "strength" },
  { name: "罗马尼亚硬拉", part: "臀部", kind: "strength" },
  { name: "臀推", part: "臀部", kind: "strength" },
  { name: "卷腹", part: "核心", kind: "strength" },
  { name: "跑步", part: "全身", kind: "cardio" },
  { name: "骑行", part: "全身", kind: "cardio" },
  { name: "椭圆机", part: "全身", kind: "cardio" },
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const string = (value: unknown, max = 10000): value is string =>
  typeof value === "string" && value.length <= max;
const number = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const date = (value: unknown): value is string =>
  string(value, 10) &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  localDate(parseDate(value)) === value;
const time = (value: unknown) =>
  string(value, 5) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

// Backups are untrusted input; validate nested entries before replacing local data.
export function validateJournal(value: unknown): value is Journal {
  if (
    !record(value) ||
    value.version !== 1 ||
    !record(value.days) ||
    !Array.isArray(value.notes) ||
    !record(value.settings)
  )
    return false;
  if (
    !number(value.settings.waterGoal, 100, 10000) ||
    !string(value.settings.name, 40)
  )
    return false;
  if (Object.keys(value.days).length > 40000 || value.notes.length > 50000)
    return false;
  const ids = new Set<string>();
  const id = (v: unknown) => {
    if (!string(v, 100) || !v || ids.has(v)) return false;
    ids.add(v);
    return true;
  };
  for (const [key, d] of Object.entries(value.days)) {
    if (
      !date(key) ||
      !record(d) ||
      !Array.isArray(d.meals) ||
      !Array.isArray(d.water) ||
      !Array.isArray(d.exercises) ||
      typeof d.rest !== "boolean" ||
      typeof d.completed !== "boolean" ||
      !string(d.feeling, 2000)
    )
      return false;
    if (
      d.meals.length > 100 ||
      d.water.length > 200 ||
      d.exercises.length > 100 ||
      (d.rest && d.exercises.length)
    )
      return false;
    for (const m of d.meals) {
      if (
        !record(m) ||
        !id(m.id) ||
        !["breakfast", "lunch", "dinner", "snack"].includes(String(m.type)) ||
        !string(m.text, 2000) ||
        !time(m.time)
      )
        return false;
      if (
        m.photo !== undefined &&
        (!string(m.photo, 4000000) ||
          !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(m.photo))
      )
        return false;
    }
    for (const w of d.water)
      if (
        !record(w) ||
        !id(w.id) ||
        !number(w.amount, 1, 5000) ||
        !time(w.time)
      )
        return false;
    for (const e of d.exercises) {
      if (
        !record(e) ||
        !id(e.id) ||
        !string(e.name, 80) ||
        !e.name.trim() ||
        !string(e.part, 20) ||
        !["strength", "cardio"].includes(String(e.kind)) ||
        !string(e.minutes, 10) ||
        !string(e.distance, 10) ||
        !Array.isArray(e.sets) ||
        e.sets.length > 100
      )
        return false;
      if (
        [e.minutes, e.distance].some(
          (v) =>
            v !== "" &&
            (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 10000),
        )
      )
        return false;
      for (const s of e.sets) {
        if (
          !record(s) ||
          !id(s.id) ||
          !string(s.weight, 10) ||
          !string(s.reps, 10) ||
          typeof s.done !== "boolean"
        )
          return false;
        if (
          [s.weight, s.reps].some(
            (v) =>
              v !== "" &&
              (!Number.isFinite(Number(v)) ||
                Number(v) < 0 ||
                Number(v) > 10000),
          )
        )
          return false;
        if (s.reps !== "" && !Number.isInteger(Number(s.reps))) return false;
        if (s.done && (!s.reps || Number(s.reps) <= 0)) return false;
      }
    }
  }
  for (const n of value.notes)
    if (
      !record(n) ||
      !id(n.id) ||
      !string(n.title, 100) ||
      !string(n.text, 4000) ||
      !string(n.action, 80) ||
      !date(n.date) ||
      typeof n.pinned !== "boolean"
    )
      return false;
  return true;
}
