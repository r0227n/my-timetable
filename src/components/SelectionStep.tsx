import { AlertTriangle, Check, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { detectConflicts, findInvalidTimeRangeIds } from "../domain/conflicts";
import { scheduleTypeLabels, type ScheduleType, type TimetableDocument } from "../domain/timetable";

interface SelectionStepProps {
  document: TimetableDocument;
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  onBack: () => void;
  onNext: () => void;
}

export function SelectionStep({ document, selected, onSelectedChange, onBack, onNext }: SelectionStepProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [type, setType] = useState<ScheduleType | "all">("all");
  const [stage, setStage] = useState("all");
  const [buffer, setBuffer] = useState(10);
  const stages = useMemo(
    () => [...new Set(document.schedules.map((item) => item.stage).filter(Boolean))] as string[],
    [document.schedules],
  );
  const filtered = useMemo(
    () =>
      document.schedules.filter(
        (item) =>
          item.artist.toLocaleLowerCase().includes(deferredQuery.toLocaleLowerCase()) &&
          (type === "all" || item.type === type) &&
          (stage === "all" || item.stage === stage),
      ),
    [deferredQuery, document.schedules, stage, type],
  );
  const selectedItems = document.schedules.filter((item) => selected.has(item.id));
  const conflicts = detectConflicts(selectedItems, buffer);
  const invalidTimeRanges = findInvalidTimeRangeIds(selectedItems);
  const conflictIds = new Set([
    ...conflicts.flatMap((item) => [item.firstId, item.secondId]),
    ...invalidTimeRanges,
  ]);
  const artists = [...new Set(filtered.map((item) => item.artist))];

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };
  const toggleArtist = (artist: string) => {
    const ids = document.schedules.filter((item) => item.artist === artist).map((item) => item.id);
    const allSelected = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
    onSelectedChange(next);
  };

  return (
    <main className="workspace-shell selection-shell">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">05 / SELECT</span>
          <h1>行きたい予定を選ぶ</h1>
          <p>出演者をまとめて、または予定ごとに選べます。時間の重なりもここで確認できます。</p>
        </div>
        <div className="selected-badge">
          <strong>{selected.size}</strong>
          <span>件選択中</span>
        </div>
      </div>
      <section className="filter-bar panel">
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="出演者名を検索"
            aria-label="出演者名を検索"
          />
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ScheduleType | "all")}
          aria-label="種別で絞り込み"
        >
          <option value="all">すべての種別</option>
          {Object.entries(scheduleTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="ステージで絞り込み">
          <option value="all">すべてのステージ</option>
          {stages.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button
          className="small-button"
          type="button"
          onClick={() => onSelectedChange(new Set([...selected, ...filtered.map((item) => item.id)]))}
        >
          表示中を全選択
        </button>
        <button className="text-button" type="button" onClick={() => onSelectedChange(new Set())}>
          全解除
        </button>
      </section>
      <div className="selection-layout">
        <section className="artist-list">
          {artists.length ? (
            artists.map((artist) => {
              const items = filtered.filter((item) => item.artist === artist);
              const allSelected = items.every((item) => selected.has(item.id));
              return (
                <article className="artist-group panel" key={artist}>
                  <header>
                    <label className="artist-check">
                      <input type="checkbox" checked={allSelected} onChange={() => toggleArtist(artist)} />
                      <span className="custom-check">{allSelected ? <Check size={14} /> : null}</span>
                      <strong>{artist || "名称未入力"}</strong>
                    </label>
                    <span>{items.length}予定</span>
                  </header>
                  <div className="schedule-cards">
                    {items
                      .toSorted((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"))
                      .map((item) => (
                        <label
                          className={`schedule-card ${selected.has(item.id) ? "selected" : ""} ${conflictIds.has(item.id) ? "conflict" : ""}`}
                          key={item.id}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggle(item.id)}
                          />
                          <span className={`type-stripe ${item.type}`} />
                          <span className="schedule-time">
                            {item.startTime ?? "未定"}
                            <small>{item.endTime ? `– ${item.endTime}` : ""}</small>
                          </span>
                          <span className="schedule-meta">
                            <strong>{scheduleTypeLabels[item.type]}</strong>
                            <small>
                              {[item.stage, item.booth].filter(Boolean).join(" / ") || "場所未設定"}
                            </small>
                          </span>
                          {conflictIds.has(item.id) ? (
                            <AlertTriangle
                              size={18}
                              aria-label={
                                invalidTimeRanges.has(item.id)
                                  ? "終了時刻が開始時刻以前です"
                                  : "時間が重複しています"
                              }
                            />
                          ) : null}
                        </label>
                      ))}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state panel">条件に一致する予定がありません。</div>
          )}
        </section>
        <aside className="selection-summary panel">
          <span className="eyebrow">YOUR DAY</span>
          <h2>選択した予定</h2>
          {selectedItems.length ? (
            <ol>
              {selectedItems
                .toSorted((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"))
                .map((item) => (
                  <li key={item.id}>
                    <time>{item.startTime ?? "未定"}</time>
                    <span>
                      <strong>{item.artist}</strong>
                      <small>
                        {scheduleTypeLabels[item.type]} · {item.stage ?? item.booth ?? "場所未定"}
                      </small>
                    </span>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="muted">左の一覧から予定を選んでください。</p>
          )}
          <label className="buffer-control">
            <span>移動時間の余裕</span>
            <select value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}>
              <option value={0}>なし</option>
              <option value={5}>5分</option>
              <option value={10}>10分</option>
              <option value={15}>15分</option>
              <option value={30}>30分</option>
            </select>
          </label>
          {conflicts.length || invalidTimeRanges.size ? (
            <div className="conflict-box">
              <AlertTriangle size={18} />
              <span>
                <strong>{conflicts.length + invalidTimeRanges.size}件の注意</strong>
                {invalidTimeRanges.size
                  ? "終了時刻が開始時刻以前の予定があります。"
                  : "予定の重なり、または移動時間が不足しています。"}
              </span>
            </div>
          ) : selected.size ? (
            <div className="safe-box">
              <Check size={17} /> 時間の重なりはありません
            </div>
          ) : null}
        </aside>
      </div>
      <div className="footer-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          確認へ戻る
        </button>
        <button className="primary-button" type="button" disabled={!selected.size} onClick={onNext}>
          タイムラインを作る
        </button>
      </div>
    </main>
  );
}
