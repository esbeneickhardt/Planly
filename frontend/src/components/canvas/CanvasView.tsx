import { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  BackgroundVariant,
  ReactFlowProvider,
  Panel,
} from 'reactflow';
import dagre from '@dagrejs/dagre';
import 'reactflow/dist/style.css';
import { useProduct } from '../../context/ProductContext';
import { api } from '../../api/client';
import type { Task } from '../../types';
import TaskNode from './nodes/TaskNode';
import ProductNode from './nodes/ProductNode';
import TaskDetailPanel from '../common/TaskDetailPanel';
import Modal from '../common/Modal';

const nodeTypes = { task: TaskNode, product: ProductNode };

interface CtxMenu { x: number; y: number; edgeId: string; srcId: string; tgtId: string; }

function connKey(productId: string) { return `planly-product-connections-${productId}`; }

function loadConnections(productId: string): Set<string> {
  try {
    const stored = localStorage.getItem(connKey(productId));
    return new Set(stored ? JSON.parse(stored) : []);
  } catch { return new Set(); }
}

function saveConnections(productId: string, conns: Set<string>) {
  localStorage.setItem(connKey(productId), JSON.stringify([...conns]));
}

function buildGraph(
  tasks: Task[],
  product: { id: string; name: string; emoji?: string; deadline: string },
  productConnections: Set<string>,
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: `product-${product.id}`,
    type: 'product',
    position: { x: 900, y: 300 },
    data: { name: product.name, emoji: product.emoji, deadline: product.deadline },
    deletable: false,
  });

  tasks.forEach((t) => {
    nodes.push({
      id: t.id,
      type: 'task',
      position: { x: t.canvasX ?? 0, y: t.canvasY ?? 0 },
      data: t,
    });
    t.dependsOn.forEach((dep) => {
      edges.push({
        id: `${dep.prerequisiteId}->${t.id}`,
        source: dep.prerequisiteId,
        target: t.id,
        type: 'smoothstep',
        style: { stroke: 'var(--border-2)', strokeWidth: 2 },
      });
    });
  });

  productConnections.forEach((taskId) => {
    if (tasks.find((t) => t.id === taskId)) {
      edges.push({
        id: `${taskId}->product-${product.id}`,
        source: taskId,
        target: `product-${product.id}`,
        type: 'smoothstep',
        style: { stroke: 'var(--brand)', strokeWidth: 2 },
      });
    }
  });

  return { nodes, edges };
}

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 70 });
  nodes.forEach((n) => g.setNode(n.id, { width: 200, height: 80 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 100, y: pos.y - 40 } };
  });
}

