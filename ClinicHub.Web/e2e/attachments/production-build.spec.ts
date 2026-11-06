import fs from "node:fs";
import path from "node:path";
import {expect, test} from "../support/fixtures.ts";
import {apiProject} from "../support/run.ts";

/** What only the harness page holds: its folder's name, its heading, and the name of its global. */
const HARNESS_MARKS = ["__harness", "Attachments harness", "__attachmentsHarness"];
const TEXT_FILE = /\.(html|js|css|json|map|txt|webmanifest)$/;

test.describe("Attachments: the production build @area:attachments", () => {
    test("ClinicHub.Api/wwwroot, read from disk (only the run's copy holds the harness): the harness page isn't in it @ATT-255", async () => {
        const wwwroot = path.join(apiProject, "wwwroot");
        expect(fs.existsSync(path.join(wwwroot, "index.html")), `${wwwroot} holds the production build`).toBe(true);

        const files = fs.readdirSync(wwwroot, {recursive: true, encoding: "utf8"}).map(file => file.replaceAll("\\", "/"));
        expect(files.filter(file => /harness/i.test(file)), "no file or folder of the harness").toEqual([]);

        const holding = files.filter(file => TEXT_FILE.test(file)).filter(file => {
            const text = fs.readFileSync(path.join(wwwroot, file), "utf8");
            return HARNESS_MARKS.some(mark => text.includes(mark));
        });
        expect(holding, "no built file holds the harness page's code").toEqual([]);
    });
});
