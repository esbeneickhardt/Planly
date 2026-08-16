/**
 * Core data context that owns the product list, active product selection, and task list.
 * `patchTaskPositions` updates canvas coordinates in the local cache without an API round-trip.
 * Subscribes to WebSocket task events via `useRealtimeUpdates` and resets tasks when the active product changes.
 */
import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { api } from '../api/client';
import type { Product, Task } from '../types';
import { useAuth } from './AuthContext';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';

export interface RealtimeEvent {
  event: string;
  data?: unknown;
  ts?: number;
  fromApi?: boolean;
}

interface ProductContextValue {
  products: Product[];
  activeProduct: Product | null;
  productsLoaded: boolean;
  tasks: Task[];
  tasksLoaded: boolean;
  setActiveProduct: (p: Product) => void;
  refreshTasks: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  createProduct: (data: { name: string; emoji?: string; description?: string; deadline: string }) => Promise<Product>;
  createTask: (data: {
    name: string;
    description?: string;
    ownerId?: string;
    color?: string;
    deadline?: string;
  }) => Promise<Task>;
  patchTaskPositions: (updates: { taskId: string; canvasX: number; canvasY: number }[]) => void;
  patchMilestoneOrder: (updates: { taskId: string; order: number }[]) => void;
  addRealtimeListener: (fn: (e: RealtimeEvent) => void) => () => void;
}

const ProductContext = createContext<ProductContextValue | null>(null);

const STORAGE_KEY = 'planly_active_product_id';

