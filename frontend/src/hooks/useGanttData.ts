/**
 * useGanttData — loads milestones, sprints, and product data for the Gantt view.
 * Refreshes whenever the active product or tasks list changes.
 */
import { useState, useEffect, useRef } from 'react';
import { api, MilestoneResult, Sprint } from '../api/client';
import type { Product } from '../types';
import type { Task } from '../types';

interface GanttData {
  milestones: MilestoneResult[];
  sprints: Sprint[];
  product: Product | null;
  loading: boolean;
  setMilestones: React.Dispatch<React.SetStateAction<MilestoneResult[]>>;
  setSprints: React.Dispatch<React.SetStateAction<Sprint[]>>;
  setProduct: React.Dispatch<React.SetStateAction<Product | null>>;
  milestonesRef: React.MutableRefObject<MilestoneResult[]>;
  sprintsRef: React.MutableRefObject<Sprint[]>;
  productRef: React.MutableRefObject<Product | null>;
}

export function useGanttData(
  activeProduct: Product | null,
  tasks: Task[],
  onLoaded: (start: Date, end: Date) => void,
): GanttData {
  const [milestones, setMilestones] = useState<MilestoneResult[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);

  const milestonesRef = useRef(milestones);
  milestonesRef.current = milestones;
  const sprintsRef = useRef(sprints);
  sprintsRef.current = sprints;
  const productRef = useRef(product);
  productRef.current = product;

  useEffect(() => {
    if (!activeProduct) return;
    setLoading(true);
    Promise.all([
      api.milestones.list(activeProduct.id),
      api.sprints.list(activeProduct.id),
    ])
      .then(([{ milestones: ms, product: p }, sprintList]) => {
        setMilestones(ms);
        setSprints(sprintList);
        setProduct(p);
        const start = new Date(p?.createdAt ?? activeProduct.createdAt);
        const end = new Date(p?.deadline ?? activeProduct.deadline);
        onLoaded(start, end);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct, tasks]);

  return { milestones, sprints, product, loading, setMilestones, setSprints, setProduct, milestonesRef, sprintsRef, productRef };
}
