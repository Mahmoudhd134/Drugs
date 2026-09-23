import {useState} from "react";
import {DisplaySelected} from "./DisplaySelected.tsx";
import ChooseDrag from "../../../components/drags/ChoseDrag.tsx";
import type {Drag} from "../../../typs/drag.ts";

export const List = () => {
    const [selectedDrags, setSelectedDrags] = useState<Drag[]>([]);
    const addDrag = (drag: Drag) => setSelectedDrags(p => [...p, drag])
    const deleteDrag = (drag: Drag) => setSelectedDrags(p => p.filter(d => d.id !== drag.id))
    const clearAll = () => setSelectedDrags([])


    return <div>
        <div className="flex flex-wrap justify-between">
            <div className="w-full md:w-1/2 p-3">
                <ChooseDrag onSelect={addDrag}/>
            </div>
            <div className="w-full md:w-1/2 p-3">
                <DisplaySelected drags={selectedDrags} onDelete={deleteDrag} onReorder={setSelectedDrags} clearAll={clearAll}/>
            </div>
        </div>

    </div>
};