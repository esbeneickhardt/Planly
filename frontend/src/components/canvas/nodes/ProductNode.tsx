import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface ProductData { name: string; emoji?: string; deadline: string; }

export default memo(function ProductNode({ data, selected }: NodeProps<ProductData>) {
  return (
    <div
      style={{
        background: 'var(--brand)',
        border: `2px solid ${selected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}`,
        borderRadius: 12,
        width: 200,
        padding: '12px 16px',
        boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
        color: 'white',
        textAlign: 'center',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ width: 12, height: 12, background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.8)', left: -7 }} />
      {data.emoji && <div style={{ fontSize: 24, marginBottom: 4 }}>{data.emoji}</div>}
      <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{data.name}</p>
      <p style={{ fontSize: 11, opacity: 0.7, marginTop: 4, marginBottom: 0 }}>
        Due {new Date(data.deadline).toLocaleDateString()}
      </p>
    </div>
  );
});
