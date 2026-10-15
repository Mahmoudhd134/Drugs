/** Design M1.5 § 6; the template and deleted clinics never appear. */
export type ClinicStatus = "active" | "suspended";

export type ClinicSummary = {
    id: number;
    name: string;
    status: ClinicStatus;
    /** Active staff */
    staffCount: number;
    /** ISO UTC */
    createdAt: string;
};

export type ClinicOwner = { staffId: number; fullName: string; phone: string };

export type ClinicDetails = ClinicSummary & {
    /** Active staff holding the Owner role, by name */
    owners: ClinicOwner[];
};

export type CreateClinic = { name: string; owner: { phone: string; fullName: string } };