export function ProductProvider({ children }: { children: ReactNode }) {
  // State
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [activeProduct, setActiveProductState] = useState<Product | null>(null);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);

  const refreshProducts = useCallback(async () => {
    try {
      const ps = await api.products.list();
      // Guard: if the response is not an array (e.g., unexpected 204 from API client),
      // keep existing product state but still mark as loaded so permission guards don't spin forever.
      if (!Array.isArray(ps)) {
        setProductsLoaded(true);
        return;
      }
      setProducts(ps);
      setActiveProductState((prev) => {
        if (prev) return ps.find((p) => p.id === prev.id) ?? ps[0] ?? null;
        const savedId = localStorage.getItem(STORAGE_KEY);
        const saved = savedId ? ps.find((p) => p.id === savedId) : null;
        return saved ?? ps[0] ?? null;
      });
      setProductsLoaded(true);
    } catch {
      setProductsLoaded(true);
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    if (!activeProduct) return;
    try {
      const ts = await api.tasks.list(activeProduct.id);
      if (!Array.isArray(ts)) return;
      setTasks(ts);
      setTasksLoaded(true);
    } catch (err) {
      // Swallow so a transient failure (rate limit, network blip) never crashes an awaiting
      // caller or an unattended WS-triggered refresh; the last good task list stays on screen.
      console.error('Failed to refresh tasks', err);
    }
  }, [activeProduct]);

  // Update canvas positions in the local task cache without a round-trip.
  // Called after drag-stop and auto-layout so the next mount reads correct positions.
  const patchTaskPositions = useCallback((updates: { taskId: string; canvasX: number; canvasY: number }[]) => {
    const map = new Map(updates.map((u) => [u.taskId, u]));
    setTasks((prev) =>
      prev.map((t) => {
        const u = map.get(t.id);
        return u ? { ...t, canvasX: u.canvasX, canvasY: u.canvasY } : t;
      }),
    );
  }, []);

  // Update milestone sort order in the local task cache without a round-trip. Called after a
  // milestone drag in either Gantt or Kanban, since both write to the same shared Task.milestoneOrder
  // field and both read `tasks` from this same context.
  const patchMilestoneOrder = useCallback((updates: { taskId: string; order: number }[]) => {
    const map = new Map(updates.map((u) => [u.taskId, u.order]));
    setTasks((prev) => prev.map((t) => (map.has(t.id) ? { ...t, milestoneOrder: map.get(t.id)! } : t)));
  }, []);

  // Extra listeners registered by child components to receive WS events without a second connection
  const listenersRef = useRef<Set<(e: RealtimeEvent) => void>>(new Set());
  const addRealtimeListener = useCallback((fn: (e: RealtimeEvent) => void) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  // Debounced refreshTasks for API-sourced events (300ms): bulk imports collapse into one fetch.
  const [refreshTasksDebounced] = useDebouncedCallback(refreshTasks, 300);

  // Debounced refreshTasks for browser-sourced events (80ms): fast enough to feel instant for a
  // single action, but collapses parallel bulk-update WS events into one fetch so the UI doesn't
  // freeze when the user bulk-assigns status/owner across many tasks at once.
  const [refreshTasksQuick] = useDebouncedCallback(refreshTasks, 80);

  // Realtime: refresh task list on task events and on reconnect (to catch up on missed broadcasts).
  // Both paths are debounced — API events at 300ms (import floods), browser events at 80ms
  // (single actions still feel instant; bulk parallel updates collapse into one fetch).
  // ws.reconnected always refreshes immediately to catch up on missed broadcasts.
  useRealtimeUpdates(
    activeProduct?.id,
    useCallback(
      (e) => {
        if (e.event === 'ws.reconnected') {
          refreshTasks();
        } else if (
          e.event === 'task.created' ||
          e.event === 'task.updated' ||
          e.event === 'task.deleted' ||
          e.event === 'task.status_changed' ||
          e.event === 'task.assigned' ||
          e.event === 'task.bulk_updated' ||
          e.event === 'task.bulk_deleted'
        ) {
          if (e.fromApi) {
            refreshTasksDebounced();
          } else {
            refreshTasksQuick();
          }
        }
        listenersRef.current.forEach((fn) => fn(e));
      },
      [refreshTasks, refreshTasksDebounced, refreshTasksQuick],
    ),
  );

  // Effects: load products on login; reload tasks when active product changes
  useEffect(() => {
    if (user) refreshProducts();
  }, [user, refreshProducts]);

  useEffect(() => {
    if (activeProduct) refreshTasks();
    else setTasks([]);
  }, [activeProduct, refreshTasks]);

  // Actions - wrapped in useCallback (rather than plain function declarations) so the memoized
  // value below only builds a new object when a field it actually contains has changed, not on
  // every render (this context re-renders often: debounced WS task updates land via `tasks`).
  const setActiveProduct = useCallback(
    (p: Product) => {
      if (activeProduct?.id === p.id) return;
      localStorage.setItem(STORAGE_KEY, p.id);
      setActiveProductState(p);
      setTasks([]);
      setTasksLoaded(false);
    },
    [activeProduct],
  );

  const createProduct = useCallback(
    async (data: { name: string; emoji?: string; description?: string; deadline: string }) => {
      const team = await api.teams.create({ name: `${data.name} Team` });
      const product = await api.products.create({ ...data, teamId: team.id });
      await refreshProducts();
      localStorage.setItem(STORAGE_KEY, product.id);
      setActiveProductState(product);
      return product;
    },
    [refreshProducts],
  );

  const createTask = useCallback(
    async (data: { name: string; description?: string; ownerId?: string; color?: string; deadline?: string }) => {
      if (!activeProduct) throw new Error('No active product');
      const task = await api.tasks.create(activeProduct.id, data);
      await refreshTasks();
      return task;
    },
    [activeProduct, refreshTasks],
  );

  // Memoized so consumers only re-render when a field they actually read changes, instead of on
  // every ProductProvider render - see file header. `products`/`tasks` are the fields most likely
  // to actually change per render (WS-driven), everything else is comparatively stable.
  const value = useMemo(
    () => ({
      products,
      activeProduct,
      productsLoaded,
      tasks,
      tasksLoaded,
      setActiveProduct,
      refreshTasks,
      refreshProducts,
      createProduct,
      createTask,
      patchTaskPositions,
      patchMilestoneOrder,
      addRealtimeListener,
    }),
    [
      products,
      activeProduct,
      productsLoaded,
      tasks,
      tasksLoaded,
      setActiveProduct,
      refreshTasks,
      refreshProducts,
      createProduct,
      createTask,
      patchTaskPositions,
      patchMilestoneOrder,
      addRealtimeListener,
    ],
  );

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProduct() {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error('useProduct must be used within ProductProvider');
  return ctx;
}
