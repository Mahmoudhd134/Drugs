import {
    DndContext,
    DragOverlay,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {useState} from "react";
import {EditAndCopyModal} from "./EditAndCopyModal.tsx";
import {Button} from "@mui/material";
import type {Drag} from "../../../typs/drag.ts";

type Props = {
    drags: Drag[];
    onDelete: (drag: Drag) => void;
    onReorder: (drags: Drag[]) => void;
    clearAll: () => void
};

// Stable sortable id for a drag at a given position (ids may repeat in the list)
const sortId = (drag: Drag, index: number) => `${drag.id}-${index}`;

export const DisplaySelected = ({drags, onDelete, onReorder, clearAll}: Props) => {
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            // Require a small movement before a drag starts so clicks (e.g. delete) still work
            activationConstraint: {distance: 5},
        })
    );

    const items = drags.map((d, i) => sortId(d, i));

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        const {active, over} = event;
        if (!over || active.id === over.id) return;

        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return;

        const newOrder = arrayMove(drags, oldIndex, newIndex);
        onReorder(newOrder);
    };

    const activeIndex = activeId ? items.indexOf(activeId) : -1;
    const activeDrag = activeIndex !== -1 ? drags[activeIndex] : null;

    return (
        <div className="p-2">
            <h3 className="font-semibold text-lg mb-3">Selected Drags</h3>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveId(null)}
            >
                <SortableContext
                    items={items}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="flex flex-col gap-3">
                        {drags.map((drag, i) => (
                            <SortableItem
                                key={sortId(drag, i)}
                                id={sortId(drag, i)}
                                drag={drag}
                                onDelete={onDelete}
                            />
                        ))}
                    </div>
                </SortableContext>

                {/* Floating copy that follows the cursor so you can see what you're dragging */}
                <DragOverlay>
                    {activeDrag ? <DragCard drag={activeDrag} dragging/> : null}
                </DragOverlay>
            </DndContext>


            <div className={'flex justify-between'}>
                <EditAndCopyModal drags={drags}/>
            <Button variant="contained" color="warning" onClick={clearAll} sx={{mt: 2}}>
                Clear All
            </Button>

            </div>
        </div>
    );
};

type SortableItemProps = {
    id: string;
    drag: Drag;
    onDelete: (drag: Drag) => void;
};

const SortableItem = ({id, drag, onDelete}: SortableItemProps) => {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
        useSortable({id});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        // Dim the original while its overlay copy is being dragged
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className="flex items-center justify-between bg-white border border-gray-200 shadow-sm rounded-lg p-3"
        >
            {/* Drag handle - only this part is draggable */}
            <div {...listeners} className="flex-1 cursor-grab active:cursor-grabbing">
                <p className="font-medium">{drag.name}</p>
                {drag.description && (
                    <p className="text-sm text-gray-500">{drag.description}</p>
                )}
            </div>

            {/* Delete button - NOT part of drag listeners */}
            <button
                className="text-red-500 hover:text-red-700 font-semibold px-2"
                onClick={(e) => {
                    e.stopPropagation(); // Extra safety to prevent event bubbling
                    onDelete(drag);
                }}
            >
                ✕
            </button>
        </div>
    );
};

type DragCardProps = {
    drag: Drag;
    dragging?: boolean;
};

// Presentational card reused by the DragOverlay
const DragCard = ({drag, dragging}: DragCardProps) => (
    <div
        className={
            "flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3 " +
            (dragging ? "shadow-lg ring-2 ring-blue-400 cursor-grabbing" : "shadow-sm")
        }
    >
        <div className="flex-1">
            <p className="font-medium">{drag.name}</p>
            {drag.description && (
                <p className="text-sm text-gray-500">{drag.description}</p>
            )}
        </div>
        <span className="text-red-500 font-semibold px-2">✕</span>
    </div>
);
