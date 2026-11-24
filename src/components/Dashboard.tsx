import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { ChartConfig, Dataset } from '../types';
import { ChartWidget } from './ChartWidget';

interface Props {
  charts: ChartConfig[];
  datasets: Dataset[];
  onReorder: (charts: ChartConfig[]) => void;
  onChange: (cfg: ChartConfig) => void;
  onEdit: (cfg: ChartConfig) => void;
  onDuplicate: (cfg: ChartConfig) => void;
  onDelete: (cfg: ChartConfig) => void;
  onRefine?: (cfg: ChartConfig) => void;
}

export function Dashboard({ charts, datasets, onReorder, onChange, onEdit, onDuplicate, onDelete, onRefine }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = charts.findIndex((c) => c.id === active.id);
    const to = charts.findIndex((c) => c.id === over.id);
    if (from !== -1 && to !== -1) onReorder(arrayMove(charts, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={charts.map((c) => c.id)} strategy={rectSortingStrategy}>
        <div className="dashboard-grid">
          {charts.map((c) => (
            <ChartWidget
              key={c.id}
              config={c}
              dataset={datasets.find((d) => d.id === c.datasetId)}
              onChange={onChange}
              onEdit={() => onEdit(c)}
              onDuplicate={() => onDuplicate(c)}
              onDelete={() => onDelete(c)}
              onRefine={onRefine ? () => onRefine(c) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
