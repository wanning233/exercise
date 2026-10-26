import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Coffee,
  Droplet,
  Dumbbell,
  Edit3,
  Flame,
  GlassWater,
  Leaf,
  Loader2,
  Minus,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Undo2,
  Utensils,
  X,
} from "lucide-react";
import {
  Day,
  Exercise,
  Journal,
  Meal,
  MealType,
  Note,
  TrainingSet,
  exerciseLibrary,
  hasRecords,
  localDate,
  mealLabels,
  newDay,
  newJournal,
  nowTime,
  offsetDate,
  parseDate,
  parts,
  uid,
  validateJournal,
} from "./model";
import {
  compressPhoto,
  exportFile,
  loadJournal,
  loadRawJournal,
  saveJournal,
} from "./storage";
import "./styles.css";

type Tab = "today" | "history" | "library";
type Dialog =
  | { kind: "meal"; type: MealType; meal?: Meal }
  | { kind: "exercise" }
  | { kind: "note"; note?: Note; action?: string }
  | { kind: "settings" }
  | { kind: "water" }
  | { kind: "waterLog" }
  | { kind: "confirm"; title: string; text: string; action: () => void };
const TODAY = localDate();
const mealIcons = { breakfast: Coffee, lunch: Sun, dinner: Moon, snack: Leaf };
const fmtDate = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" },
) => parseDate(date).toLocaleDateString("zh-CN", options);
const totalWater = (day: Day) =>
  day.water.reduce((sum, item) => sum + item.amount, 0);
const totalSets = (day: Day) =>
  day.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.done).length,
    0,
  );
const weightText = (weight: string) => (weight ? `${weight} kg` : "自重");

function demoJournal(): Journal {
  const data = newJournal();
  const exercise = (
    name: string,
    part: string,
    weight: string,
    reps: string,
    done: number,
  ): Exercise => ({
    id: uid(),
    name,
    part,
    kind: "strength",
    minutes: "",
    distance: "",
    sets: Array.from({ length: 3 }, (_, i) => ({
      id: uid(),
      weight,
      reps,
      done: i < done,
    })),
  });
  data.days[TODAY] = {
    meals: [
      {
        id: uid(),
        type: "breakfast",
        text: "牛油果鸡蛋吐司 · 拿铁",
        time: "08:20",
        photo: "./images/breakfast.jpg",
      },
      {
        id: uid(),
        type: "lunch",
        text: "鸡胸肉沙拉 · 杂粮饭",
        time: "12:15",
        photo: "./images/lunch.jpg",
      },
    ],
    water: [250, 300, 300, 350].map((amount, i) => ({
      id: uid(),
      amount,
      time: ["08:00", "10:30", "12:00", "14:20"][i],
    })),
    exercises: [
      exercise("杠铃卧推", "胸部", "30", "12", 3),
      exercise("哑铃侧平举", "肩部", "5", "15", 1),
    ],
    rest: false,
    completed: false,
    feeling: "今天状态不错，卧推比上次更稳定了。",
  };
  for (const days of [1, 2, 4, 5])
    data.days[offsetDate(TODAY, -days)] = {
      ...newDay(),
      water: [{ id: uid(), amount: 1800, time: "20:00" }],
      rest: days === 1,
      exercises:
        days !== 1 ? [exercise("杠铃卧推", "胸部", "25", "12", 3)] : [],
      completed: true,
    };
  data.notes = [
    {
      id: uid(),
      title: "卧推时，先把肩胛收好",
      text: "肩胛后缩下沉，脚踩稳。下放时保持手腕和前臂稳定，不要耸肩。宁可轻一点，也把每一次动作做好。",
      action: "杠铃卧推",
      date: TODAY,
      pinned: true,
    },
    {
      id: uid(),
      title: "侧平举别急着加重量",
      text: "肘部微屈，手肘带动向外抬。控制下放，避免用身体晃动借力。",
      action: "哑铃侧平举",
      date: offsetDate(TODAY, -2),
      pinned: false,
    },
  ];
  return data;
}

