import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {http} from "msw";
import {
    aDrug,
    aGroup,
    anItem,
    api,
    findToast,
    isRed,
    problem,
    recordRequests,
    renderWithProviders,
    server,
} from "../../../test";
import type {DrugGroup} from "../types.ts";
import {DrugGroupEditorPage} from "./DrugGroupEditorPage.tsx";
import {
    discardDialog,
    layoutSortableRows,
    lineRows,
    lineSummary,
    openEditor,
} from "../../../test/pages/groupEditor.tsx";

// The group editor's save, load and leave: docs/features/drug-groups/business.md ("القواعد", "الرسائل", "تعديل أو
// حذف مجموعة") and tech.md "Frontend" (client checks, eye clash, unsaved-changes guard), docs/tech/overview.md
// "App shell" and "Data fetching" (errors.<code>, else errors.generic).

const nameField = () => screen.getByRole("textbox", {name: "اسم المجموعة"});
const saveButton = () => screen.getByRole("button", {name: "حفظ"});
const twoDrugGroup = () => aGroup({name: "Post cataract", items: [anItem(aDrug({name: "Tobradex"})), anItem(aDrug({name: "Vigamox"}))]});

/** Moves line `from` (1-based) by `steps` places with dnd-kit's keyboard sensor (Space, arrows, Space). */
const moveLine = async (user: UserEvent, from: number, steps: number) => {
    const handle = screen.getAllByRole("button", {name: "اسحب لتغيير الترتيب"})[from - 1];
    handle.focus();
    await user.keyboard(" ");
    await user.keyboard(steps > 0 ? "{ArrowDown>" + steps + "/}" : "{ArrowUp>" + -steps + "/}");
    await user.keyboard(" ");
    await waitFor(() => expect(screen.queryByRole("button", {pressed: true})).not.toBeInTheDocument());
};

describe("group editor: opening @area:catalog", () => {
    test("new group: title «مجموعة جديدة», the focus in the name, «لا توجد أدوية في هذه المجموعة» @GRP-047", async () => {
        await openEditor();
        expect(screen.getByRole("heading", {level: 1, name: "مجموعة جديدة"})).toBeInTheDocument();
        expect(nameField()).toHaveFocus();
        expect(nameField()).toHaveValue("");
        expect(screen.getByText("لا توجد أدوية في هذه المجموعة")).toBeInTheDocument();
    });

    test("in English: \"New group\" and \"No drugs in this group\" @GRP-047", async () => {
        await openEditor({lang: "en"});
        expect(screen.getByRole("heading", {level: 1, name: "New group"})).toBeInTheDocument();
        expect(screen.getByText("No drugs in this group")).toBeInTheDocument();
    });

    test("an existing group: title «تعديل المجموعة», the name and lines pre-filled @GRP-059", async () => {
        await openEditor({group: twoDrugGroup()});
        expect(screen.getByRole("heading", {level: 1, name: "تعديل المجموعة"})).toBeInTheDocument();
        expect(nameField()).toHaveValue("Post cataract");
        expect(lineSummary()).toEqual([["1", "Tobradex"], ["2", "Vigamox"]]);
    });

    test("in English the title reads \"Edit group\" @GRP-059", async () => {
        await openEditor({group: twoDrugGroup(), lang: "en"});
        expect(screen.getByRole("heading", {level: 1, name: "Edit group"})).toBeInTheDocument();
    });

    test("`/groups/abc` and `/groups/1.5` redirect to `/groups` @GRP-060", async () => {
        for (const route of ["/groups/abc", "/groups/1.5"]) {
            const recorded = recordRequests();
            const {location, unmount} = await renderWithProviders(<DrugGroupEditorPage/>, {route, path: "/groups/:id"});
            await waitFor(() => expect(location().pathname).toBe("/groups"));
            expect(recorded.requests).toEqual([]);
            recorded.stop();
            unmount();
        }
    });
});

describe("group editor: checks before saving @area:catalog", () => {
    test("an empty or spaces-only name: «الاسم مطلوب.» on the name, no request @GRP-049", async () => {
        const recorded = recordRequests();
        const {user} = await openEditor({drugs: [aDrug({name: "Tobradex"})]});
        await user.click(await screen.findByText("Tobradex"));
        await user.click(saveButton());
        expect(isRed(nameField())).toBe(true);
        expect(nameField()).toHaveAccessibleDescription("الاسم مطلوب.");
        await user.type(nameField(), "   ");
        await user.click(saveButton());
        expect(nameField()).toHaveAccessibleDescription("الاسم مطلوب.");
        expect(recorded.writes()).toEqual([]);
    });

    test("in English the empty name reads \"Name is required.\" @GRP-049", async () => {
        const {user} = await openEditor({lang: "en"});
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(screen.getByRole("textbox", {name: "Group name"})).toHaveAccessibleDescription("Name is required.");
    });

    test("a name and no drugs: the error toast «أضف دواءً واحدًا على الأقل.», no request @GRP-050", async () => {
        const recorded = recordRequests();
        const {user} = await openEditor();
        await user.type(nameField(), "Post cataract");
        await user.click(saveButton());
        expect(await findToast()).toBe("أضف دواءً واحدًا على الأقل.");
        expect(recorded.writes()).toEqual([]);
    });

    test("in English: \"Add at least one drug.\" @GRP-050", async () => {
        const {user} = await openEditor({lang: "en"});
        await user.type(screen.getByRole("textbox", {name: "Group name"}), "Post cataract");
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe("Add at least one drug.");
    });
});

