import {BrowserRouter, Routes, Route, Outlet, Link, useLocation} from "react-router-dom";
import {Toaster} from "react-hot-toast";
import {List} from "./pages/drags/List/List.tsx";
import ManageDrags from "./pages/drags/Manage/ManageDrags.tsx";
import {AppBar, Toolbar, Button, Typography} from "@mui/material";

export default () => {
    return (
        <BrowserRouter>
            <Toaster position="bottom-center"/>
            <Routes>
                <Route path={'/'} element={<Layout/>}>
                    <Route index element={<List/>}/>
                    <Route path="manage" element={<ManageDrags/>}/>
                </Route>
            </Routes>
        </BrowserRouter>
    );
};

const Layout = () => {
    const location = useLocation();

    const navItems = [
        {name: "List", path: "/"},
        {name: "Manage Drags", path: "/manage"},
    ];

    return (
        <div className="min-h-screen flex flex-col">
            {/* Navigation bar */}
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{flexGrow: 1}}>
                        Drags App
                    </Typography>

                    {navItems.map((item) => (
                        <Button
                            key={item.path}
                            component={Link}
                            to={item.path}
                            color={location.pathname === item.path ? "secondary" : "inherit"}
                            sx={{ml: 2}}
                        >
                            {item.name}
                        </Button>
                    ))}
                </Toolbar>
            </AppBar>

            {/* Page content */}
            <main style={{flexGrow: 1, padding: "16px"}}>
                <Outlet/>
            </main>
        </div>
    );
};
