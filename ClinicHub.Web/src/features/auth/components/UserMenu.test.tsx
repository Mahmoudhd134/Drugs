import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {aClinicContext, aMe, renderWithProviders} from "../../../test";
import {registerLeaveCheck} from "../../printTemplates/unsavedGuard.ts";
import {UserMenu} from "./UserMenu.tsx";

// The account menu: docs/features/auth/tech.md "Frontend" (AppLayout: UserMenu).


const clinicA = aClinicContext({clinicId: 1, clinicName: "Clinic A"});
const clinicB = aClinicContext({clinicId: 2, clinicName: "Clinic B"});
const me = aMe({context: clinicA, staff: {id: 7, fullName: "Dr. Sara"}, user: {id: 1, phone: "+201001234567", isSuperAdmin: false}});

const openMenu = async (contexts = [clinicA]) => {
    const rendered = await renderWithProviders(<UserMenu/>, {lang: "ar", user: {context: clinicA, contexts, me}});
    await rendered.user.click(screen.getByRole("button", {name: "الحساب"}));
    return {...rendered, menu: await screen.findByRole("menu")};
};

describe("account menu @area:auth", () => {
    test("shows the staff name and phone, «تبديل العيادة» with several contexts, and «تسجيل الخروج» @AUTH-178", async () => {
        const {menu, user, location, auth} = await openMenu([clinicA, clinicB]);
        expect(within(menu).getByText("Dr. Sara")).toBeInTheDocument();
        const phone = within(menu).getByText("+201001234567");
        // A phone stays left to right in Arabic
        expect(phone).toHaveAttribute("dir", "ltr");
        expect(within(menu).getByRole("menuitem", {name: "تسجيل الخروج"})).toBeInTheDocument();

        await user.click(within(menu).getByRole("menuitem", {name: "تبديل العيادة"}));
        expect(location().pathname).toBe("/select-clinic");
        expect(auth.logout).not.toHaveBeenCalled();
    });

    test("with one context: no «تبديل العيادة»; «تسجيل الخروج» logs out @AUTH-178", async () => {
        const {menu, user, auth} = await openMenu([clinicA]);
        expect(within(menu).queryByRole("menuitem", {name: "تبديل العيادة"})).not.toBeInTheDocument();
        await user.click(within(menu).getByRole("menuitem", {name: "تسجيل الخروج"}));
        await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
    });

    test("a screen with unsaved changes answers first: staying doesn't log out, leaving does @TPL-248", async () => {
        const answers: ((leave: boolean) => void)[] = [];
        const unregister = registerLeaveCheck(() => new Promise<boolean>(resolve => answers.push(resolve)));
        try {
            const {menu, user, auth} = await openMenu([clinicA]);
            await user.click(within(menu).getByRole("menuitem", {name: "تسجيل الخروج"}));
            await waitFor(() => expect(answers).toHaveLength(1));
            expect(auth.logout).not.toHaveBeenCalled();

            answers[0](false);
            await new Promise(resolve => setTimeout(resolve));
            expect(auth.logout).not.toHaveBeenCalled();

            await user.click(screen.getByRole("button", {name: "الحساب"}));
            await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", {name: "تسجيل الخروج"}));
            await waitFor(() => expect(answers).toHaveLength(2));
            answers[1](true);
            await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
        } finally {
            unregister();
        }
    });
});
