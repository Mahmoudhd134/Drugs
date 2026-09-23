import {useState, useEffect} from "react";
import type {Drag} from "../../typs/drag.ts";
import {useAxios} from "../../api/useAxios.ts";


interface ChooseDragProps {
    onSelect: (drag: Drag) => void;
    refreshKey?: number
}

export default function ChooseDrag({onSelect, refreshKey}: ChooseDragProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Drag[]>([]);
    const [loading, setLoading] = useState(false);
    const axios = useAxios();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await axios.get<Drag[]>("/drags", {
                    params: {name: query, pageSize: 50},
                });
                setResults(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(fetchData, 300); // debounce
        return () => clearTimeout(timer);
    }, [query, axios, refreshKey]);

    return (
        <div className="w-full max-w-md">
            <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded"
                placeholder="Type drag name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />

            {loading && <div className="mt-1 text-gray-500">Loading...</div>}

            {!loading && results.length > 0 && (
                <ul className="mt-2 border border-gray-300 rounded bg-white shadow-md max-h-[70vh] overflow-y-auto">
                    {results.map((drag) => (
                        <li
                            key={drag.id}
                            className="p-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => {
                                onSelect(drag);
                                setQuery("");
                            }}
                        >
                            <p><b>{drag.name}</b></p>
                            <p>{drag.description}</p>
                        </li>
                    ))}
                </ul>
            )}

            {!loading && results.length === 0 && query.trim() && (
                <div className="mt-2 p-2 text-gray-500 text-center">
                    No drags found
                </div>
            )}
        </div>
    );
}