describe("group editor: API refusals @area:catalog", () => {
    test("`duplicateGroupItem` from the API: «يوجد دواء مكرر في المجموعة لنفس العين.» @GRP-035", async () => {
        const group = twoDrugGroup();
        const {user} = await openEditor({group});
        server.use(http.put(api("/drug-groups/:id"), () => problem(400, "duplicateGroupItem", {errors: [{code: "duplicateGroupItem", field: "items"}]})));
        await user.click(saveButton());
        expect(await findToast()).toBe("يوجد دواء مكرر في المجموعة لنفس العين.");
        expect(nameField()).toBeInTheDocument();
    });

    test("in English: \"A drug is in the group twice for the same eye.\" @GRP-035", async () => {
        const {user} = await openEditor({group: twoDrugGroup(), lang: "en"});
        server.use(http.put(api("/drug-groups/:id"), () => problem(400, "duplicateGroupItem", {errors: [{code: "duplicateGroupItem", field: "items"}]})));
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe("A drug is in the group twice for the same eye.");
    });
});

describe("group editor: the group deleted meanwhile @area:catalog", () => {
    test.each([
        ["ar", "هذا العنصر لم يعد موجودًا.", "حفظ"],
        ["en", "This item no longer exists.", "Save"],
    ] as const)("deleted in another window (%s), Save: the toast %s @GRP-063", async (lang, message, save) => {
        const {user} = await openEditor({group: twoDrugGroup(), lang});
        server.use(http.put(api("/drug-groups/:id"), () => problem(404, "notFound")));
        await user.click(screen.getByRole("button", {name: save}));
        expect(await findToast()).toBe(message);
    });
});

describe("group editor: two lines of a drug for the same eye @area:catalog", () => {
    // Saved when the drug's default eye was left; it is right now, so both lines give the right eye
    const clashGroup = (): DrugGroup => {
        const drug = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop", eye: "right"}});
        return aGroup({items: [anItem(drug), anItem(drug, {eye: "right", frequency: "daily", frequencyValue: 2}), anItem(aDrug({name: "Vigamox"}))]});
    };
    const clashText = "يوجد دواء مكرر في المجموعة لنفس العين (مُعلَّم بالأسفل). احذف أحد السطرين أو غيّر العين، ثم احفظ.";

    test("Save shows the clash text as an error toast and sends nothing; after removing a line the marks go and it saves @GRP-085", async () => {
        const recorded = recordRequests();
        const {user, location} = await openEditor({group: clashGroup()});
        const marked = () => lineRows().filter(row => within(row).queryByText("نفس الدواء والعين في سطر آخر"));
        expect(marked()).toHaveLength(2);
        expect(screen.getByRole("alert")).toHaveTextContent(clashText);

        await user.click(saveButton());
        expect(await findToast()).toBe(clashText);
        expect(recorded.writes()).toEqual([]);

        await user.click(within(lineRows()[1]).getByRole("button", {name: "إزالة"}));
        expect(marked()).toHaveLength(0);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        await user.click(saveButton());
        // The success toast first: it leaves after 2 s, which a busy machine can spend waiting for the navigation
        expect(await findToast()).toBe("تم تحديث المجموعة");
        await waitFor(() => expect(location().pathname).toBe("/groups"));
        expect(recorded.writes()).toHaveLength(1);
    });

    test("in English: \"Same drug and eye as another line\" and the clash text on Save @GRP-085", async () => {
        const {user} = await openEditor({group: clashGroup(), lang: "en"});
        const text = "A drug is in the group twice for the same eye (marked below). Remove a line or change its eye, then save.";
        expect(screen.getAllByText("Same drug and eye as another line")).toHaveLength(2);
        expect(screen.getByRole("alert")).toHaveTextContent(text);
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe(text);
    });

    test("without `groups.update` the chips show but not the alert @GRP-086", async () => {
        await openEditor({group: clashGroup(), permissions: ["groups.list", "groups.details", "drugs.list"]});
        expect(screen.getByRole("heading", {level: 1, name: "المجموعة"})).toBeInTheDocument();
        expect(screen.getAllByText("نفس الدواء والعين في سطر آخر")).toHaveLength(2);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.queryByText(clashText)).not.toBeInTheDocument();
    });
});

