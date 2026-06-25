import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api } from '../api/client';
import type { Product, Task } from '../types';
import { useAuth } from './AuthContext';

interface ProductContextValue {
  products: Product[];
  activeProduct: Product | null;
  tasks: Task[];
  setActiveProduct: (p: Product) => void;
  refreshTasks: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  createProduct: (data: { name: string; emoji?: string; description?: string; deadline: string }) => Promise<Product>;
  createTask: (data: { name: string; description?: string; ownerId?: string; color?: string; deadline?: string }) => Promise<Task>;
  patchTaskPositions: (updates: { taskId: string; canvasX: number; canvasY: number }[]) => void;
}

const ProductContext = createContext<ProductContextValue | null>(null);

export function ProductProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [activeProduct, setActiveProductState] = useState<Product | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  const refreshProducts = useCallback(async () => {
    const ps = await api.products.list();
    setProducts(ps);
    setActiveProductState((prev) => {
      if (prev) return ps.find((p) => p.id === prev.id) ?? ps[0] ?? null;
      return ps[0] ?? null;
    });
  }, []);

  const refreshTasks = useCallback(async () => {
    if (!activeProduct) return;
    const ts = await api.tasks.list(activeProduct.id);
    setTasks(ts);
  }, [activeProduct]);

  // Update canvas positions in the local task cache without a round-trip.
  // Called after drag-stop and auto-layout so the next mount reads correct positions.
  const patchTaskPositions = useCallback((updates: { taskId: string; canvasX: number; canvasY: number }[]) => {
    const map = new Map(updates.map((u) => [u.taskId, u]));
    setTasks((prev) => prev.map((t) => {
      const u = map.get(t.id);
      return u ? { ...t, canvasX: u.canvasX, canvasY: u.canvasY } : t;
    }));
  }, []);

  useEffect(() => {
    if (user) refreshProducts();
  }, [user, refreshProducts]);

  useEffect(() => {
    if (activeProduct) refreshTasks();
    else setTasks([]);
  }, [activeProduct, refreshTasks]);

  function setActiveProduct(p: Product) {
    if (activeProduct?.id === p.id) return;
    setActiveProductState(p);
    setTasks([]);
  }

  async function createProduct(data: { name: string; emoji?: string; description?: string; deadline: string }) {
    const team = await api.teams.create({ name: `${data.name} Team`, memberIds: user ? [user.id] : [] });
    const product = await api.products.create({ ...data, teamId: team.id });
    await refreshProducts();
    setActiveProductState(product);
    return product;
  }

  async function createTask(data: { name: string; description?: string; ownerId?: string; color?: string; deadline?: string }) {
    if (!activeProduct) throw new Error('No active product');
    const task = await api.tasks.create(activeProduct.id, data);
    await refreshTasks();
    return task;
  }

  return (
    <ProductContext.Provider value={{ products, activeProduct, tasks, setActiveProduct, refreshTasks, refreshProducts, createProduct, createTask, patchTaskPositions }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProduct() {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error('useProduct must be used within ProductProvider');
  return ctx;
}
