/**
 * Desktop Gantt's timeline column: today-line, sub-plan (sprint) bars, milestone bars, and the
 * product/final-delivery bar, each with their resize handles. Pure rendering - the pan/zoom/resize
 * *interaction* (pointer capture, drag math, the `data-resize`/`data-resize-type` attributes these
 * handles expose) lives in `useGanttDragZoom` and is wired up by GanttPage on the wrapping element
 * this component renders inside of, so this file only ever reads the current view window and
 * hover state, never the drag machinery itself.
 */
import { isBeforeToday } from '../../utils/dates';
import { orderMilestones, pct } from '../../utils/gantt';
import { STATUS_COLORS as STATUS_COLOR } from '../../utils/statusColors';
import type { MilestoneResult, Sprint } from '../../api/client';
import type { Task } from '../../types';
import { progressColor } from './GanttMobileList';

type GanttView = 'milestones' | 'sprints';

interface Props {
  ganttView: GanttView;
  vs: Date;
  ve: Date;
  sprints: Sprint[];
  tasks: Task[];
  visibleMilestones: MilestoneResult[];
  milestones: MilestoneResult[];
  readOnly: boolean;
  rowHeight: number;
  todayPct: number;
  fullEnd: Date;
  doneCount: number;
  hoveredSprint: string | null;
  setHoveredSprint: (id: string | null) => void;
  hoveredMilestone: string | null;
  setHoveredMilestone: (id: string | null) => void;
  hoveredProduct: boolean;
  setHoveredProduct: (v: boolean) => void;
  setSelectedTask: (task: Task | null) => void;
}

