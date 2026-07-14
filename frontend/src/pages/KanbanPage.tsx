/**
 * Thin wrapper that renders the KanbanBoard component full-height within the app shell.
 * All board state, drag-and-drop logic, and column management live inside KanbanBoard.
 */
import KanbanBoard from '../components/kanban/KanbanBoard';

export default function KanbanPage() {
  return <KanbanBoard />;
}