function CanvasInner() {
  const { activeProduct, tasks, refreshTasks } = useProduct();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [toast, setToast] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [creating, setCreating] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  // Tracks which product has had its initial layout applied this session
  const initializedRef = useRef<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000); }

  // Build / update the graph whenever tasks or the active product change
  useEffect(() => {
    if (!activeProduct) return;
    const productConnections = loadConnections(activeProduct.id);
    const { nodes: n, edges: e } = buildGraph(tasks, activeProduct, productConnections);
    setEdges(e);

    if (initializedRef.current !== activeProduct.id) {
      // First load for this product — position nodes
      initializedRef.current = activeProduct.id;
      const unpositioned = tasks.filter((t) => t.canvasX == null);
      if (unpositioned.length > 0) {
        const laid = autoLayout(n, e);
        setNodes(laid);
        // Persist auto-layout positions so they're stable on next visit
        unpositioned.forEach(async (task) => {
          const node = laid.find((nd) => nd.id === task.id);
          if (!node) return;
          await fetch(`/api/products/${activeProduct.id}/tasks/${task.id}/position`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: node.position.x, y: node.position.y }),
          });
        });
      } else {
        setNodes(n);
      }
    } else {
      // Subsequent refresh — keep current node positions, only update data
      setNodes((curr) => {
        const byId = new Map(curr.map((nd) => [nd.id, nd]));
        return n.map((nn) => {
          const existing = byId.get(nn.id);
          return existing ? { ...existing, data: nn.data } : nn;
        });
      });
    }
  }, [tasks, activeProduct, setNodes, setEdges]);

  const onPaneClick = useCallback(() => setCtxMenu(null), []);

  const onConnect = useCallback(async (connection: Connection) => {
    setCtxMenu(null);
    if (!activeProduct || !connection.source || !connection.target) return;
    const sourceId = connection.source;
    const targetId = connection.target;

    // Task → product (or product → task) — saved in localStorage
    if (sourceId.startsWith('product-') || targetId.startsWith('product-')) {
      const taskId = sourceId.startsWith('product-') ? targetId : sourceId;
      const conns = loadConnections(activeProduct.id);
      conns.add(taskId);
      saveConnections(activeProduct.id, conns);
      setEdges((eds) => addEdge({
        id: `${taskId}->product-${activeProduct.id}`,
        source: taskId,
        target: `product-${activeProduct.id}`,
        type: 'smoothstep' as const,
        style: { stroke: 'var(--brand)', strokeWidth: 2 },
      }, eds));
      return;
    }

    // Task → task dependency
    try {
      const res = await fetch(`/api/products/${activeProduct.id}/tasks/${targetId}/dependencies`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerequisiteId: sourceId }),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? 'Failed'); }
      setEdges((eds) => addEdge({ ...connection, id: `${sourceId}->${targetId}`, type: 'smoothstep', style: { stroke: 'var(--border-2)', strokeWidth: 2 } }, eds));
      await refreshTasks();
    } catch (err) { showToast((err as Error).message); }
  }, [activeProduct, setEdges, refreshTasks]);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    const parts = edge.id.split('->');
    const srcId = parts[0];
    const tgtId = parts.slice(1).join('->'); // handle 'taskId->product-uuid'
    if (!srcId || !tgtId) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id, srcId, tgtId });
  }, []);

  async function deleteEdge(srcId: string, tgtId: string, edgeId: string) {
    setCtxMenu(null);

    // Product connection edge
    if (tgtId.startsWith('product-') || srcId.startsWith('product-')) {
      const taskId = tgtId.startsWith('product-') ? srcId : tgtId;
      const conns = loadConnections(activeProduct?.id ?? '');
      conns.delete(taskId);
      saveConnections(activeProduct?.id ?? '', conns);
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      return;
    }

    if (!activeProduct) return;
    try {
      const res = await fetch(`/api/products/${activeProduct.id}/tasks/${tgtId}/dependencies/${srcId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to remove dependency');
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      await refreshTasks();
    } catch (err) { showToast((err as Error).message); }
  }

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setCtxMenu(null);
    if (node.id.startsWith('product-')) return;
    const task = tasks.find((t) => t.id === node.id);
    if (task) setSelectedTask(task);
  }, [tasks]);

  const onNodeDragStop = useCallback(async (_: React.MouseEvent, node: Node) => {
    if (!activeProduct || node.id.startsWith('product-')) return;
    await fetch(`/api/products/${activeProduct.id}/tasks/${node.id}/position`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: node.position.x, y: node.position.y }),
    });
  }, [activeProduct]);

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskName.trim() || !activeProduct) return;
    setCreating(true);
    try {
      await api.tasks.create(activeProduct.id, { name: newTaskName.trim() });
      await refreshTasks();
      setNewTaskName('');
      setShowNewTask(false);
    } finally { setCreating(false); }
  }

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">◈</div>
        <p className="text-sm">Create a product to get started</p>
      </div>
    );
  }

  const isProductEdge = (srcId: string, tgtId: string) =>
    srcId.startsWith('product-') || tgtId.startsWith('product-');

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onClick={() => setCtxMenu(null)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: 'var(--border-2)', strokeWidth: 2 } }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={24} size={1.5} />
        <Controls style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
        <MiniMap
          nodeColor={(n) => n.id.startsWith('product-') ? 'var(--brand)' : 'var(--surface-2)'}
          maskColor="rgba(0,0,0,0.25)"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        />

        <Panel position="top-left">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {activeProduct.emoji && <span className="text-base">{activeProduct.emoji}</span>}
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{activeProduct.name}</span>
          </div>
          <p className="text-xs mt-2 px-1" style={{ color: 'var(--text-3)' }}>
            Drag handle → node to connect · Right-click edge to remove
          </p>
        </Panel>

        <Panel position="top-right">
          <div className="flex items-center gap-2">
            {toast && (
              <div className="text-sm px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                {toast}
              </div>
            )}
            <button onClick={() => setNodes((nds) => autoLayout(nds, edges))} className="btn-secondary text-xs">
              ◫ Auto-layout
            </button>
            <button onClick={() => setShowNewTask(true)} className="btn-primary text-xs flex items-center gap-1">
              + New task
            </button>
          </div>
        </Panel>
      </ReactFlow>

      {ctxMenu && (
        <div
          className="fixed rounded-lg shadow-xl z-50 py-1 overflow-hidden"
          style={{ left: ctxMenu.x, top: ctxMenu.y, background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 160 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
            {isProductEdge(ctxMenu.srcId, ctxMenu.tgtId) ? 'Product link' : 'Dependency edge'}
          </div>
          <button
            className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2"
            style={{ color: '#ef4444' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => deleteEdge(ctxMenu.srcId, ctxMenu.tgtId, ctxMenu.edgeId)}
          >
            <span>✕</span> Remove {isProductEdge(ctxMenu.srcId, ctxMenu.tgtId) ? 'link' : 'dependency'}
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm transition-colors"
            style={{ color: 'var(--text-2)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => setCtxMenu(null)}
          >
            Cancel
          </button>
        </div>
      )}

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={async (updated) => { setSelectedTask(updated); await refreshTasks(); }}
        />
      )}

      {showNewTask && (
        <Modal title="New task" onClose={() => setShowNewTask(false)} width="max-w-sm">
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <label className="label">Task name</label>
              <input autoFocus required type="text" value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} className="input" placeholder="What needs to be done?" />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Task appears on the canvas. Drag it into position and draw edges to connect dependencies.</p>
            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create task'}
              </button>
              <button type="button" onClick={() => setShowNewTask(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default function CanvasView() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