function IconButton({
  title,
  children,
  onClick,
  className = "",
  disabled = false,
}: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function App() {
  const [journal, setJournal] = useState<Journal>(newJournal);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">(
    "saved",
  );
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(TODAY);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState("");
  const [demo, setDemo] = useState<Journal | null>(null);
  const [query, setQuery] = useState("");
  const [partFilter, setPartFilter] = useState("全部");
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const importRef = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const current = demo || journal;
  const day = current.days[date] || newDay();
  const water = totalWater(day);
  const dailyNotes = current.notes.filter((note) => note.date === date);
  const recordedDates = new Set([
    ...Object.keys(current.days).filter((key) => hasRecords(current.days[key])),
    ...current.notes.map((note) => note.date),
  ]);
  const savedDays = recordedDates.size;
  const weekStart = offsetDate(date, -((parseDate(date).getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => offsetDate(weekStart, i));
  const notify = (message: string) => setToast(message);

  useEffect(() => {
    loadJournal()
      .then(setJournal)
      .catch((error) =>
        setLoadError(
          error.message || "读取本机记录失败，请检查浏览器存储权限。",
        ),
      )
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!loaded || loadError) return;
    const version = ++revision.current;
    setSaveState("saving");
    const timeout = setTimeout(() => {
      saveJournal(journal)
        .then(() => {
          if (version === revision.current) setSaveState("saved");
        })
        .catch(() => {
          if (version === revision.current) setSaveState("error");
        });
    }, 200);
    return () => clearTimeout(timeout);
  }, [journal, loaded, loadError]);
  useEffect(() => {
    if (!loaded || loadError) return;
    const flush = () => {
      if (document.visibilityState === "hidden")
        void saveJournal(journal).catch(() => {});
    };
    const leave = (event: BeforeUnloadEvent) => {
      if (saveState !== "saved") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("beforeunload", leave);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("beforeunload", leave);
    };
  }, [journal, loaded, loadError, saveState]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function update(change: (data: Journal) => Journal) {
    if (demo) setDemo((data) => (data ? change(data) : data));
    else setJournal(change);
  }
  function updateDay(change: (day: Day) => Day) {
    update((data) => ({
      ...data,
      days: { ...data.days, [date]: change(data.days[date] || newDay()) },
    }));
  }
  function addWater(amount: number) {
    updateDay((day) => ({
      ...day,
      water: [...day.water, { id: uid(), amount, time: nowTime() }],
    }));
    notify(`已记录 ${amount} ml 饮水`);
  }
  function removeExercise(id: string) {
    setDialog({
      kind: "confirm",
      title: "删除这个训练动作？",
      text: "该动作在当天的组数记录也会删除，其他日期的记录和老师要点会保留。",
      action: () =>
        updateDay((day) => ({
          ...day,
          exercises: day.exercises.filter((e) => e.id !== id),
        })),
    });
  }
  function editExercise(id: string, change: (exercise: Exercise) => Exercise) {
    updateDay((day) => ({
      ...day,
      completed: false,
      exercises: day.exercises.map((e) => (e.id === id ? change(e) : e)),
    }));
  }
  function previousExercise(name: string) {
    for (const key of Object.keys(current.days)
      .filter((key) => key < date)
      .sort()
      .reverse()) {
      const exercise = current.days[key].exercises.find((e) => e.name === name);
      if (exercise) return { date: key, exercise };
    }
  }
  function useLastTraining() {
    const last = Object.keys(current.days)
      .filter((key) => key < date && current.days[key].exercises.length)
      .sort()
      .reverse()[0];
    if (!last) {
      notify("还没有之前的训练，先添加一个动作吧");
      return;
    }
    const copied = current.days[last].exercises.map((e) => ({
      ...e,
      id: uid(),
      sets: e.sets.map((s) => ({ ...s, id: uid(), done: false })),
    }));
    updateDay((day) => ({
      ...day,
      rest: false,
      completed: false,
      exercises: [...day.exercises, ...copied],
    }));
    notify(`已沿用 ${fmtDate(last)} 的训练`);
  }
  function changeDate(next: string) {
    if (next > TODAY) return;
    setDate(next);
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("备份超过 100 MB，请使用更小的备份文件。");
      const incoming: unknown = JSON.parse(await file.text());
      if (!validateJournal(incoming))
        throw new Error("文件格式不正确，请选择练记导出的完整 JSON 备份。");
      setDialog({
        kind: "confirm",
        title: "用备份替换本机记录？",
        text: `备份包含 ${Object.keys(incoming.days).length} 天记录和 ${incoming.notes.length} 条要点。会替换当前数据，建议先导出当前备份。`,
        action: () => {
          setDemo(null);
          setJournal(incoming);
          notify("备份已导入");
        },
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "备份读取失败");
    }
    if (importRef.current) importRef.current.value = "";
  }
  function exportBackup() {
    exportFile(journal);
    notify("已生成包含照片的本机备份");
  }
  function go(next: Tab) {
    setTab(next);
    setQuery("");
    if (next === "history") setMonth(date.slice(0, 7));
    window.scrollTo({ top: 0 });
  }

  if (!loaded)
    return (
      <div className="loading-screen">
        <Activity size={32} />
        <p>练记</p>
        <Loader2 className="spin" size={20} />
      </div>
    );
  if (loadError)
    return (
      <div className="loading-screen">
        <ShieldCheck size={32} />
        <h2>本机记录暂时无法读取</h2>
        <p>{loadError}</p>
        <button
          className="button primary"
          onClick={async () => exportFile(await loadRawJournal())}
        >
          导出原始备份
        </button>
        <button className="button" onClick={() => location.reload()}>
          重新读取
        </button>
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            go("today");
          }}
        >
          <span className="brand-mark">
            <Activity size={25} />
          </span>
          <span>
            练记<span className="brand-english">DAYFORM</span>
          </span>
        </a>
        <div className="nav-caption">我的日常</div>
        <nav aria-label="主导航">
          {(
            [
              { id: "today", label: "今天", icon: Sun },
              { id: "history", label: "历史记录", icon: CalendarDays },
              { id: "library", label: "动作与要点", icon: BookOpen },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? "active" : ""}`}
              onClick={() => go(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {tab === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="streak">
            <span className="streak-icon">
              <Flame size={20} />
            </span>
            <strong>
              {savedDays}
              <small>天</small>
            </strong>
            <span>已记录的日常</span>
          </div>
          <button className="backup-link" onClick={exportBackup}>
            <ArrowDownToLine size={17} />
            导出我的记录
            <ChevronRight size={15} />
          </button>
          <button
            className="profile"
            onClick={() => setDialog({ kind: "settings" })}
          >
            <span className="avatar">{current.settings.name.slice(0, 1)}</span>
            <span>
              <strong>我的健身日记</strong>
              <small>个人空间</small>
            </span>
            <Settings size={18} />
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            我的空间 <ChevronRight size={13} />{" "}
            <strong>
              {tab === "today"
                ? "每日记录"
                : tab === "history"
                  ? "历史记录"
                  : "动作与要点"}
            </strong>
          </span>
          <div className="topbar-right">
            <span
              className={`save-status ${saveState === "error" ? "error" : ""}`}
            >
              <span />
              {demo
                ? "示例预览"
                : saveState === "saving"
                  ? "保存中"
                  : saveState === "error"
                    ? "保存失败 · 请导出备份"
                    : "已保存在本机"}
            </span>
            <IconButton
              title="设置与备份"
              onClick={() => setDialog({ kind: "settings" })}
            >
              <Settings size={18} />
            </IconButton>
          </div>
        </header>

        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tab === "today"
                  ? "YOUR DAILY CHECK-IN"
                  : tab === "history"
                    ? "A LITTLE BETTER, EVERY DAY"
                    : "YOUR PERSONAL PLAYBOOK"}
              </div>
              <h1>
                {tab === "today"
                  ? date === TODAY
                    ? "今天的记录"
                    : `${fmtDate(date)}的记录`
                  : tab === "history"
                    ? "每一天，都算数"
                    : "动作与老师要点"}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {tab === "today"
                  ? `${fmtDate(date, { year: "numeric", month: "long", day: "numeric", weekday: "long" })} · ${date === TODAY ? "记录属于自己的节奏" : "那些认真生活的日子"}`
                  : tab === "history"
                    ? `已经留下 ${savedDays} 天记录，慢慢积累自己的进步。`
                    : `${current.notes.length} 条要点，留给下一次更好的训练。`}
              </p>
            </div>
            <div className="heading-actions">
              {!demo ? (
                <button
                  className="button subtle demo-button"
                  onClick={() => {
                    setDemo(demoJournal());
                    setDate(TODAY);
                    notify("正在查看示例，修改不会影响你的真实记录");
                  }}
                >
                  <Sparkles size={15} />
                  查看示例
                </button>
              ) : (
                <button
                  className="button primary"
                  onClick={() => {
                    setDemo(null);
                    notify("已回到你的真实记录");
                  }}
                >
                  回到我的记录
                  <ArrowRight size={16} />
                </button>
              )}
              {tab === "today" && (
                <label className="date-picker">
                  <CalendarDays size={16} />
                  <span>{date === TODAY ? "今天" : fmtDate(date)}</span>
                  <ChevronDown size={14} />
                  <input
                    aria-label="选择记录日期"
                    type="date"
                    max={TODAY}
                    value={date}
                    onChange={(e) =>
                      e.target.value && changeDate(e.target.value)
                    }
                  />
                </label>
              )}
            </div>
          </div>
          {demo && (
            <div className="demo-banner">
              <Sparkles size={15} />
              <span>示例数据 · 当前修改仅用于预览</span>
              <button onClick={() => setDemo(null)}>
                退出示例
                <X size={14} />
              </button>
            </div>
          )}
          {saveState === "error" && !demo && (
            <div className="error-banner">
              本机保存失败。请保持页面打开并导出备份。
              <button onClick={exportBackup}>导出备份</button>
              <button onClick={() => setJournal({ ...journal })}>
                重试保存
              </button>
            </div>
          )}

          {tab === "today" && (
            <>
              <div className="week-strip">
                <IconButton
                  title="上一周"
                  onClick={() => changeDate(offsetDate(date, -7))}
                >
                  <ChevronLeft size={18} />
                </IconButton>
                {week.map((key, i) => (
                  <button
                    disabled={key > TODAY}
                    key={key}
                    className={`week-day ${date === key ? "selected" : ""}`}
                    onClick={() => changeDate(key)}
                  >
                    <span>{["一", "二", "三", "四", "五", "六", "日"][i]}</span>
                    <strong>{parseDate(key).getDate()}</strong>
                    <i
                      className={
                        recordedDates.has(key) ? "recorded" : ""
                      }
                    />
                  </button>
                ))}
                <IconButton
                  title="下一周"
                  disabled={week[6] >= TODAY}
                  onClick={() => changeDate(offsetDate(date, 7))}
                >
                  <ChevronRight size={18} />
                </IconButton>
              </div>
              <div className="overview">
                <div>
                  <span className="metric-icon green">
                    <Utensils size={19} />
                  </span>
                  <span>
                    <small>饮食记录</small>
                    <strong>
                      {
                        new Set(
                          day.meals
                            .filter((m) => m.type !== "snack")
                            .map((m) => m.type),
                        ).size
                      }
                      <em>/ 3 餐</em>
                    </strong>
                  </span>
                </div>
                <div>
                  <span className="metric-icon blue">
                    <Droplet size={19} />
                  </span>
                  <span>
                    <small>今日饮水</small>
                    <strong>
                      {water.toLocaleString()}
                      <em>ml</em>
                    </strong>
                  </span>
                </div>
                <div>
                  <span className="metric-icon orange">
                    <Dumbbell size={20} />
                  </span>
                  <span>
                    <small>训练完成</small>
                    <strong>
                      {totalSets(day)}
                      <em>组 · {day.exercises.length} 个动作</em>
                    </strong>
                  </span>
                </div>
                <div>
                  <span className="metric-icon lavender">
                    <BookOpen size={18} />
                  </span>
                  <span>
                    <small>老师要点</small>
                    <strong>
                      {dailyNotes.length}
                      <em>条记录</em>
                    </strong>
                  </span>
                </div>
              </div>

              <div className="today-grid">
                <div className="main-column">
                  <section className="meal-section">
                    <SectionHeading
                      icon={<Utensils size={19} />}
                      title="好好吃饭"
                      subtitle="三餐与加餐"
                      action={
                        <button
                          className="text-button"
                          onClick={() =>
                            setDialog({ kind: "meal", type: "snack" })
                          }
                        >
                          <Plus size={15} />
                          加餐
                        </button>
                      }
                    />
                    <div className="meal-grid">
                      {(["breakfast", "lunch", "dinner"] as MealType[]).map(
                        (type) => {
                          const meals = day.meals.filter(
                            (m) => m.type === type,
                          );
                          const meal = meals[0];
                          const Icon = mealIcons[type];
                          return (
                            <button
                              className={`meal-card ${meal ? "has-meal" : ""}`}
                              key={type}
                              onClick={() =>
                                setDialog({ kind: "meal", type, meal })
                              }
                            >
                              <div className="meal-photo">
                                {meal?.photo ? (
                                  <img
                                    src={meal.photo}
                                    alt={`${mealLabels[type]}照片`}
                                  />
                                ) : (
                                  <div className={`meal-empty ${type}`}>
                                    <Icon size={29} strokeWidth={1.4} />
                                    <span>{meal ? "已记录" : "还没记录"}</span>
                                  </div>
                                )}
                                <span className="meal-label">
                                  <Icon size={13} />
                                  {mealLabels[type]}
                                </span>
                                <span
                                  className={`meal-corner ${meal ? "complete" : ""}`}
                                >
                                  {meal ? (
                                    <Check size={13} />
                                  ) : (
                                    <Plus size={15} />
                                  )}
                                </span>
                              </div>
                              <div className="meal-info">
                                <strong>
                                  {meal?.text ||
                                    (meal?.photo ? "一餐好食光" : "记录这一餐")}
                                </strong>
                                <span>
                                  {meal ? (
                                    `${meal.time}${meals.length > 1 ? ` · 共 ${meals.length} 条` : ""}`
                                  ) : (
                                    <>
                                      <Camera size={12} />
                                      照片 / 文字
                                    </>
                                  )}
                                </span>
                              </div>
                            </button>
                          );
                        },
                      )}
                    </div>
                    {day.meals
                      .filter((m) => m.type === "snack")
                      .map((meal) => (
                        <button
                          className="snack-row"
                          key={meal.id}
                          onClick={() =>
                            setDialog({ kind: "meal", type: "snack", meal })
                          }
                        >
                          <Leaf size={16} />
                          <span>{meal.text || "加餐照片"}</span>
                          <small>{meal.time}</small>
                          <Edit3 size={14} />
                        </button>
                      ))}
                  </section>

                  <section className="training-section">
                    <SectionHeading
                      icon={<Dumbbell size={21} />}
                      title="认真训练"
                      subtitle={
                        day.rest
                          ? "今天是恢复日"
                          : `${day.exercises.length} 个动作 · ${totalSets(day)} 组已完成`
                      }
                      action={
                        <div className="section-actions">
                          {!day.exercises.length && (
                            <button
                              className="text-button muted"
                              onClick={() =>
                                updateDay((d) => ({
                                  ...d,
                                  rest: !d.rest,
                                  completed: false,
                                }))
                              }
                            >
                              {day.rest ? "取消休息日" : "设为休息日"}
                            </button>
                          )}
                          <button
                            className="text-button"
                            onClick={() => setDialog({ kind: "exercise" })}
                          >
                            <Plus size={15} />
                            添加动作
                          </button>
                        </div>
                      }
                    />
                    {!day.exercises.length ? (
                      <div
                        className={`training-empty ${day.rest ? "rest" : ""}`}
                      >
                        <div className="training-empty-content">
                          <span className="mini-label">
                            {day.rest ? "RECOVERY DAY" : "MAKE YOUR MOVE"}
                          </span>
                          <h3>
                            {day.rest
                              ? "好好休息，也是训练的一部分"
                              : "今天，练什么？"}
                          </h3>
                          <p>
                            {day.rest
                              ? "给身体一点恢复的时间。"
                              : "每一组认真完成的动作，都值得被记下。"}
                          </p>
                          <div>
                            <button
                              className="button primary"
                              onClick={() => setDialog({ kind: "exercise" })}
                            >
                              <Plus size={16} />
                              {day.rest ? "开始训练" : "开始记录"}
                            </button>
                            {!day.rest && (
                              <button
                                className="text-button"
                                onClick={useLastTraining}
                              >
                                <Undo2 size={14} />
                                沿用上次
                              </button>
                            )}
                          </div>
                        </div>
                        <img src="./images/training.jpg" alt="健身训练器械" />
                      </div>
                    ) : (
                      <div className="exercise-list">
                        {day.exercises.map((exercise, index) => (
                          <ExerciseCard
                            key={exercise.id}
                            exercise={exercise}
                            index={index}
                            previous={previousExercise(exercise.name)}
                            notes={current.notes.filter(
                              (note) => note.action === exercise.name,
                            )}
                            edit={(change) => editExercise(exercise.id, change)}
                            remove={() => removeExercise(exercise.id)}
                            addNote={() =>
                              setDialog({ kind: "note", action: exercise.name })
                            }
                            notify={notify}
                          />
                        ))}
                      </div>
                    )}
                    {day.exercises.length > 0 && (
                      <div className="training-footer">
                        <button
                          className="button"
                          onClick={() => setDialog({ kind: "exercise" })}
                        >
                          <Plus size={16} />
                          添加动作
                        </button>
                        <button
                          className={`button ${day.completed ? "completed" : "primary"}`}
                          onClick={() => {
                            if (
                              !day.completed &&
                              day.exercises.some((e) =>
                                e.kind === "strength"
                                  ? e.sets.some((s) => !s.done)
                                  : !e.minutes || Number(e.minutes) <= 0,
                              )
                            ) {
                              notify("请先完成各组记录，并填写有氧时长");
                              return;
                            }
                            updateDay((d) => ({
                              ...d,
                              completed: !d.completed,
                            }));
                          }}
                        >
                          <CheckCheck size={16} />
                          {day.completed ? "训练已完成" : "结束训练"}
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="feeling-section">
                    <SectionHeading
                      icon={<Leaf size={19} />}
                      title="今日感受"
                      subtitle="给今天留一句话"
                    />
                    <textarea
                      aria-label="今日感受"
                      maxLength={2000}
                      value={day.feeling}
                      onChange={(e) =>
                        updateDay((d) => ({ ...d, feeling: e.target.value }))
                      }
                      placeholder="身体状态、训练感受，或是一个小小的进步……"
                    />
                    <div className="textarea-footer">
                      <span>{day.feeling.length}/2000</span>
                      <span>
                        <Check size={12} />
                        自动保存
                      </span>
                    </div>
                  </section>
                </div>
                <aside className="right-column">
                  <section className="water-panel">
                    <div className="water-heading">
                      <span>
                        <Droplet size={19} />
                        喝水打卡
                      </span>
                      <IconButton
                        title="饮水记录明细"
                        onClick={() => setDialog({ kind: "waterLog" })}
                      >
                        <MoreHorizontal size={20} />
                      </IconButton>
                    </div>
                    <div className="water-display">
                      <div>
                        <strong>{water.toLocaleString()}</strong>
                        <span>
                          / {current.settings.waterGoal.toLocaleString()} ml
                        </span>
                        <small>
                          {water >= current.settings.waterGoal
                            ? "今日目标已达成"
                            : `还差 ${(current.settings.waterGoal - water).toLocaleString()} ml`}
                        </small>
                      </div>
                      <div className="water-glass">
                        <div
                          className="water-fill"
                          style={{
                            height: `${Math.min(100, (water / current.settings.waterGoal) * 100)}%`,
                          }}
                        />
                        <Droplet size={25} strokeWidth={1.2} />
                      </div>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${Math.min(100, (water / current.settings.waterGoal) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="water-progress-label">
                      <span>每日目标</span>
                      <strong>
                        {Math.round((water / current.settings.waterGoal) * 100)}
                        %
                      </strong>
                    </div>
                    <div className="water-buttons">
                      {[200, 300, 500].map((amount) => (
                        <button key={amount} onClick={() => addWater(amount)}>
                          <Plus size={13} />
                          {amount}
                          <small>ml</small>
                        </button>
                      ))}
                    </div>
                    <div className="water-bottom">
                      <button onClick={() => setDialog({ kind: "water" })}>
                        自定义水量
                      </button>
                      <button
                        disabled={!day.water.length}
                        onClick={() => {
                          updateDay((d) => ({
                            ...d,
                            water: d.water.slice(0, -1),
                          }));
                          notify("已撤销最近一次饮水");
                        }}
                      >
                        <Undo2 size={12} />
                        撤销
                      </button>
                    </div>
                  </section>
                  <section className="notes-section">
                    <SectionHeading
                      icon={<BookOpen size={19} />}
                      title="老师教的要点"
                      action={
                        <IconButton
                          title="添加老师要点"
                          onClick={() => setDialog({ kind: "note" })}
                        >
                          <Plus size={18} />
                        </IconButton>
                      }
                    />
                    {dailyNotes.length ? (
                      dailyNotes.map((note) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onEdit={() => setDialog({ kind: "note", note })}
                        />
                      ))
                    ) : (
                      <div className="notes-empty">
                        <span className="note-doodle">
                          <BookOpen size={26} strokeWidth={1.2} />
                        </span>
                        <h4>记住一个动作细节</h4>
                        <p>把老师的提醒，留给下次训练。</p>
                        <button
                          className="text-button"
                          onClick={() => setDialog({ kind: "note" })}
                        >
                          <Plus size={14} />
                          记一条要点
                        </button>
                      </div>
                    )}
                  </section>
                  <div className="local-note">
                    <ShieldCheck size={16} />
                    <span>
                      本机私密记录
                      <button onClick={() => setDialog({ kind: "settings" })}>
                        备份与数据管理
                        <ArrowRight size={12} />
                      </button>
                    </span>
                  </div>
                </aside>
              </div>
            </>
          )}

          {tab === "history" && (
            <div className="history-layout">
              <section className="calendar-panel">
                <div className="calendar-heading">
                  <h2>
                    {fmtDate(`${month}-01`, { year: "numeric", month: "long" })}
                  </h2>
                  <div>
                    <IconButton
                      title="上个月"
                      onClick={() => {
                        const d = parseDate(`${month}-01`);
                        d.setMonth(d.getMonth() - 1);
                        setMonth(localDate(d).slice(0, 7));
                      }}
                    >
                      <ChevronLeft size={18} />
                    </IconButton>
                    <IconButton
                      title="下个月"
                      disabled={month >= TODAY.slice(0, 7)}
                      onClick={() => {
                        const d = parseDate(`${month}-01`);
                        d.setMonth(d.getMonth() + 1);
                        setMonth(localDate(d).slice(0, 7));
                      }}
                    >
                      <ChevronRight size={18} />
                    </IconButton>
                  </div>
                </div>
                <div className="calendar-grid">
                  {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
                    <span className="calendar-weekday" key={label}>
                      {label}
                    </span>
                  ))}
                  {Array.from(
                    { length: (parseDate(`${month}-01`).getDay() + 6) % 7 },
                    (_, i) => (
                      <span key={`blank${i}`} />
                    ),
                  )}
                  {Array.from(
                    {
                      length: new Date(
                        Number(month.slice(0, 4)),
                        Number(month.slice(5)),
                        0,
                      ).getDate(),
                    },
                    (_, i) => {
                      const key = `${month}-${String(i + 1).padStart(2, "0")}`;
                      return (
                        <button
                          className={`${key === date ? "selected" : ""} ${key === TODAY ? "is-today" : ""}`}
                          key={key}
                          disabled={key > TODAY}
                          onClick={() => changeDate(key)}
                        >
                          <strong>{i + 1}</strong>
                          <i
                            className={
                              recordedDates.has(key) ? "recorded" : ""
                            }
                          />
                        </button>
                      );
                    },
                  )}
                </div>
                <div className="calendar-legend">
                  <i />
                  有记录
                  <span>
                    <Moon size={13} />
                    休息日也值得记录
                  </span>
                </div>
              </section>
              <section className="history-detail">
                <SectionHeading
                  icon={<CalendarDays size={19} />}
                  title={fmtDate(date)}
                  action={
                    <button className="text-button" onClick={() => go("today")}>
                      查看与编辑
                      <ArrowRight size={15} />
                    </button>
                  }
                />
                <div className="history-summary">
                  <div>
                    <Droplet size={20} />
                    <strong>
                      {water}
                      <small>ml 饮水</small>
                    </strong>
                  </div>
                  <div>
                    <Utensils size={20} />
                    <strong>
                      {day.meals.length}
                      <small>条饮食记录</small>
                    </strong>
                  </div>
                  <div>
                    <Dumbbell size={20} />
                    <strong>
                      {day.rest ? "休息" : totalSets(day)}
                      <small>{day.rest ? "恢复日" : "组训练"}</small>
                    </strong>
                  </div>
                </div>
                {!hasRecords(day) && !dailyNotes.length ? (
                  <div className="empty-state">
                    <CalendarDays size={34} />
                    <h3>这一天，还没有留下记录</h3>
                    <button
                      className="button primary"
                      onClick={() => go("today")}
                    >
                      <Plus size={15} />
                      补记这一天
                    </button>
                  </div>
                ) : (
                  <div className="timeline">
                    {day.meals.map((meal) => (
                      <div className="timeline-item" key={meal.id}>
                        <span>{meal.time}</span>
                        <div>
                          <small>{mealLabels[meal.type]}</small>
                          <strong>{meal.text || "一餐好食光"}</strong>
                          {meal.photo && (
                            <img src={meal.photo} alt={mealLabels[meal.type]} />
                          )}
                        </div>
                      </div>
                    ))}
                    {day.exercises.map((e) => (
                      <div className="timeline-item" key={e.id}>
                        <span>
                          <Dumbbell size={15} />
                        </span>
                        <div>
                          <small>
                            {e.part} ·{" "}
                            {e.kind === "cardio" ? "有氧" : "力量训练"}
                          </small>
                          <strong>{e.name}</strong>
                          <p>
                            {e.kind === "cardio"
                              ? `${e.minutes || 0} 分钟 · ${e.distance || 0} km`
                              : e.sets
                                  .map(
                                    (s, i) =>
                                      `第 ${i + 1} 组：${weightText(s.weight)} × ${s.reps || "—"} 次${s.done ? " ✓" : ""}`,
                                  )
                                  .join(" / ")}
                          </p>
                        </div>
                      </div>
                    ))}
                    {dailyNotes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onEdit={() => setDialog({ kind: "note", note })}
                      />
                    ))}
                    {day.feeling && <blockquote>{day.feeling}</blockquote>}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "library" && (
            <>
              <div className="library-toolbar">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="搜索动作或要点"
                    placeholder="搜索动作或老师要点"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button
                  className="button primary"
                  onClick={() => setDialog({ kind: "note" })}
                >
                  <Plus size={16} />
                  记录要点
                </button>
              </div>
              <div className="part-filters">
                {["全部", ...parts].map((part) => (
                  <button
                    className={partFilter === part ? "selected" : ""}
                    key={part}
                    onClick={() => setPartFilter(part)}
                  >
                    {part}
                  </button>
                ))}
              </div>
              <div className="library-grid">
                {Array.from(
                  new Map(
                    [
                      ...exerciseLibrary,
                      ...Object.values(current.days).flatMap(
                        (d) => d.exercises,
                      ),
                    ].map((e) => [e.name, e]),
                  ).values(),
                )
                  .filter(
                    (e) =>
                      (partFilter === "全部" || e.part === partFilter) &&
                      (e.name.includes(query) ||
                        current.notes.some(
                          (n) =>
                            n.action === e.name &&
                            `${n.title}${n.text}`.includes(query),
                        )),
                  )
                  .map((e) => {
                    const notes = current.notes.filter(
                      (n) => n.action === e.name,
                    );
                    const last = Object.keys(current.days)
                      .filter(
                        (key) =>
                          key <= TODAY &&
                          current.days[key].exercises.some(
                            (x) => x.name === e.name,
                          ),
                      )
                      .sort()
                      .reverse()[0];
                    const training = last
                      ? current.days[last].exercises.find(
                          (x) => x.name === e.name,
                        )
                      : undefined;
                    return (
                      <article className="library-card" key={e.name}>
                        <div className="library-card-top">
                          <span className="exercise-icon">
                            <Dumbbell size={20} />
                          </span>
                          <span className="part-tag">{e.part}</span>
                        </div>
                        <h3>{e.name}</h3>
                        <p>
                          {training
                            ? `最近训练 · ${fmtDate(last)}${training.kind === "strength" ? ` · ${training.sets.length} 组` : ""}`
                            : "还没有训练记录"}
                        </p>
                        {notes.length > 0 && (
                          <div className="library-note">
                            <BookOpen size={14} />
                            <span>{notes[0].title}</span>
                          </div>
                        )}
                        <div className="library-card-bottom">
                          <span>{notes.length} 条要点</span>
                          <button
                            className="text-button"
                            onClick={() =>
                              setDialog({ kind: "note", action: e.name })
                            }
                          >
                            <Plus size={14} />
                            记录要点
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
              <section className="all-notes">
                <SectionHeading
                  icon={<BookOpen size={19} />}
                  title="我的要点本"
                  subtitle={`${current.notes.length} 条`}
                />
                <div className="notes-grid">
                  {current.notes
                    .filter(
                      (n) =>
                        `${n.title}${n.text}${n.action}`.includes(query) &&
                        (partFilter === "全部" ||
                          Object.values(current.days)
                            .flatMap((d) => d.exercises)
                            .some(
                              (e) =>
                                e.name === n.action && e.part === partFilter,
                            ) ||
                          exerciseLibrary.some(
                            (e) => e.name === n.action && e.part === partFilter,
                          )),
                    )
                    .sort(
                      (a, b) =>
                        Number(b.pinned) - Number(a.pinned) ||
                        b.date.localeCompare(a.date),
                    )
                    .map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onEdit={() => setDialog({ kind: "note", note })}
                      />
                    ))}
                </div>
                {!current.notes.length && (
                  <div className="empty-state">
                    <BookOpen size={30} />
                    <p>第一条要点，从老师的一句提醒开始。</p>
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>练记 DAYFORM</span>
            <span>一点一滴，留下进步。</span>
          </footer>
        </main>
      </div>
      <input
        ref={importRef}
        hidden
        type="file"
        accept="application/json,.json"
        aria-label="导入备份文件"
        onChange={(e) => void importBackup(e.target.files?.[0])}
      />
      {dialog && (
        <Modal
          title={
            dialog.kind === "meal"
              ? `${dialog.meal ? "编辑" : "记录"}${mealLabels[dialog.type]}`
              : dialog.kind === "exercise"
                ? "添加训练动作"
                : dialog.kind === "note"
                  ? dialog.note
                    ? "编辑老师要点"
                    : "记下老师的提醒"
                  : dialog.kind === "water"
                    ? "记录饮水"
                    : dialog.kind === "waterLog"
                      ? "饮水明细"
                      : dialog.kind === "settings"
                        ? "设置与数据"
                        : dialog.title
          }
          onClose={() => setDialog(null)}
        >
          {dialog.kind === "meal" && (
            <MealForm
              date={date}
              type={dialog.type}
              meal={dialog.meal}
              notify={notify}
              save={(meal) => {
                updateDay((d) => ({
                  ...d,
                  meals: dialog.meal
                    ? d.meals.map((m) => (m.id === meal.id ? meal : m))
                    : [...d.meals, meal],
                }));
                setDialog(null);
                notify("这一餐已记录");
              }}
              remove={() => {
                setDialog({
                  kind: "confirm",
                  title: "删除这条饮食记录？",
                  text: "这条记录的文字和照片将从当天日志中删除。",
                  action: () =>
                    updateDay((d) => ({
                      ...d,
                      meals: d.meals.filter((m) => m.id !== dialog.meal?.id),
                    })),
                });
              }}
            />
          )}
          {dialog.kind === "exercise" && (
            <ExerciseForm
              previous={previousExercise}
              onAdd={(e) => {
                updateDay((d) => ({
                  ...d,
                  rest: false,
                  completed: false,
                  exercises: [...d.exercises, e],
                }));
                setDialog(null);
                notify(`已添加${e.name}`);
              }}
            />
          )}
          {dialog.kind === "note" && (
            <NoteForm
              note={dialog.note}
              action={dialog.action}
              date={date}
              actions={Array.from(
                new Set([
                  ...exerciseLibrary.map((e) => e.name),
                  ...Object.values(current.days).flatMap((d) =>
                    d.exercises.map((e) => e.name),
                  ),
                ]),
              )}
              save={(note) => {
                update((data) => ({
                  ...data,
                  notes: dialog.note
                    ? data.notes.map((n) => (n.id === note.id ? note : n))
                    : [note, ...data.notes],
                }));
                setDialog(null);
                notify("老师要点已记录");
              }}
              remove={() =>
                setDialog({
                  kind: "confirm",
                  title: "删除这条老师要点？",
                  text: "删除后，这条提醒将不再出现在动作资料和每日记录中。",
                  action: () =>
                    update((data) => ({
                      ...data,
                      notes: data.notes.filter((n) => n.id !== dialog.note?.id),
                    })),
                })
              }
            />
          )}
          {dialog.kind === "water" && (
            <WaterForm
              save={(amount) => {
                addWater(amount);
                setDialog(null);
              }}
            />
          )}
          {dialog.kind === "waterLog" && (
            <>
              <div className="water-log-total">
                <Droplet size={22} />
                <strong>
                  {water} <small>ml</small>
                </strong>
                <span>{fmtDate(date)}</span>
              </div>
              {!day.water.length ? (
                <p className="form-hint">今天还没有饮水记录。</p>
              ) : (
                <div className="water-log">
                  {[...day.water].reverse().map((item) => (
                    <div key={item.id}>
                      <span>{item.time}</span>
                      <strong>{item.amount} ml</strong>
                      <IconButton
                        title={`删除 ${item.time} 的饮水记录`}
                        onClick={() =>
                          updateDay((d) => ({
                            ...d,
                            water: d.water.filter((w) => w.id !== item.id),
                          }))
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
              <button
                className="button primary full"
                onClick={() => setDialog({ kind: "water" })}
              >
                <Plus size={16} />
                记录饮水
              </button>
            </>
          )}
          {dialog.kind === "settings" && (
            <SettingsForm
              settings={current.settings}
              demo={!!demo}
              save={(settings) => {
                update((data) => ({ ...data, settings }));
                setDialog(null);
                notify("设置已保存");
              }}
              exportBackup={exportBackup}
              importBackup={() => {
                if (demo) {
                  notify("请先退出示例再导入");
                  return;
                }
                setDialog(null);
                importRef.current?.click();
              }}
            />
          )}
          {dialog.kind === "confirm" && (
            <>
              <p className="confirm-text">{dialog.text}</p>
              <div className="form-actions">
                <button className="button" onClick={() => setDialog(null)}>
                  取消
                </button>
                <button
                  className="button danger"
                  onClick={() => {
                    dialog.action();
                    setDialog(null);
                  }}
                >
                  确认{dialog.title.includes("替换") ? "替换" : "删除"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="section-icon">{icon}</span>
        <h2>{title}</h2>
        {subtitle && <span className="section-subtitle">{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}
function NoteCard({ note, onEdit }: { note: Note; onEdit: () => void }) {
  return (
    <button className="note-card" onClick={onEdit}>
      <div className="note-meta">
        <span>{note.action || "课堂笔记"}</span>
        {note.pinned && (
          <span className="pinned">
            <Sparkles size={11} />
            重点
          </span>
        )}
        <Edit3 size={13} />
      </div>
      <h3>{note.title || "老师的提醒"}</h3>
      <p>{note.text}</p>
      <div className="note-date">
        {fmtDate(note.date)}
        <ArrowRight size={13} />
      </div>
    </button>
  );
}

function ExerciseCard({
  exercise,
  index,
  previous,
  notes,
  edit,
  remove,
  addNote,
  notify,
}: {
  exercise: Exercise;
  index: number;
  previous?: { date: string; exercise: Exercise };
  notes: Note[];
  edit: (change: (e: Exercise) => Exercise) => void;
  remove: () => void;
  addNote: () => void;
  notify: (s: string) => void;
}) {
  const changeSet = (id: string, change: Partial<TrainingSet>) =>
    edit((e) => ({
      ...e,
      sets: e.sets.map((s) => (s.id === id ? { ...s, ...change } : s)),
    }));
  return (
    <article className="exercise-card">
      <div className="exercise-heading">
        <span className="exercise-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <h3>
            {exercise.name}
            <span className="part-tag">{exercise.part}</span>
          </h3>
          <p>
            {previous
              ? `上次 ${fmtDate(previous.date)} · ${previous.exercise.kind === "strength" ? `${previous.exercise.sets.length} 组${previous.exercise.sets[0] ? ` · ${weightText(previous.exercise.sets[0].weight)} × ${previous.exercise.sets[0].reps || "—"} 次` : ""}` : `${previous.exercise.minutes} 分钟`}`
              : "新的开始，记下第一组"}
          </p>
        </div>
        <IconButton title={`删除${exercise.name}`} onClick={remove}>
          <Trash2 size={15} />
        </IconButton>
      </div>
      {exercise.kind === "strength" ? (
        <>
          <div className="set-table">
            <div className="set-row set-labels">
              <span>组数</span>
              <span>
                重量 <small>kg</small>
              </span>
              <span>次数</span>
              <span>完成</span>
              <span />
            </div>
            {exercise.sets.map((set, i) => (
              <div key={set.id} className={`set-row ${set.done ? "done" : ""}`}>
                <span className="set-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <label>
                  <input
                    aria-label={`${exercise.name}第${i + 1}组重量`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="10000"
                    step="0.5"
                    placeholder="自重"
                    value={set.weight}
                    onChange={(event) => {
                      const v = event.target.value;
                      if (v === "" || (Number(v) >= 0 && Number(v) <= 10000))
                        changeSet(set.id, { weight: v, done: false });
                    }}
                  />
                </label>
                <label>
                  <input
                    aria-label={`${exercise.name}第${i + 1}组次数`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="10000"
                    step="1"
                    placeholder="—"
                    value={set.reps}
                    onChange={(event) => {
                      const v = event.target.value;
                      if (
                        v === "" ||
                        (Number.isInteger(Number(v)) &&
                          Number(v) >= 0 &&
                          Number(v) <= 10000)
                      )
                        changeSet(set.id, { reps: v, done: false });
                    }}
                  />
                </label>
                <button
                  className={`set-check ${set.done ? "checked" : ""}`}
                  title={set.done ? "取消完成" : "标记完成"}
                  aria-label={`${exercise.name}第${i + 1}组${set.done ? "取消完成" : "标记完成"}`}
                  aria-pressed={set.done}
                  onClick={() => {
                    if (!set.done && (!set.reps || Number(set.reps) <= 0)) {
                      notify("请先填写本组次数");
                      return;
                    }
                    changeSet(set.id, { done: !set.done });
                  }}
                >
                  <Check size={16} />
                </button>
                <IconButton
                  title={`删除第${i + 1}组`}
                  disabled={exercise.sets.length <= 1}
                  onClick={() =>
                    edit((e) => ({
                      ...e,
                      sets: e.sets.filter((s) => s.id !== set.id),
                    }))
                  }
                >
                  <Minus size={14} />
                </IconButton>
              </div>
            ))}
          </div>
          <button
            className="add-set"
            disabled={exercise.sets.length >= 100}
            onClick={() =>
              edit((e) => ({
                ...e,
                sets: [
                  ...e.sets,
                  {
                    id: uid(),
                    weight: e.sets.at(-1)?.weight || "",
                    reps: e.sets.at(-1)?.reps || "",
                    done: false,
                  },
                ],
              }))
            }
          >
            <Plus size={14} />
            添加一组
          </button>
        </>
      ) : (
        <div className="cardio-fields">
          <label>
            时长（分钟）
            <input
              type="number"
              min="0"
              max="10000"
              step="0.1"
              value={exercise.minutes}
              onChange={(event) => {
                const v = event.target.value;
                if (v === "" || (Number(v) >= 0 && Number(v) <= 10000))
                  edit((e) => ({ ...e, minutes: v }));
              }}
            />
          </label>
          <label>
            距离（km）
            <input
              type="number"
              min="0"
              max="10000"
              step="0.1"
              value={exercise.distance}
              onChange={(event) => {
                const v = event.target.value;
                if (v === "" || (Number(v) >= 0 && Number(v) <= 10000))
                  edit((e) => ({ ...e, distance: v }));
              }}
            />
          </label>
        </div>
      )}
      <div className="exercise-note">
        <BookOpen size={14} />
        <span>{notes[0]?.text || "还没有关联的老师要点"}</span>
        <button
          onClick={addNote}
          title="为这个动作记录要点"
          aria-label="为这个动作记录要点"
        >
          <Plus size={15} />
        </button>
      </div>
    </article>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const all = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not([type=hidden]),textarea,select,[tabindex="0"]',
        );
        if (!all?.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2 id="dialog-title">{title}</h2>
          <IconButton title="关闭窗口" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function MealForm({
  date,
  type,
  meal,
  save,
  remove,
  notify,
}: {
  date: string;
  type: MealType;
  meal?: Meal;
  save: (m: Meal) => void;
  remove: () => void;
  notify: (s: string) => void;
}) {
  const draftKey = `lianji-draft-meal-${date}-${meal?.id || type}`;
  const readDraft = () => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) || "null") as {
        text?: string;
        time?: string;
      } | null;
    } catch {
      return null;
    }
  };
  const [text, setText] = useState(() => meal?.text || readDraft()?.text || "");
  const [time, setTime] = useState(
    () => meal?.time || readDraft()?.time || nowTime(),
  );
  const [photo, setPhoto] = useState(meal?.photo || "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ text, time }));
    } catch {
      /* The saved journal remains in IndexedDB when draft storage is unavailable. */
    }
  }, [text, time, draftKey]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim() && !photo) {
          notify("写下吃了什么，或添加一张照片");
          return;
        }
        save({
          id: meal?.id || uid(),
          type,
          text: text.trim(),
          time,
          photo: photo || undefined,
        });
        sessionStorage.removeItem(draftKey);
      }}
    >
      <div className="form-date">
        <CalendarDays size={14} />
        {fmtDate(date)} · {mealLabels[type]}
      </div>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="image/*"
        aria-label="选择餐食照片"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            setPhoto(await compressPhoto(file));
          } catch (error) {
            notify((error as Error).message);
          } finally {
            setBusy(false);
            event.target.value = "";
          }
        }}
      />
      <div className={`photo-upload ${photo ? "with-photo" : ""}`}>
        {photo ? (
          <>
            <img src={photo} alt="餐食照片预览" />
            <div>
              <button
                type="button"
                className="button"
                onClick={() => fileRef.current?.click()}
              >
                <Camera size={15} />
                更换照片
              </button>
              <IconButton title="移除照片" onClick={() => setPhoto("")}>
                <Trash2 size={16} />
              </IconButton>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="spin" size={27} />
            ) : (
              <Camera size={28} strokeWidth={1.4} />
            )}
            <strong>{busy ? "正在处理照片" : "添加餐食照片"}</strong>
            <span>拍照或从相册选择</span>
          </button>
        )}
      </div>
      <label className="form-field">
        吃了什么
        <textarea
          maxLength={2000}
          placeholder="比如：两个鸡蛋、一杯牛奶、全麦面包"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="form-field">
        用餐时间
        <input
          required
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <div className="form-actions">
        {meal && (
          <button
            type="button"
            className="button danger subtle"
            onClick={remove}
          >
            <Trash2 size={15} />
            删除
          </button>
        )}
        <button type="submit" className="button primary" disabled={busy}>
          <Check size={16} />
          保存这一餐
        </button>
      </div>
    </form>
  );
}

function ExerciseForm({
  previous,
  onAdd,
}: {
  previous: (name: string) => { date: string; exercise: Exercise } | undefined;
  onAdd: (e: Exercise) => void;
}) {
  const [search, setSearch] = useState("");
  const [part, setPart] = useState("全部");
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [customPart, setCustomPart] = useState("胸部");
  const [kind, setKind] = useState<"strength" | "cardio">("strength");
  const add = (name: string, part: string, kind: "strength" | "cardio") => {
    const last = previous(name);
    onAdd({
      id: uid(),
      name,
      part,
      kind,
      minutes: "",
      distance: "",
      sets:
        kind === "cardio"
          ? []
          : last?.exercise.sets.length
            ? last.exercise.sets.map((s) => ({ ...s, id: uid(), done: false }))
            : [{ id: uid(), weight: "", reps: "", done: false }],
    });
  };
  return (
    <>
      <div className="segmented">
        <button
          className={!custom ? "selected" : ""}
          onClick={() => setCustom(false)}
        >
          常用动作
        </button>
        <button
          className={custom ? "selected" : ""}
          onClick={() => setCustom(true)}
        >
          自定义动作
        </button>
      </div>
      {custom ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add(name.trim(), customPart, kind);
          }}
        >
          <label className="form-field">
            动作名称
            <input
              required
              maxLength={80}
              placeholder="输入动作名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="form-field">
            训练部位
            <select
              value={customPart}
              onChange={(e) => setCustomPart(e.target.value)}
            >
              {parts.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            记录类型
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="strength">力量训练 · 重量 / 次数 / 组数</option>
              <option value="cardio">有氧训练 · 时长 / 距离</option>
            </select>
          </label>
          <button type="submit" className="button primary full">
            <Plus size={16} />
            添加动作
          </button>
        </form>
      ) : (
        <>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="搜索训练动作"
              placeholder="搜索动作"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="part-filters compact">
            {["全部", ...parts].map((p) => (
              <button
                key={p}
                className={p === part ? "selected" : ""}
                onClick={() => setPart(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="exercise-picker">
            {exerciseLibrary
              .filter(
                (e) =>
                  (part === "全部" || e.part === part) &&
                  e.name.includes(search),
              )
              .map((e) => (
                <button
                  key={e.name}
                  onClick={() => add(e.name, e.part, e.kind)}
                >
                  <span className="exercise-icon">
                    <Dumbbell size={18} />
                  </span>
                  <span>
                    <strong>{e.name}</strong>
                    <small>
                      {e.part} ·{" "}
                      {previous(e.name)
                        ? "沿用上次组数与重量"
                        : e.kind === "cardio"
                          ? "有氧训练"
                          : "力量训练"}
                    </small>
                  </span>
                  <Plus size={18} />
                </button>
              ))}
          </div>
          {!exerciseLibrary.some(
            (e) =>
              (part === "全部" || e.part === part) && e.name.includes(search),
          ) && (
            <div className="empty-state">
              <p>没有找到这个动作</p>
              <button
                className="text-button"
                onClick={() => {
                  setCustom(true);
                  setName(search);
                }}
              >
                添加自定义动作
                <Plus size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function NoteForm({
  note,
  action,
  date,
  actions,
  save,
  remove,
}: {
  note?: Note;
  action?: string;
  date: string;
  actions: string[];
  save: (n: Note) => void;
  remove: () => void;
}) {
  const key = `lianji-draft-note-${date}-${note?.id || action || "general"}`;
  const draft = () => {
    try {
      return JSON.parse(
        sessionStorage.getItem(key) || "null",
      ) as Partial<Note> | null;
    } catch {
      return null;
    }
  };
  const [title, setTitle] = useState(note?.title || draft()?.title || "");
  const [text, setText] = useState(note?.text || draft()?.text || "");
  const [linked, setLinked] = useState(
    note?.action || action || draft()?.action || "",
  );
  const [pinned, setPinned] = useState(note?.pinned || false);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ title, text, action: linked }),
      );
    } catch {}
  }, [key, title, text, linked]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !text.trim()) return;
        save({
          id: note?.id || uid(),
          title: title.trim(),
          text: text.trim(),
          action: linked.trim(),
          date: note?.date || date,
          pinned,
        });
        sessionStorage.removeItem(key);
      }}
    >
      <label className="form-field">
        一句话记住重点
        <input
          required
          maxLength={100}
          placeholder="比如：卧推先收紧肩胛"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="form-field">
        具体要点
        <textarea
          required
          maxLength={4000}
          rows={5}
          placeholder="动作要领、容易犯的错误、老师的提醒……"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="form-field">
        关联动作 <span className="optional">选填</span>
        <input
          list="note-actions"
          maxLength={80}
          placeholder="不关联动作，作为课堂笔记"
          value={linked}
          onChange={(e) => setLinked(e.target.value)}
        />
        <datalist id="note-actions">
          {actions.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
        />
        <Sparkles size={15} />
        标记为重点
      </label>
      <div className="form-actions">
        {note && (
          <button
            type="button"
            className="button danger subtle"
            onClick={remove}
          >
            <Trash2 size={15} />
            删除
          </button>
        )}
        <button type="submit" className="button primary">
          <Check size={16} />
          保存要点
        </button>
      </div>
    </form>
  );
}
function WaterForm({ save }: { save: (amount: number) => void }) {
  const [amount, setAmount] = useState("250");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(amount);
        if (Number.isInteger(n) && n > 0 && n <= 5000) save(n);
      }}
    >
      <div className="water-form-icon">
        <GlassWater size={40} strokeWidth={1.3} />
      </div>
      <label className="form-field">
        饮水量（ml）
        <input
          autoFocus
          required
          type="number"
          inputMode="numeric"
          min="1"
          max="5000"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <div className="water-buttons form-quick">
        {[150, 250, 350, 500].map((v) => (
          <button key={v} type="button" onClick={() => setAmount(String(v))}>
            {v} ml
          </button>
        ))}
      </div>
      <button className="button primary full" type="submit">
        <Plus size={16} />
        记录饮水
      </button>
    </form>
  );
}
function SettingsForm({
  settings,
  demo,
  save,
  exportBackup,
  importBackup,
}: {
  settings: Journal["settings"];
  demo: boolean;
  save: (s: Journal["settings"]) => void;
  exportBackup: () => void;
  importBackup: () => void;
}) {
  const [name, setName] = useState(settings.name);
  const [goal, setGoal] = useState(String(settings.waterGoal));
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({ name: name.trim() || "我", waterGoal: Number(goal) });
        }}
      >
        <label className="form-field">
          称呼
          <input
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="form-field">
          每日饮水目标（ml）
          <input
            required
            type="number"
            min="100"
            max="10000"
            step="1"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <button type="submit" className="button primary full">
          <Check size={16} />
          保存设置
        </button>
      </form>
      <div className="settings-backup">
        <h3>我的数据</h3>
        <p>
          记录与照片保存在当前浏览器，尚未连接云端。清除浏览器数据或更换设备前，请导出备份。
        </p>
        <button className="settings-row" onClick={exportBackup}>
          <ArrowDownToLine size={18} />
          <span>
            <strong>导出完整备份</strong>
            <small>
              {demo
                ? "导出你的真实记录，不包含示例"
                : "JSON 文件，包含记录与餐食照片"}
            </small>
          </span>
          <ChevronRight size={16} />
        </button>
        <button className="settings-row" onClick={importBackup}>
          <ArrowUpFromLine size={18} />
          <span>
            <strong>从备份恢复</strong>
            <small>导入前可确认，将替换当前记录</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {});
  });
}
