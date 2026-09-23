import {useState, useEffect} from "react";
import {TextField, Button, Box, Typography, Paper} from "@mui/material";
import toast from "react-hot-toast";
import type {Drag} from "../../../typs/drag.ts";
import {useAxios} from "../../../api/useAxios.ts";

type Props = {
    selectedDrag: Drag | null;
    onClear: () => void;
    refreshDrags: () => void
};


export const DragForm = ({selectedDrag, onClear, refreshDrags}: Props) => {
    const axios = useAxios();
    const [formData, setFormData] = useState({
        name: "",
        description: "",
    });
    const [isLoading, setIsLoading] = useState(false);

    // Populate form when a drag is selected
    useEffect(() => {
        if (selectedDrag) {
            setFormData({
                name: selectedDrag.name,
                description: selectedDrag.description || "",
            });
        } else {
            setFormData({
                name: "",
                description: "",
            });
        }
    }, [selectedDrag]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const {name, value} = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleClear = () => {
        setFormData({
            name: "",
            description: "",
        });
        onClear();
        refreshDrags()
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            toast.error("Name is required");
            return;
        }

        setIsLoading(true);

        try {
            if (selectedDrag) {
                // Update existing drag
                await axios.put(`/Drags/${selectedDrag.id}`, {
                    id: selectedDrag.id,
                    name: formData.name,
                    description: formData.description,
                });

                toast.success("Drag updated successfully");
                handleClear();
            } else {
                // Create new drag
                await axios.post("/Drags", {
                    id: 0, // Backend will assign the ID
                    name: formData.name,
                    description: formData.description,
                });

                toast.success("Drag created successfully");
                handleClear();
            }
            refreshDrags()
        } catch (error) {
            console.error("Error saving drag:", error);
            toast.error("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedDrag) return;

        if (!window.confirm(`Are you sure you want to delete "${selectedDrag.name}"?`)) {
            return;
        }

        setIsLoading(true);

        try {
            await axios.delete(`/Drags/${selectedDrag.id}`);

            toast.success("Drag deleted successfully");
            handleClear();
            refreshDrags()
        } catch (error) {
            console.error("Error deleting drag:", error);
            toast.error("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Paper elevation={2} sx={{p: 3}}>
            <Typography variant="h6" gutterBottom>
                {selectedDrag ? "Edit Drag" : "Create New Drag"}
            </Typography>

            <form onSubmit={handleSubmit}>
                <Box sx={{display: "flex", flexDirection: "column", gap: 2, mt: 2}}>
                    <TextField
                        label="Name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        fullWidth
                        disabled={isLoading}
                    />

                    <TextField
                        label="Description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        multiline
                        rows={4}
                        fullWidth
                        disabled={isLoading}
                    />

                    <Box sx={{display: "flex", gap: 2, mt: 2}}>
                        <Button
                            type="submit"
                            variant="contained"
                            color="primary"
                            disabled={isLoading}
                            fullWidth
                        >
                            {selectedDrag ? "Update" : "Create"}
                        </Button>

                        {selectedDrag && (
                            <Button
                                type="button"
                                variant="contained"
                                color="error"
                                onClick={handleDelete}
                                disabled={isLoading}
                                fullWidth
                            >
                                Delete
                            </Button>
                        )}

                        <Button
                            type="button"
                            variant="outlined"
                            onClick={handleClear}
                            disabled={isLoading}
                            fullWidth
                        >
                            Clear
                        </Button>
                    </Box>
                </Box>
            </form>
        </Paper>
    );
};