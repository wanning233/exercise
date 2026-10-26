import type { Meal } from "./model";

export type Macros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};
export type NutritionTargets = Partial<Macros>;
export type FoodPortion = { foodId: string; quantity: number };
export type MealNutrition = {
  source: "canteen" | "home" | "delivery";
  items: FoodPortion[];
  oil: "none" | "little" | "normal" | "much" | "unknown";
  consumed: number;
  complete: boolean;
};
type Food = {
  id: string;
  name: string;
  unit: string;
  grams: number;
  macros: Macros;
  uncertainty: number;
};
// Generic edible portions, not a branded-food database. Cooked dishes need added oil.
export const foods: Food[] = [
  {
    id: "rice",
    name: "熟米饭",
    unit: "平碗（约 150g）",
    grams: 150,
    macros: { kcal: 116, protein: 2.6, carbs: 25.9, fat: 0.3 },
    uncertainty: 0.25,
  },
  {
    id: "noodles",
    name: "熟面条（无汤）",
    unit: "碗（约 200g）",
    grams: 200,
    macros: { kcal: 138, protein: 4.5, carbs: 28, fat: 0.7 },
    uncertainty: 0.3,
  },
  {
    id: "bun",
    name: "馒头",
    unit: "个（约 100g）",
    grams: 100,
    macros: { kcal: 223, protein: 7, carbs: 47, fat: 1.1 },
    uncertainty: 0.25,
  },
  {
    id: "sweet-potato",
    name: "熟红薯",
    unit: "拳头大小（约 150g）",
    grams: 150,
    macros: { kcal: 90, protein: 2, carbs: 20.7, fat: 0.2 },
    uncertainty: 0.3,
  },
  {
    id: "bread",
    name: "全麦面包",
    unit: "片（约 30g）",
    grams: 30,
    macros: { kcal: 250, protein: 10, carbs: 43, fat: 4 },
    uncertainty: 0.2,
  },
  {
    id: "oats",
    name: "干燕麦片",
    unit: "平汤匙（约 10g）",
    grams: 10,
    macros: { kcal: 379, protein: 13.2, carbs: 67.7, fat: 6.5 },
    uncertainty: 0.25,
  },
  {
    id: "egg",
    name: "鸡蛋（不含煎油）",
    unit: "个（可食部分约 50g）",
    grams: 50,
    macros: { kcal: 144, protein: 13, carbs: 1, fat: 9.5 },
    uncertainty: 0.15,
  },
  {
    id: "chicken",
    name: "熟去皮鸡胸肉",
    unit: "掌心（约 100g）",
    grams: 100,
    macros: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
    uncertainty: 0.3,
  },
  {
    id: "beef",
    name: "熟瘦牛肉",
    unit: "掌心（约 100g）",
    grams: 100,
    macros: { kcal: 210, protein: 29, carbs: 0, fat: 10 },
    uncertainty: 0.3,
  },
  {
    id: "pork",
    name: "熟瘦猪肉",
    unit: "掌心（约 100g）",
    grams: 100,
    macros: { kcal: 220, protein: 29, carbs: 0, fat: 11 },
    uncertainty: 0.3,
  },
  {
    id: "fish",
    name: "熟白肉鱼（去骨）",
    unit: "掌心（约 100g）",
    grams: 100,
    macros: { kcal: 128, protein: 26, carbs: 0, fat: 2.7 },
    uncertainty: 0.3,
  },
  {
    id: "shrimp",
    name: "熟虾仁",
    unit: "掌心（约 80g）",
    grams: 80,
    macros: { kcal: 99, protein: 24, carbs: 0.2, fat: 0.3 },
    uncertainty: 0.3,
  },
  {
    id: "tofu",
    name: "北豆腐（未煎炸）",
    unit: "半盒（约 200g）",
    grams: 200,
    macros: { kcal: 98, protein: 12.2, carbs: 1.5, fat: 4.8 },
    uncertainty: 0.25,
  },
  {
    id: "milk",
    name: "纯牛奶",
    unit: "盒（250ml）",
    grams: 250,
    macros: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
    uncertainty: 0.1,
  },
  {
    id: "soy-milk",
    name: "无糖豆浆",
    unit: "杯（250ml）",
    grams: 250,
    macros: { kcal: 33, protein: 3, carbs: 1.2, fat: 1.6 },
    uncertainty: 0.25,
  },
  {
    id: "yogurt",
    name: "原味无糖酸奶",
    unit: "杯（约 150g）",
    grams: 150,
    macros: { kcal: 63, protein: 3.5, carbs: 5, fat: 3 },
    uncertainty: 0.2,
  },
  {
    id: "vegetables",
    name: "熟非淀粉蔬菜（无油）",
    unit: "拳头（约 100g）",
    grams: 100,
    macros: { kcal: 30, protein: 2, carbs: 5, fat: 0.3 },
    uncertainty: 0.3,
  },
  {
    id: "apple",
    name: "苹果",
    unit: "个（可食部分约 180g）",
    grams: 180,
    macros: { kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
    uncertainty: 0.25,
  },
  {
    id: "banana",
    name: "香蕉",
    unit: "根（去皮约 100g）",
    grams: 100,
    macros: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
    uncertainty: 0.25,
  },
  {
    id: "nuts",
    name: "原味混合坚果",
    unit: "小把（约 15g）",
    grams: 15,
    macros: { kcal: 600, protein: 20, carbs: 20, fat: 54 },
    uncertainty: 0.3,
  },
];
export const nutrientLabels: Record<keyof Macros, string> = {
  kcal: "热量",
  protein: "蛋白质",
  carbs: "碳水",
  fat: "脂肪",
};
export const macroKeys = Object.keys(nutrientLabels) as (keyof Macros)[];
const zero = (): Macros => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
export const oilLabels = {
  none: "无额外用油",
  little: "约 1 茶匙（5g）",
  normal: "约 2 茶匙（10g）",
  much: "约 1 汤匙（15g）",
  unknown: "不确定（按 5-20g）",
};
export const sourceLabels = {
  canteen: "食堂 / 堂食",
  home: "自己做",
  delivery: "外卖",
};
const oilAmounts = {
  none: [0, 0],
  little: [4, 6],
  normal: [8, 12],
  much: [12, 18],
  unknown: [5, 20],
};
export function estimateNutrition(value: MealNutrition) {
  const low = zero(),
    high = zero();
  for (const item of value.items) {
    const food = foods.find((f) => f.id === item.foodId);
    if (!food) continue;
    for (const key of macroKeys) {
      const amount =
        ((food.macros[key] * food.grams) / 100) *
        item.quantity *
        value.consumed;
      low[key] += amount * (1 - food.uncertainty);
      high[key] += amount * (1 + food.uncertainty);
    }
  }
  const oil = oilAmounts[value.oil];
  low.fat += oil[0] * value.consumed;
  high.fat += oil[1] * value.consumed;
  low.kcal += oil[0] * 9 * value.consumed;
  high.kcal += oil[1] * 9 * value.consumed;
  return { low, high };
}
export function dayNutrition(meals: Meal[]) {
  const low = zero(),
    high = zero();
  const estimated = meals.filter((m) => m.nutrition?.items.length);
  for (const meal of estimated) {
    const range = estimateNutrition(meal.nutrition!);
    for (const key of macroKeys) {
      low[key] += range.low[key];
      high[key] += range.high[key];
    }
  }
  const complete =
    ["breakfast", "lunch", "dinner"].every((type) =>
      estimated.some((m) => m.type === type),
    ) &&
    estimated.length === meals.length &&
    estimated.every((m) => m.nutrition!.complete);
  return {
    low,
    high,
    complete,
    count: estimated.length,
    missing: meals.length - estimated.length,
  };
}
export const rangeText = (low: number, high: number) =>
  `${Math.max(0, Math.floor(low))}-${Math.ceil(high)}`;
export function targetDifference(low: number, high: number, target: number) {
  if (high < target)
    return `距目标约 ${rangeText(target - high, target - low)}`;
  if (low > target)
    return `高于目标约 ${rangeText(low - target, high - target)}`;
  return "目标在估算范围内";
}
export function proteinSuggestions(
  lowProtein: number,
  highProtein: number,
  targets: NutritionTargets,
  highKcal: number,
) {
  if (!targets.protein || highProtein >= targets.protein) return [];
  const gap = targets.protein - (lowProtein + highProtein) / 2;
  const options = [
    { label: "1 盒纯牛奶 + 2 个鸡蛋", protein: 21, kcal: 297 },
    { label: "1 掌心熟去皮鸡胸肉", protein: 31, kcal: 165 },
    { label: "半盒北豆腐（约 200g）", protein: 24, kcal: 196 },
    { label: "1 盒纯牛奶", protein: 8, kcal: 153 },
  ];
  return options
    .filter(
      (o) =>
        o.protein <= gap * 1.4 &&
        (!targets.kcal || o.kcal <= targets.kcal - highKcal),
    )
    .sort((a, b) => Math.abs(a.protein - gap) - Math.abs(b.protein - gap))
    .slice(0, 2);
}
export const targetLimits: Record<keyof Macros, [number, number]> = {
  kcal: [500, 10000],
  protein: [10, 500],
  carbs: [10, 1500],
  fat: [10, 500],
};
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export function validTargets(value: unknown): value is NutritionTargets {
  return (
    object(value) &&
    Object.keys(value).every(
      (k) =>
        macroKeys.includes(k as keyof Macros) &&
        typeof value[k] === "number" &&
        Number.isFinite(value[k]) &&
        Number(value[k]) >= targetLimits[k as keyof Macros][0] &&
        Number(value[k]) <= targetLimits[k as keyof Macros][1],
    )
  );
}
export function validNutrition(value: unknown): value is MealNutrition {
  if (
    !object(value) ||
    typeof value.complete !== "boolean" ||
    !Object.keys(sourceLabels).includes(String(value.source)) ||
    !Object.keys(oilLabels).includes(String(value.oil)) ||
    typeof value.consumed !== "number" ||
    !Number.isFinite(value.consumed) ||
    value.consumed <= 0 ||
    value.consumed > 1 ||
    !Array.isArray(value.items) ||
    !value.items.length ||
    value.items.length > 40
  )
    return false;
  return value.items.every(
    (i) =>
      object(i) &&
      foods.some((f) => f.id === i.foodId) &&
      typeof i.quantity === "number" &&
      Number.isFinite(i.quantity) &&
      i.quantity >= 0.25 &&
      i.quantity <= 20,
  );
}
