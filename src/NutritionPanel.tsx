import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Trash2,
  Utensils,
  SlidersHorizontal,
} from "lucide-react";
import type { Meal } from "./model";
import { parseDate } from "./model";
import {
  type MealNutrition,
  type NutritionTargets,
  type Macros,
  foods,
  macroKeys,
  nutrientLabels,
  sourceLabels,
  oilLabels,
  estimateNutrition,
  dayNutrition,
  rangeText,
  targetDifference,
  proteinSuggestions,
  targetLimits,
} from "./nutrition";
import "./nutrition.css";

export const blankNutrition = (date: string): MealNutrition => ({
  source: [0, 6].includes(parseDate(date).getDay()) ? "home" : "canteen",
  items: [],
  oil: "unknown",
  consumed: 1,
  complete: false,
});
function QuantityInput({
  amount,
  label,
  change,
}: {
  amount: number;
  label: string;
  change: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(amount));
  useEffect(() => setDraft(String(amount)), [amount]);
  return (
    <input
      aria-label={label}
      type="number"
      min="0.25"
      max="20"
      step="0.25"
      required
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = e.target.valueAsNumber;
        if (
          Number.isFinite(n) &&
          n >= 0.25 &&
          n <= 20 &&
          Number.isInteger(n * 4)
        )
          change(n);
      }}
      onBlur={() => {
        const n = Number(draft);
        if (
          !Number.isFinite(n) ||
          n < 0.25 ||
          n > 20 ||
          !Number.isInteger(n * 4)
        )
          setDraft(String(amount));
      }}
    />
  );
}
export function PortionEditor({
  value,
  change,
}: {
  value: MealNutrition;
  change: (v: MealNutrition) => void;
}) {
  const [open, setOpen] = useState(value.items.length > 0);
  const [foodId, setFoodId] = useState(foods[0].id);
  const [query, setQuery] = useState("");
  const range = estimateNutrition(value);
  function quantity(index: number, amount: number) {
    change({
      ...value,
      items: value.items.map((item, i) =>
        i === index ? { ...item, quantity: amount } : item,
      ),
    });
  }
  return (
    <section className="portion-editor" aria-label="免称重营养估算">
      <button
        type="button"
        className="nutrition-disclosure"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Utensils size={17} />
        <span>
          食物与份量{" "}
          <small>
            {value.items.length
              ? `${value.items.length} 项 · 约 ${rangeText(range.low.kcal, range.high.kcal)} kcal`
              : "选填"}
          </small>
        </span>
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>
      {open && (
        <div className="portion-body">
          <label className="form-field">
            用餐来源
            <select
              value={value.source}
              onChange={(e) =>
                change({
                  ...value,
                  source: e.target.value as MealNutrition["source"],
                })
              }
            >
              {Object.entries(sourceLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            查找食物
            <input
              type="search"
              value={query}
              maxLength={80}
              onChange={(e) => {
                setQuery(e.target.value);
                const first = foods.find((f) =>
                  f.name.includes(e.target.value.trim()),
                );
                if (first) setFoodId(first.id);
              }}
              placeholder="米饭、鸡蛋、牛奶…"
            />
          </label>
          <div className="food-picker">
            <label className="form-field">
              食物
              <select
                aria-label="选择食物"
                value={foodId}
                onChange={(e) => setFoodId(e.target.value)}
              >
                {foods
                  .filter((f) => f.name.includes(query.trim()))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="icon-button"
              title="添加食物"
              aria-label="添加食物"
              disabled={
                value.items.length >= 40 ||
                !foods.some(
                  (f) => f.id === foodId && f.name.includes(query.trim()),
                )
              }
              onClick={() =>
                change({
                  ...value,
                  items: [...value.items, { foodId, quantity: 1 }],
                  complete: false,
                })
              }
            >
              <Plus size={19} />
            </button>
          </div>
          {!foods.some((f) => f.name.includes(query.trim())) && (
            <p className="nutrition-note">
              暂无匹配食物。清单外的食物不会计入营养估算。
            </p>
          )}
          <div className="portion-list">
            {value.items.map((item, index) => {
              const food = foods.find((f) => f.id === item.foodId)!;
              return (
                <div className="portion-row" key={`${index}-${item.foodId}`}>
                  <div className="portion-name">
                    <strong>{food.name}</strong>
                    <small>{food.unit}</small>
                  </div>
                  <div className="portion-stepper">
                    <button
                      type="button"
                      className="icon-button"
                      title={`减少${food.name}份量 ${index + 1}`}
                      aria-label={`减少${food.name}份量 ${index + 1}`}
                      disabled={item.quantity <= 0.25}
                      onClick={() =>
                        quantity(index, Math.max(0.25, item.quantity - 0.25))
                      }
                    >
                      <Minus size={14} />
                    </button>
                    <QuantityInput
                      amount={item.quantity}
                      label={`${food.name}份量 ${index + 1}`}
                      change={(n) => quantity(index, n)}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      title={`增加${food.name}份量 ${index + 1}`}
                      aria-label={`增加${food.name}份量 ${index + 1}`}
                      disabled={item.quantity >= 20}
                      onClick={() =>
                        quantity(index, Math.min(20, item.quantity + 0.25))
                      }
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    title={`移除${food.name} ${index + 1}`}
                    aria-label={`移除${food.name} ${index + 1}`}
                    onClick={() =>
                      change({
                        ...value,
                        items: value.items.filter((_, i) => i !== index),
                        complete: false,
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
          {!!value.items.length && (
            <>
              <label className="form-field">
                这份餐的额外用油（仅你分到的份量）
                <select
                  value={value.oil}
                  onChange={(e) =>
                    change({
                      ...value,
                      oil: e.target.value as MealNutrition["oil"],
                    })
                  }
                >
                  {Object.entries(oilLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                实际吃了多少
                <select
                  value={value.consumed}
                  onChange={(e) =>
                    change({ ...value, consumed: Number(e.target.value) })
                  }
                >
                  <option value="1">全部</option>
                  <option value="0.75">约四分之三</option>
                  <option value="0.5">约一半</option>
                  <option value="0.25">约四分之一</option>
                </select>
              </label>
              <p className="nutrition-note">
                混合菜按你吃到的食材拆分；肉类按去骨熟重、掌心不含手指。用油另计，糖、酱汁和烹饪方式会带来额外误差。
              </p>
              <div className="meal-nutrition-result" aria-label="本餐营养估算">
                {macroKeys.map((key) => (
                  <div key={key}>
                    <span>{nutrientLabels[key]}</span>
                    <strong>
                      {rangeText(range.low[key], range.high[key])}
                      <small>{key === "kcal" ? "kcal" : "g"}</small>
                    </strong>
                  </div>
                ))}
              </div>
              <label className="nutrition-check">
                <input
                  type="checkbox"
                  checked={value.complete}
                  onChange={(e) =>
                    change({ ...value, complete: e.target.checked })
                  }
                />
                本餐食物已记全
              </label>
            </>
          )}
          <p className="nutrition-note">
            手动份量估算，不是照片识别或检测结果。包装标注优先；范围为粗略份量误差，不是统计置信区间。
          </p>
        </div>
      )}
    </section>
  );
}

export function NutritionSummary({
  meals,
  targets = {},
  configure,
}: {
  meals: Meal[];
  targets?: NutritionTargets;
  configure: () => void;
}) {
  const total = dayNutrition(meals);
  const suggestions = total.complete
    ? proteinSuggestions(
        total.low.protein,
        total.high.protein,
        targets,
        total.high.kcal,
      )
    : [];
  return (
    <section className="nutrition-summary" aria-label="每日营养">
      <div className="nutrition-heading">
        <h3>
          <Utensils size={17} />
          已记录营养
        </h3>
        <button className="text-button" onClick={configure}>
          <SlidersHorizontal size={15} />
          营养目标
        </button>
      </div>
      {!total.count ? (
        <p className="nutrition-note">暂无份量记录，照片和文字餐食尚未计入。</p>
      ) : (
        <>
          <div className="nutrition-totals">
            {macroKeys.map((key) => (
              <div key={key} className={`nutrient-${key}`}>
                <span>{nutrientLabels[key]}</span>
                <strong>
                  {rangeText(total.low[key], total.high[key])}
                  <small>{key === "kcal" ? "kcal" : "g"}</small>
                </strong>
                {targets[key] ? (
                  <small>
                    {total.complete
                      ? `${targetDifference(total.low[key], total.high[key], targets[key]!)}${total.low[key] <= targets[key]! && total.high[key] >= targets[key]! ? "" : key === "kcal" ? " kcal" : " g"}`
                      : `每日目标 ${targets[key]} ${key === "kcal" ? "kcal" : "g"}`}
                  </small>
                ) : (
                  <small>未设目标</small>
                )}
              </div>
            ))}
          </div>
          <p className="nutrition-note">
            {total.complete
              ? "三餐已确认记全；仅对照所填目标，不代表医学上的营养缺乏。"
              : `已估算 ${total.count} 餐${total.missing ? `，另有 ${total.missing} 条餐食未计入` : ""}。三餐未记全或尚未确认，只展示已记录摄入。`}
          </p>
          {!!suggestions.length && (
            <div className="nutrition-advice">
              <strong>可选补充（任选，不是都吃）</strong>
              {suggestions.map((s) => (
                <p key={s.label}>
                  {s.label}：约 {s.protein}g 蛋白质 / {s.kcal} kcal
                </p>
              ))}
              <small>常见食物参考值；有过敏、忌口或医嘱时不适用。</small>
            </div>
          )}
          {total.complete &&
          targets.protein &&
          total.high.protein < targets.protein &&
          !suggestions.length ? (
            <p className="nutrition-note">
              蛋白质估算低于所填目标。
              {targets.kcal && targets.kcal <= total.high.kcal
                ? "热量也已接近或达到目标，可在下一餐替换搭配，不必硬加餐。"
                : "可在下一餐增加适合自己的蛋白质食物，不必一次补齐。"}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

export function NutritionTargetFields({
  value,
  change,
}: {
  value: Partial<Record<keyof Macros, string>>;
  change: (key: keyof Macros, value: string) => void;
}) {
  return (
    <fieldset className="nutrition-target-fields">
      <legend>每日营养目标（选填）</legend>
      <div className="nutrition-target-grid">
        {macroKeys.map((key) => (
          <label className="form-field" key={key}>
            {nutrientLabels[key]}目标（{key === "kcal" ? "kcal" : "g"}）
            <input
              type="number"
              min={targetLimits[key][0]}
              max={targetLimits[key][1]}
              step="1"
              value={value[key] || ""}
              onChange={(e) => change(key, e.target.value)}
              placeholder="未设置"
            />
          </label>
        ))}
      </div>
      <p className="nutrition-note">
        填写你已确定的个人目标，不会自动推算。未成年人、孕哺期或有疾病、特殊饮食需求者，应由专业人员指导。
      </p>
    </fieldset>
  );
}
