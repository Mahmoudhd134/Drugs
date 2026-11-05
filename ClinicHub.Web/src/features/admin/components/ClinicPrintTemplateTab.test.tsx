import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {aClinicDetails, adminClinicsHandlers, printTemplateHandlers, server} from "../../../test";
import {renderAdmin} from "../../../test/pages/admin.tsx";
import {tabPath} from "../../../test/pages/printTemplate.tsx";

// The clinic page's tab: contract § 2.1; business.md «يفتح صفحة العيادة ثم تبويب «قالب الطباعة»».

const openOverview = async (lang: "ar" | "en") => {
    const clinic = aClinicDetails();
    server.use(...adminClinicsHandlers([clinic]), ...printTemplateHandlers(clinic.id));
    const rendered = await renderAdmin(`/admin/clinics/${clinic.id}`, {dataRouter: true, lang});
    await screen.findByRole("tablist");
    return {...rendered, clinic};
};

describe("the print template tab @area:admin", () => {
    test.each([
        ["ar" as const, ["نظرة عامة", "الأدوار", "الموظفون", "قالب الطباعة"], "قالب الطباعة", "لا يوجد قالب طباعة لهذه العيادة."],
        ["en" as const, ["Overview", "Roles", "Staff", "Print template"], "Print template", "This clinic has no print template."],
    ])("%s: listed after Staff, and it opens at its own URL @TPL-040", async (lang, tabs, tab, empty) => {
        const {user, clinic, location} = await openOverview(lang);
        const list = within(screen.getByRole("tablist"));

        expect(list.getAllByRole("tab").map(t => t.textContent)).toEqual(tabs);
        const printTemplate = list.getByRole("tab", {name: tab});
        expect(printTemplate).toHaveAttribute("href", tabPath(clinic.id));

        await user.click(printTemplate);

        await waitFor(() => expect(location().pathname).toBe(tabPath(clinic.id)));
        expect(list.getByRole("tab", {name: tab})).toHaveAttribute("aria-selected", "true");
        expect(await screen.findByText(empty)).toBeInTheDocument();
    });
});
