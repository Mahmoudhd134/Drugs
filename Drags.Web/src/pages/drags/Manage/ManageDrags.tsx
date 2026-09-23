import {useState} from "react";
import ChooseDrag from "../../../components/drags/ChoseDrag.tsx";
import type {Drag} from "../../../typs/drag.ts";
import {DragForm} from "./ManageForm.tsx";

const ManageDrags = () => {
    const [selectedDrag, setSelectedDrag] = useState<Drag | null>(null);
    const [refreshDragsKey, setRefreshDragsKey] = useState(0);
    const handleSelect = (drag: Drag) => {
        setSelectedDrag(drag);
    };

    const refreshDrags = () => setRefreshDragsKey(p => p + 1)

    const handleClear = () => {
        setSelectedDrag(null);
    };

    return (
        <div>
            <div className="flex flex-wrap justify-between">
                <div className="w-full md:w-1/2 p-3">
                    <ChooseDrag
                        onSelect={handleSelect}
                        refreshKey={refreshDragsKey}
                    />
                </div>
                <div className="w-full md:w-1/2 p-3">
                    <DragForm
                        refreshDrags={refreshDrags}
                        selectedDrag={selectedDrag}
                        onClear={handleClear}
                    />
                </div>
            </div>
        </div>
    );
};

export default ManageDrags;