export default function GanttTimelineBars({
  ganttView,
  vs,
  ve,
  sprints,
  tasks,
  visibleMilestones,
  milestones,
  readOnly,
  rowHeight: ROW_H,
  todayPct,
  fullEnd,
  doneCount,
  hoveredSprint,
  setHoveredSprint,
  hoveredMilestone,
  setHoveredMilestone,
  hoveredProduct,
  setHoveredProduct,
  setSelectedTask,
}: Props) {
  const allDone = milestones.length > 0 && doneCount === milestones.length;
  const progressPct = milestones.length > 0 ? Math.round((doneCount / milestones.length) * 100) : 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Today line through all rows */}
      {todayPct > 0 && todayPct < 1 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${todayPct * 100}%`,
            width: 1,
            background: 'var(--brand)',
            zIndex: 3,
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Sprint bars - each sprint occupies one row.
          The bar is rendered as an absolute-positioned track (background) with a
          progress fill layered on top. Start/end resize handles use data-resize
          attributes which the useGanttDragZoom hook picks up via closest('[data-resize]'). */}
      {ganttView === 'sprints' &&
        sprints.map((s) => {
          const startPct = pct(new Date(s.startDate), vs, ve) * 100;
          const endPct = pct(new Date(s.endDate), vs, ve) * 100;
          const barWidth = Math.max(endPct - startPct, 0.5);
          const sprintTasks = tasks.filter((t) => s.taskIds.includes(t.id));
          const doneTasks = sprintTasks.filter((t) => t.status === 'done' || !!t.completedAt);
          const progress = sprintTasks.length > 0 ? doneTasks.length / sprintTasks.length : 0;
          return (
            <div
              key={s.id}
              className="relative flex items-center"
              style={{
                height: ROW_H,
                borderBottom: '1px solid var(--border)',
                background: hoveredSprint === s.id ? 'var(--surface-2)' : 'transparent',
              }}
              onMouseEnter={() => setHoveredSprint(s.id)}
              onMouseLeave={() => setHoveredSprint(null)}
            >
              {/* Bar track */}
              <div
                className="absolute rounded-full"
                style={{
                  left: `${startPct}%`,
                  width: `${barWidth}%`,
                  height: 8,
                  top: '50%',
                  marginTop: -4,
                  background: `${s.color}22`,
                  border: `1px solid ${s.color}55`,
                }}
              />
              {/* Progress fill */}
              {progress > 0 && (
                <div
                  className="absolute rounded-full"
                  style={{
                    left: `${startPct}%`,
                    width: `${barWidth * progress}%`,
                    height: 8,
                    top: '50%',
                    marginTop: -4,
                    background: s.color,
                    opacity: 0.7,
                  }}
                />
              )}
              {/* Sprint start-date resize handle */}
              {!readOnly && startPct >= 0 && startPct <= 100 && (
                <div
                  data-resize={s.id}
                  data-resize-type="sprint-start"
                  title={`Drag to change start date · ${new Date(s.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  style={{
                    position: 'absolute',
                    left: `${startPct}%`,
                    top: 0,
                    bottom: 0,
                    width: 16,
                    transform: 'translateX(-50%)',
                    zIndex: 6,
                    cursor: 'ew-resize',
                  }}
                />
              )}
              {/* Sprint end-date resize handle */}
              {!readOnly && endPct >= 0 && endPct <= 100 && (
                <div
                  data-resize={s.id}
                  data-resize-type="sprint"
                  title={`Drag to change end date · ${new Date(s.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  style={{
                    position: 'absolute',
                    left: `${endPct}%`,
                    top: 0,
                    bottom: 0,
                    width: 16,
                    transform: 'translateX(-50%)',
                    zIndex: 6,
                    cursor: 'ew-resize',
                  }}
                />
              )}
              {/* Hover popover */}
              {hoveredSprint === s.id && sprintTasks.length > 0 && (
                <div
                  className="absolute z-30 rounded-xl shadow-xl p-3"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    top: '100%',
                    left: `${startPct}%`,
                    minWidth: 200,
                    maxWidth: 280,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                    {doneTasks.length}/{sprintTasks.length} tasks complete
                  </p>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {sprintTasks.slice(0, 12).map((t) => {
                      const isDone = t.status === 'done' || !!t.completedAt;
                      return (
                        <button
                          key={t.id}
                          className="flex items-center gap-2 text-xs w-full text-left rounded px-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(t);
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{
                              background: STATUS_COLOR[t.status] ?? '#64748b',
                            }}
                          />
                          <span
                            className="flex-1 truncate"
                            style={{
                              color: 'var(--text)',
                              opacity: isDone ? 0.45 : 1,
                              textDecoration: isDone ? 'line-through' : 'none',
                            }}
                          >
                            {t.name}
                          </span>
                        </button>
                      );
                    })}
                    {sprintTasks.length > 12 && (
                      <p className="text-[10px] pt-1" style={{ color: 'var(--text-3)' }}>
                        +{sprintTasks.length - 12} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      {ganttView === 'sprints' && sprints.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
            }}
          >
            🗓
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
              No sub-plans on the timeline
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Sub-plans (sprints) appear as time windows here once created. Go to{' '}
              <strong style={{ color: 'var(--text-2)' }}>Execute</strong> and create a sprint to get started.
            </p>
          </div>
        </div>
      )}

      {/* Milestone bars */}
      {ganttView === 'milestones' &&
        visibleMilestones.map((m) => {
          const deadlinePct = pct(new Date(m.deadline), vs, ve) * 100;
          const fillWidth = m.progress * deadlinePct;
          const color = progressColor(m);
          const isOverdue = isBeforeToday(m.deadline) && m.status !== 'done';

          // Sort: active tasks first, done tasks at bottom
          const sortedDeps = [...m.dependencyList].sort((a, b) => {
            if (a.status === 'done' && b.status !== 'done') return 1;
            if (a.status !== 'done' && b.status === 'done') return -1;
            return 0;
          });

          return (
            <div
              key={m.id}
              className="relative flex items-center"
              style={{
                height: ROW_H,
                borderBottom: '1px solid var(--border)',
                background: hoveredMilestone === m.id ? 'var(--surface-2)' : 'transparent',
              }}
              onMouseEnter={() => setHoveredMilestone(m.id)}
              onMouseLeave={() => setHoveredMilestone(null)}
            >
              {/* Bar track */}
              <div
                className="absolute rounded-full"
                style={{
                  left: 0,
                  width: `${Math.max(deadlinePct, 1.5)}%`,
                  height: 8,
                  top: '50%',
                  marginTop: -4,
                  background: `${color}25`,
                  border: `1px solid ${color}40`,
                }}
              />
              {/* Progress fill */}
              {fillWidth > 0 && (
                <div
                  className="absolute rounded-full"
                  style={{
                    left: 0,
                    width: `${fillWidth}%`,
                    height: 8,
                    top: '50%',
                    marginTop: -4,
                    background: color,
                    opacity: 0.8,
                  }}
                />
              )}
              {/* Deadline marker - vertical line + diamond */}
              {deadlinePct >= 0 && deadlinePct <= 100 && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${deadlinePct}%`,
                    top: 6,
                    bottom: 6,
                    width: 0,
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: 2,
                      background: color,
                      opacity: 0.6,
                      transform: 'translateX(-50%)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: 0,
                      width: 7,
                      height: 7,
                      background: isOverdue ? '#ef4444' : color,
                      transform: 'translate(-50%, -50%) rotate(45deg)',
                      borderRadius: 1,
                    }}
                  />
                </div>
              )}
              {/* Resize handle - wide transparent hit target on the deadline */}
              {!readOnly && deadlinePct >= 0 && deadlinePct <= 100 && (
                <div
                  data-resize={m.id}
                  data-resize-type="milestone"
                  title={`Drag to change deadline · ${new Date(m.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  style={{
                    position: 'absolute',
                    left: `${deadlinePct}%`,
                    top: 0,
                    bottom: 0,
                    width: 20,
                    transform: 'translateX(-50%)',
                    zIndex: 6,
                    cursor: 'ew-resize',
                  }}
                />
              )}

              {/* Hover popover - flips above when near list bottom */}
              {hoveredMilestone === m.id && m.dependencyList.length > 0 && (
                <div
                  className="absolute z-30 rounded-xl shadow-xl p-3"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    top: '100%',
                    left: '2%',
                    minWidth: 220,
                    maxWidth: 300,
                  }}
                  onMouseEnter={() => setHoveredMilestone(m.id)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                    {m.doneDependencies}/{m.totalDependencies} tasks done
                  </p>
                  <div className="space-y-1 max-h-48 overflow-auto">
                    {sortedDeps.map((d, i) => {
                      const isDone = d.status === 'done';
                      const isFirstDone = isDone && (i === 0 || sortedDeps[i - 1]?.status !== 'done');
                      return (
                        <div key={d.id}>
                          {isFirstDone && m.doneDependencies > 0 && m.doneDependencies < m.totalDependencies && (
                            <div
                              className="text-[10px] uppercase tracking-wide pt-1 pb-0.5"
                              style={{ color: 'var(--text-3)' }}
                            >
                              Completed
                            </div>
                          )}
                          <button
                            className="flex items-center gap-2 text-xs w-full text-left rounded px-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              const t = tasks.find((t) => t.id === d.id);
                              if (t) setSelectedTask(t);
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{
                                background: STATUS_COLOR[d.status] ?? '#64748b',
                              }}
                            />
                            <span
                              className="flex-1 truncate"
                              style={{
                                color: 'var(--text)',
                                textDecoration: isDone ? 'line-through' : 'none',
                                opacity: isDone ? 0.45 : 1,
                              }}
                            >
                              {d.name}
                            </span>
                            {!d.ownerId && !isDone && (
                              <span
                                className="text-[10px] px-1 rounded flex-shrink-0"
                                style={{
                                  background: 'rgba(239,68,68,0.12)',
                                  color: '#ef4444',
                                }}
                              >
                                unassigned
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {m.unassignedDeps > 0 && (
                    <p
                      className="text-[11px] mt-2 pt-2"
                      style={{
                        color: '#f59e0b',
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      ⚠ {m.unassignedDeps} unassigned blocking
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

      {/* Product deadline row - milestones view only */}
      {ganttView === 'milestones' && (
        <div
          className="relative flex items-center"
          style={{
            height: ROW_H,
            borderBottom: '1px solid var(--border)',
            background: hoveredProduct ? 'var(--surface-2)' : 'transparent',
          }}
          onMouseEnter={() => setHoveredProduct(true)}
          onMouseLeave={() => setHoveredProduct(false)}
        >
          {/* Track */}
          <div
            className="absolute rounded-full"
            style={{
              left: 0,
              width: `${Math.max(pct(fullEnd, vs, ve) * 100, 1.5)}%`,
              height: 8,
              top: '50%',
              marginTop: -4,
              background: allDone ? 'rgba(16,185,129,0.15)' : 'rgba(124,58,237,0.15)',
              border: `1px solid ${allDone ? 'rgba(16,185,129,0.3)' : 'rgba(124,58,237,0.3)'}`,
            }}
          />
          {/* Progress fill */}
          {progressPct > 0 && (
            <div
              className="absolute rounded-full"
              style={{
                left: 0,
                width: `${Math.max(pct(fullEnd, vs, ve) * 100 * (progressPct / 100), 0)}%`,
                height: 8,
                top: '50%',
                marginTop: -4,
                background: allDone ? '#10b981' : 'var(--brand)',
                opacity: 0.75,
              }}
            />
          )}
          {pct(fullEnd, vs, ve) >= 0 && pct(fullEnd, vs, ve) <= 1 && (
            <div
              style={{
                position: 'absolute',
                left: `${pct(fullEnd, vs, ve) * 100}%`,
                top: 6,
                bottom: 6,
                width: 0,
                zIndex: 2,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: 2,
                  background: allDone ? '#10b981' : 'var(--brand)',
                  opacity: 0.6,
                  transform: 'translateX(-50%)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  width: 7,
                  height: 7,
                  background: allDone ? '#10b981' : 'var(--brand)',
                  transform: 'translate(-50%, -50%) rotate(45deg)',
                  borderRadius: 1,
                }}
              />
            </div>
          )}
          {!readOnly && pct(fullEnd, vs, ve) >= 0 && pct(fullEnd, vs, ve) <= 1 && (
            <div
              data-resize="product"
              data-resize-type="product"
              title={`Drag to change project deadline · ${fullEnd.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              style={{
                position: 'absolute',
                left: `${pct(fullEnd, vs, ve) * 100}%`,
                top: 0,
                bottom: 0,
                width: 20,
                transform: 'translateX(-50%)',
                zIndex: 6,
                cursor: 'ew-resize',
              }}
            />
          )}

          {/* Hover popover - milestone list (above the row) */}
          {hoveredProduct && milestones.length > 0 && (
            <div
              className="absolute z-30 rounded-xl shadow-xl p-3"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                top: '100%',
                left: '2%',
                minWidth: 220,
                maxWidth: 320,
              }}
              onMouseEnter={() => setHoveredProduct(true)}
            >
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                {doneCount}/{milestones.length} milestones complete
              </p>
              <div className="space-y-1 max-h-48 overflow-auto">
                {orderMilestones(milestones).map((m, i, arr) => {
                  const isDone = m.status === 'done';
                  const isFirstDone = isDone && (i === 0 || arr[i - 1]?.status !== 'done');
                  return (
                    <div key={m.id}>
                      {isFirstDone && doneCount > 0 && doneCount < milestones.length && (
                        <div
                          className="text-[10px] uppercase tracking-wide pt-1 pb-0.5"
                          style={{ color: 'var(--text-3)' }}
                        >
                          Completed
                        </div>
                      )}
                      <button
                        className="flex items-center gap-2 text-xs w-full text-left rounded px-0.5 hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          const t = tasks.find((t) => t.id === m.id);
                          if (t) setSelectedTask(t);
                        }}
                      >
                        {isDone ? (
                          <span
                            className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={{ background: '#10b981', color: 'white' }}
                          >
                            ✓
                          </span>
                        ) : (
                          <span
                            className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
                            style={{ borderColor: progressColor(m) }}
                          />
                        )}
                        <span
                          className="flex-1 truncate"
                          style={{
                            color: isDone ? 'var(--text-3)' : 'var(--text)',
                            textDecoration: isDone ? 'line-through' : 'none',
                            opacity: isDone ? 0.55 : 1,
                          }}
                        >
                          {m.name}
                        </span>
                        <span className="flex-shrink-0 text-[10px]" style={{ color: 'var(--text-3)' }}>
                          {new Date(m.deadline).toLocaleDateString('en', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {milestones.some(
                (m) => m.status !== 'done' && m.doneDependencies < m.totalDependencies && m.totalDependencies > 0,
              ) && (
                <p
                  className="text-[11px] mt-2 pt-2"
                  style={{
                    color: '#f59e0b',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  ⚠ Some milestones have incomplete tasks
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