describe("group editor: the unsaved-changes guard @area:catalog", () => {
    const back = (user: UserEvent) => user.click(screen.getByRole("button", {name: "رجوع"}));

    test("no changes: «رجوع» leaves without asking @GRP-090", async () => {
        const {user, location} = await openEditor({group: twoDrugGroup()});
        await back(user);
        await waitFor(() => expect(location().pathname).toBe("/groups"));
        expect(discardDialog()).not.toBeInTheDocument();
    });

    test("in English the question reads \"Discard changes?\" / \"Your unsaved changes to this group will be lost.\" @GRP-092", async () => {
        const {user} = await openEditor({group: twoDrugGroup(), lang: "en"});
        await user.type(screen.getByRole("textbox", {name: "Group name"}), " 2");
        await user.click(screen.getByRole("button", {name: "Back"}));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading", {name: "Discard changes?"})).toBeInTheDocument();
        expect(dialog).toHaveTextContent("Your unsaved changes to this group will be lost.");
        expect(within(dialog).getByRole("button", {name: "Discard"})).toBeInTheDocument();
    });

    const undone: [string, (user: UserEvent) => Promise<void>][] = [
        ["name edited back", async user => {
            await user.type(nameField(), "x");
            await user.type(nameField(), "{Backspace}");
        }],
        ["name with trailing spaces", user => user.type(nameField(), "   ")],
        ["override set then reset", async user => {
            for (const button of ["اليسرى", "استخدام جرعة الدواء الافتراضية"]) {
                await user.click(within(lineRows()[0]).getByRole("button", {name: "تعديل الجرعة"}));
                const dialog = within(await screen.findByRole("dialog"));
                await user.click(dialog.getByRole("button", {name: button}));
                await user.click(dialog.getByRole("button", {name: "حفظ"}));
                await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            }
            expect(within(lineRows()[0]).queryByText("جرعة خاصة بالمجموعة")).not.toBeInTheDocument();
        }],
        ["line moved away and back", async user => {
            await moveLine(user, 1, 1);
            expect(lineSummary()).toEqual([["1", "Vigamox"], ["2", "Tobradex"]]);
            await moveLine(user, 2, -1);
            expect(lineSummary()).toEqual([["1", "Tobradex"], ["2", "Vigamox"]]);
        }],
    ];
    test.each(undone)("a change undone by hand (%s): «رجوع» leaves without asking @GRP-091", async (_, undo) => {
        layoutSortableRows();
        const {user, location} = await openEditor({group: twoDrugGroup()});
        await undo(user);
        await back(user);
        await waitFor(() => expect(location().pathname).toBe("/groups"));
        expect(discardDialog()).not.toBeInTheDocument();
    });

    const changes: [string, (user: UserEvent) => Promise<void>][] = [
        ["name", user => user.type(nameField(), " 2")],
        ["add", async user => user.click(await screen.findByText("Pred Forte"))],
        ["remove", user => user.click(within(lineRows()[1]).getByRole("button", {name: "إزالة"}))],
        ["reorder", async user => {
            await moveLine(user, 2, -1);
            expect(lineSummary()).toEqual([["1", "Vigamox"], ["2", "Tobradex"]]);
        }],
        ["override", async user => {
            await user.click(within(lineRows()[0]).getByRole("button", {name: "تعديل الجرعة"}));
            const dialog = within(await screen.findByRole("dialog"));
            await user.click(dialog.getByRole("button", {name: "اليمنى"}));
            await user.click(dialog.getByRole("button", {name: "حفظ"}));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        }],
    ];
    test.each(changes)("a change of the %s alone asks «تجاهل التغييرات؟» on «رجوع» @GRP-092", async (kind, change) => {
        layoutSortableRows();
        const group = twoDrugGroup();
        const {user, location} = await openEditor({group, drugs: [...group.items.map(i => i.drug), aDrug({name: "Pred Forte"})]});
        await change(user);
        await back(user);
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading", {name: "تجاهل التغييرات؟"}), kind).toBeInTheDocument();
        expect(dialog).toHaveTextContent("ستفقد التغييرات غير المحفوظة على هذه المجموعة.");
        expect(within(dialog).getByRole("button", {name: "تجاهل"})).toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", {name: "إلغاء"}));
        await waitFor(() => expect(discardDialog()).not.toBeInTheDocument());
        expect(location().pathname, kind).toBe(`/groups/${group.id}`);
    });
});
