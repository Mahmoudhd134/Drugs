import type {ReactNode} from "react";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {restrictToParentElement, restrictToVerticalAxis} from "@dnd-kit/modifiers";
import {CSS} from "@dnd-kit/utilities";
import {Box, IconButton, Stack, Tooltip} from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {useTranslation} from "react-i18next";

type Props<T> = {
    items: T[];
    getId: (item: T) => string | number;
    onReorder: (items: T[]) => void;
    /** Renders the row content; the drag handle is added automatically */
    renderItem: (item: T, index: number) => ReactNode;
};

/** Vertical list reorderable by mouse, touch or keyboard (focus the handle, Space, arrows, Space). */
export const SortableList = <T, >({items, getId, onReorder, renderItem}: Props<T>) => {
    const sensors = useSensors(
        // A small movement is needed before dragging so buttons inside rows still click
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates})
    );
    const ids = items.map(getId);

    const handleDragEnd = ({active, over}: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(active.id);
        const to = ids.indexOf(over.id);
        if (from !== -1 && to !== -1) onReorder(arrayMove(items, from, to));
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <Stack sx={{gap: 1}}>
                    {items.map((item, index) => (
                        <SortableRow key={ids[index]} id={ids[index]}>
                            {renderItem(item, index)}
                        </SortableRow>
                    ))}
                </Stack>
            </SortableContext>
        </DndContext>
    );
};

const SortableRow = ({id, children}: { id: string | number; children: ReactNode }) => {
    const {t} = useTranslation();
    const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} =
        useSortable({id});

    return (
        <Box
            ref={setNodeRef}
            style={{transform: CSS.Translate.toString(transform), transition}}
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                bgcolor: "background.paper",
                border: 1,
                borderColor: isDragging ? "primary.main" : "divider",
                borderRadius: 2,
                boxShadow: isDragging ? 6 : 0,
                position: "relative",
                zIndex: isDragging ? 1 : 0,
                py: 1,
                pe: 1,
                ps: 0.5,
            }}
        >
            <Tooltip title={t("common.dragToReorder")}>
                <IconButton
                    ref={setActivatorNodeRef}
                    size="small"
                    {...attributes}
                    {...listeners}
                    sx={{cursor: isDragging ? "grabbing" : "grab", touchAction: "none", color: "text.disabled"}}
                >
                    <DragIndicatorIcon fontSize="small"/>
                </IconButton>
            </Tooltip>
            <Box sx={{flex: 1, minWidth: 0}}>{children}</Box>
        </Box>
    );
};
