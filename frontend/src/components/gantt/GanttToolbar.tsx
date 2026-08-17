/**
 * Desktop Gantt's sticky column header: the milestones/sub-plans view toggle + hide-done filter
 * (left, sized to the draggable name column) and the time-axis labels + zoom controls (right,
 * over the timeline). Split out of GanttPage.tsx as a pure "given the current view window, render
 * the controls for it" component - all the state it mutates (view mode, hide-done, zoom/pan) is
 * still owned by GanttPage/useGanttDragZoom and passed down.
 */
import { pct } from '../../utils/gantt';
import Tooltip from '../common/Tooltip';

type GanttView = 'milestones' | 'sprints';

interface Props {
  sidebarWidth: number;
  ganttView: GanttView;
  setGanttView: (v: GanttView) => void;
  doneCount: number;
  hideDone: boolean;
  onToggleHideDone: () => void;
  vs: Date;
  ve: Date;
  markers: { date: Date; label: string }[];
  todayPct: number;
  isFullView: boolean;
  applyZoom: (factor: number) => void;
  onFit: () => void;
}

export default function GanttToolbar({
  sidebarWidth,
  ganttView,
  setGanttView,
  doneCount,
  hideDone,
  onToggleHideDone,
  vs,
  ve,
  markers,
  todayPct,
  isFullView,
  applyZoom,
  onFit,
}: Props) {
  return (
    <div
      className="flex flex-shrink-0"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      {/* Left: view toggle + hide-done */}
      <div
        className="flex-shrink-0 px-3 flex flex-col justify-center gap-1"
        style={{
          width: sidebarWidth,
          borderRight: '1px solid var(--border)',
          minHeight: 44,
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--surface-2)' }}>
            <Tooltip content="Tasks with deadlines plotted as progress markers" side="bottom">
              <button
                onClick={() => setGanttView('milestones')}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  background: ganttView === 'milestones' ? 'var(--brand-subtle)' : 'transparent',
                  color: ganttView === 'milestones' ? 'var(--brand)' : 'var(--text-3)',
                  border: `1px solid ${ganttView === 'milestones' ? 'var(--brand)' : 'transparent'}`,
                }}
              >
                Milestones
              </button>
            </Tooltip>
            <Tooltip content="Sprint windows plotted as time bars" side="bottom">
              <button
                onClick={() => setGanttView('sprints')}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  background: ganttView === 'sprints' ? 'var(--brand-subtle)' : 'transparent',
                  color: ganttView === 'sprints' ? 'var(--brand)' : 'var(--text-3)',
                  border: `1px solid ${ganttView === 'sprints' ? 'var(--brand)' : 'transparent'}`,
                }}
              >
                Sub-plans
              </button>
            </Tooltip>
          </div>
          {ganttView === 'milestones' && doneCount > 0 && (
            <Tooltip content={hideDone ? 'Show completed milestones' : 'Hide completed milestones'} side="bottom">
              <button
                onClick={onToggleHideDone}
                className="flex items-center gap-1 text-[10px] font-medium transition-all"
                style={{ color: hideDone ? 'var(--text-3)' : '#10b981' }}
              >
                <span>{hideDone ? '○' : '✓'}</span>
                {hideDone ? `${doneCount} hidden` : `${doneCount} done`}
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      {/* Right: Time axis + zoom controls */}
      <div className="flex-1 relative overflow-hidden" style={{ paddingLeft: 8, paddingRight: 110 }}>
        <div className="absolute top-0 right-0 h-full flex items-center gap-0.5 pr-2" style={{ zIndex: 3 }}>
          <Tooltip content="Zoom in" side="bottom">
            <button
              onClick={() => applyZoom(0.5)}
              className="w-6 h-6 rounded flex items-center justify-center text-sm font-semibold hover:opacity-80 transition-opacity"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              +
            </button>
          </Tooltip>
          <Tooltip content="Zoom out" side="bottom">
            <button
              onClick={() => applyZoom(2)}
              disabled={isFullView}
              className="w-6 h-6 rounded flex items-center justify-center text-sm font-semibold hover:opacity-80 transition-opacity disabled:opacity-30"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              −
            </button>
          </Tooltip>
          <Tooltip content="Fit full project timeline" side="bottom">
            <button
              onClick={onFit}
              disabled={isFullView}
              className="h-6 px-1.5 rounded text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-30"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              Fit
            </button>
          </Tooltip>
        </div>
        {markers.map((marker) => {
          const pos = pct(marker.date, vs, ve) * 100;
          if (pos < 0 || pos > 90) return null;
          return (
            <div
              key={marker.date.toISOString()}
              className="absolute top-0 h-full flex items-end pb-2"
              style={{ left: `${pos}%`, paddingLeft: 4, pointerEvents: 'none' }}
            >
              <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                {marker.label}
              </span>
            </div>
          );
        })}
        {todayPct > 0 && todayPct < 1 && (
          <div
            className="absolute top-0 h-full flex items-end pb-1.5"
            style={{
              left: `${todayPct * 100}%`,
              zIndex: 2,
              pointerEvents: 'none',
            }}
          >
            <span
              className="text-[10px] font-semibold px-1 rounded"
              style={{ background: 'var(--brand)', color: 'white' }}
            >
              Today
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
